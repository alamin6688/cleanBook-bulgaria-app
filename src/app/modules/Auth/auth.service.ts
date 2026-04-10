import { Role, OtpPurpose } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import httpStatus from "http-status";
import config from "../../../config";
import ApiError from "../../../errors/apiError";
import emailSender from "../../../helpers/email_sender/emailSender";
import prisma from "../../../lib/prisma";
import { otpEmail } from "../../../shared/emails/otpEmail";
import { passwordResetEmail } from "../../../shared/emails/passwordResetEmail";
import { generateOTP } from "../../../utils/generateOtp";
import { compareItem, hashItem } from "../../../utils/hashAndCompareItem";
import { ITokenPayload, jwtHelpers } from "../../../utils/jwtHelpers";
import {
  IChangePasswordInput,
  IForgotPasswordInput,
  ILoginInput,
  IRefreshTokenInput,
  IResendOtpInput,
  IResetPasswordInput,
  IUser,
  IVerifyEmailInput,
  IVerifyOtpInput,
} from "./auth.interface";

const OTP_EXPIRY_MINUTES = 5;

const client = new OAuth2Client(config.google.client_id);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const saveRefreshToken = async (userId: string, token: string) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days for refresh token

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });
};

const createAndSendOtp = async (email: string, purpose: OtpPurpose, userId: string) => {
  // Invalidate previous unused OTPs for this purpose
  await prisma.otpToken.updateMany({
    where: { userId, purpose, used: false },
    data: { used: true },
  });

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otpToken.create({
    data: { userId, otp, purpose, expiresAt },
  });

  if (purpose === OtpPurpose.EMAIL_VERIFICATION) {
    await emailSender("Email Verification OTP", email, otpEmail(otp));
  } else {
    await emailSender("Password Reset OTP", email, passwordResetEmail(otp));
  }
};

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

const register = async (userData: IUser) => {
  const existingEmail = await prisma.user.findUnique({
    where: { email: userData.email },
  });
  if (existingEmail) {
    throw new ApiError(httpStatus.CONFLICT, "Email is already in use by another account.");
  }

  const existingPhone = await prisma.user.findUnique({
    where: { phone: userData.phone },
  });
  if (existingPhone) {
    throw new ApiError(httpStatus.CONFLICT, "Phone number is already in use by another account.");
  }

  const hashedPassword = await hashItem(userData.password);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          phone: userData.phone,
          role: userData.role,
        },
        select: { id: true, email: true, role: true, isEmailVerified: true },
      });

      if (userData.role === "CLEANER") {
        await tx.cleanerProfile.create({
          data: { userId: newUser.id, displayName: userData.name },
        });
      } else if (userData.role === "CUSTOMER") {
        await tx.customerProfile.create({
          data: { userId: newUser.id, name: userData.name },
        });
      }

      return { ...newUser, name: userData.name };
    });

  // Send verification OTP
  await createAndSendOtp(user.email, OtpPurpose.EMAIL_VERIFICATION, user.id);

  return user;
};

const login = async (loginData: ILoginInput) => {
  const user = await prisma.user.findUnique({
    where: { email: loginData.email },
    include: { customerProfile: true, cleanerProfile: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password.");
  }

  if (!user.isActive) {
    throw new ApiError(httpStatus.FORBIDDEN, "Your account has been deactivated.");
  }

  if (!user.password) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password.");
  }

  const isPasswordValid = await compareItem(loginData.password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password.");
  }

  const payload: ITokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = jwtHelpers.generateAuthTokens(payload);

  await saveRefreshToken(user.id, refreshToken);

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name:
        user.role === "CLEANER"
          ? user.cleanerProfile?.displayName
          : user.customerProfile?.name || user.email.split("@")[0],
      email: user.email,
      role: user.role,
      avatar:
        user.role === "CLEANER"
          ? user.cleanerProfile?.profilePhoto
          : user.customerProfile?.profilePhoto,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

const loginWithGmail = async (idToken: string, role: Role = Role.CUSTOMER) => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.google.client_id,
  });

  const googlePayload = ticket.getPayload();
  if (!googlePayload || !googlePayload.email) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Google token payload.");
  }

  const { email, name, picture } = googlePayload;

  let user = await prisma.user.findUnique({
    where: { email },
    include: { customerProfile: true, cleanerProfile: true },
  });

  let isNewUser = false;

  if (!user) {
    isNewUser = true;

    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          role: role,
          isEmailVerified: true,
        },
      });

      if (role === Role.CLEANER) {
        await tx.cleanerProfile.create({
          data: {
            userId: newUser.id,
            displayName: name || email.split("@")[0],
            profilePhoto: picture,
          },
        });
      } else if (role === Role.CUSTOMER) {
        await tx.customerProfile.create({
          data: {
            userId: newUser.id,
            name: name || email.split("@")[0],
            profilePhoto: picture,
          },
        });
      }

      return await tx.user.findUnique({
        where: { id: newUser.id },
        include: { customerProfile: true, cleanerProfile: true },
      });
    }) as any;
  }

  if (!user) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create or retrieve user profile.");
  }

  if (!user.isActive) {
    throw new ApiError(httpStatus.FORBIDDEN, "User account is suspended.");
  }

  const payload: ITokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = jwtHelpers.generateAuthTokens(payload);

  await saveRefreshToken(user.id, refreshToken);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  return {
    accessToken,
    refreshToken,
    isNewUser,
    user: {
      id: user.id,
      email: user.email,
      name:
        user.role === "CLEANER"
          ? user.cleanerProfile?.displayName
          : user.customerProfile?.name || user.email.split("@")[0],
      role: user.role,
      avatar:
        user.role === "CLEANER"
          ? user.cleanerProfile?.profilePhoto
          : user.customerProfile?.profilePhoto,
      onboardingCompleted: user.onboardingCompleted,
    },
  };
};



const logout = async (accessToken: string, refreshToken?: string) => {
  // Remove refresh token from DB
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }
};

const resendOtp = async ({ email }: { email: string }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  // Find the most recent unused OTP for this user
  const latestOtp = await prisma.otpToken.findFirst({
    where: { userId: user.id, used: false },
    orderBy: { createdAt: "desc" },
  });

  // If there's an active OTP of any type, use its purpose
  const purpose = latestOtp ? latestOtp.purpose : (user.isEmailVerified ? OtpPurpose.PASSWORD_RESET : OtpPurpose.EMAIL_VERIFICATION);

  await createAndSendOtp(email, purpose, user.id);
};

const forgotPassword = async ({ email }: IForgotPasswordInput) => {
  const user = await prisma.user.findUnique({ where: { email } });
  // Return success even if user not found (security: don't confirm email existence)
  if (!user) return;

  await createAndSendOtp(email, OtpPurpose.PASSWORD_RESET, user.id);
};

const verifyOtp = async ({ email, otp }: IVerifyOtpInput) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  const otpRecord = await prisma.otpToken.findFirst({
    where: {
      userId: user.id,
      otp,
      used: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!otpRecord) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or expired OTP.");
  }

  return await prisma.$transaction(async (tx) => {
    await tx.otpToken.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    if (otpRecord.purpose === OtpPurpose.EMAIL_VERIFICATION) {
      await tx.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });

      return {
        message: "Email verified successfully. Please login now!",
        verified: true,
      };
    }

    if (otpRecord.purpose === OtpPurpose.PASSWORD_RESET) {
      const resetToken = jwtHelpers.generateToken(
        { email: user.email },
        config.jwt.secret,
        config.jwt.resetPassTokenExpiresIn
      );
      return {
        message: "OTP verified. Use reset token to change password.",
        verified: false,
        resetToken,
      };
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Unknown OTP purpose.");
  });
};

const resetPassword = async ({ resetToken, newPassword }: IResetPasswordInput) => {
  let decoded: { email: string };
  try {
    decoded = jwtHelpers.verifyToken(resetToken, config.jwt.secret) as { email: string };
  } catch {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid or expired reset token.");
  }

  const user = await prisma.user.findUnique({ where: { email: decoded.email } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  const hashedPassword = await hashItem(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    }),
    // Revoke all refresh tokens on password reset
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ]);
};

const changePassword = async (userId: string, data: IChangePasswordInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  if (!user.password) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Password not set for this account.");
  }

  const isOldPasswordValid = await compareItem(data.oldPassword, user.password);
  if (!isOldPasswordValid) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Old password is incorrect.");
  }

  const hashedPassword = await hashItem(data.newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  // Revoke all refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId } });
};

const getMe = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      isEmailVerified: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
      customerProfile: { select: { name: true, profilePhoto: true } },
      cleanerProfile: { select: { displayName: true, profilePhoto: true } },
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  return {
    ...user,
    name:
      user.role === "CLEANER"
        ? user.cleanerProfile?.displayName
        : user.customerProfile?.name || user.email.split("@")[0],
    avatar:
      user.role === "CLEANER"
        ? user.cleanerProfile?.profilePhoto
        : user.customerProfile?.profilePhoto,
  };
};

export const AuthService = {
  register,
  login,
  logout,
  resendOtp,
  forgotPassword,
  verifyOtp,
  resetPassword,
  changePassword,
  getMe,
  loginWithGmail,
};

import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import config from "../../config";
import ApiError from "../../errors/apiError";
import prisma from "../../lib/prisma";
import { jwtHelpers } from "../../utils/jwtHelpers";

const auth = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      let token = null;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      } else if (req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
      }

      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Please login again!");
      }

      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid token format.");
      }

      let decoded;
      try {
        decoded = jwtHelpers.verifyToken(token, config.jwt.secret);
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          // Attempt automatic refresh if x-refresh-token is provided
          const refreshToken = req.headers["x-refresh-token"] as string;
          if (refreshToken) {
            try {
              // Verify the refresh token
              const decodedRefresh = (await jwtHelpers.verifyToken(
                refreshToken,
                config.jwt.refreshSecret
              )) as any;

              // Verify refresh token exists in DB (rotation protection)
              const storedToken = await prisma.refreshToken.findUnique({
                where: { token: refreshToken },
              });

              if (storedToken && storedToken.expiresAt > new Date()) {
                // Generate a new access token
                const newAccessToken = jwtHelpers.generateToken(
                  { id: decodedRefresh.id, email: decodedRefresh.email, role: decodedRefresh.role },
                  config.jwt.secret,
                  config.jwt.expiresIn
                );

                // Send the new access token back to the client via a header
                res.setHeader("x-new-access-token", newAccessToken);

                // Allow request to proceed with the renewed payload
                decoded = decodedRefresh;
              } else {
                throw new ApiError(httpStatus.UNAUTHORIZED, "Session expired. Please log in again.");
              }
            } catch (refreshErr) {
              throw new ApiError(httpStatus.UNAUTHORIZED, "Session expired. Please log in again.");
            }
          } else {
            throw new ApiError(httpStatus.UNAUTHORIZED, "Session expired. Please log in again.");
          }
        } else {
          throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid token. Please log in again.");
        }
      }

      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "User no longer exists.");
      }

      if (!user.isActive) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "Your account has been deactivated. Please contact support."
        );
      }

      // Role-based access control
      if (roles.length > 0 && !roles.includes(user.role)) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "You do not have permission to access this resource."
        );
      }

      req.user = decoded as typeof req.user;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;

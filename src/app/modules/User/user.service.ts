import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import { hashItem, compareItem } from "../../../utils/hashAndCompareItem";
import {
  IUpdateBasicProfileInput,
  IUpdateCleanerProfileInput,
  IUpdateLanguageInput,
  IUpdateLocationInput,
  IUpdateProfileInput,
} from "./user.interface";

const updateLanguage = async (userId: string, data: IUpdateLanguageInput) => {
  return await prisma.user.update({
    where: { id: userId },
    data: { language: data.language },
  });
};

const updateLocation = async (userId: string, data: IUpdateLocationInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true, customerProfile: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Update Profile location
    if (user.role === "CLEANER" && user.cleanerProfile) {
      await tx.cleanerProfile.update({
        where: { id: user.cleanerProfile.id },
        data: {
          address: data.address,
          city: data.city,
          latitude: data.latitude,
          longitude: data.longitude,
        },
      });
    } else if (user.role === "CUSTOMER" && user.customerProfile) {
      await tx.customerProfile.update({
        where: { id: user.customerProfile.id },
        data: {
          address: data.address,
          city: data.city,
          latitude: data.latitude,
          longitude: data.longitude,
        },
      });
    }

    return await getUserById(userId);
  });
};

const updateBasicProfile = async (userId: string, data: IUpdateBasicProfileInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true, customerProfile: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role === "CLEANER") {
    await prisma.cleanerProfile.update({
      where: { userId },
      data: {
        displayName: data.displayName,
        bio: data.bio,
        profilePhoto: data.profilePhoto,
      },
    });
  } else if (user.role === "CUSTOMER") {
    await prisma.customerProfile.update({
      where: { userId },
      data: {
        name: data.displayName,
        profilePhoto: data.profilePhoto,
      },
    });
  }

  return await getUserById(userId);
};

const updateCleanerDetails = async (userId: string, data: IUpdateCleanerProfileInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true },
  });

  if (!user || user.role !== "CLEANER" || !user.cleanerProfile) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User is not a cleaner or profile not found");
  }

  return await prisma.$transaction(async (tx) => {
    // Validation & ID Resolution
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .replace(/[\s_-]+/g, " ");

    const propertyInputs = (data as any).propertyTypes || (data as any).propertyTypeIds || [];
    if (propertyInputs.length > 0) {
      const isObjectId = /^[0-9a-fA-F]{24}$/;
      const objectIds = propertyInputs.filter((id: string) => isObjectId.test(id));

      const existing = await tx.propertyCategory.findMany({
        select: { id: true, name: true },
      });

      // Map everything to IDs for storage
      data.propertyTypeIds = propertyInputs.map((input: string) => {
        const found = existing.find(
          (e) => e.id === input || normalize(e.name) === normalize(input)
        );
        if (!found) {
          throw new ApiError(httpStatus.BAD_REQUEST, `Property Category not found: ${input}`);
        }
        return found.id;
      });
    }

    const additionalServiceInputs =
      (data as any).additionalServices || (data as any).additionalServiceIds || [];
    if (additionalServiceInputs.length > 0) {
      const isObjectId = /^[0-9a-fA-F]{24}$/;
      const objectIds = additionalServiceInputs.filter((id: string) => isObjectId.test(id));

      const existing = await tx.additionalServiceCategory.findMany({
        select: { id: true, name: true },
      });

      data.additionalServiceIds = additionalServiceInputs.map((input: string) => {
        const found = existing.find(
          (e) => e.id === input || normalize(e.name) === normalize(input)
        );
        if (!found) {
          throw new ApiError(httpStatus.BAD_REQUEST, `Additional Service not found: ${input}`);
        }
        return found.id;
      });
    }

    if (data.services && data.services.length > 0) {
      const isObjectId = /^[0-9a-fA-F]{24}$/;
      const inputRefs = data.services.map((s: any) => s.serviceCategoryId || s.name);

      const existing = await tx.serviceCategory.findMany({
        select: { id: true, name: true },
      });

      data.services = data.services.map((s: any) => {
        const ref = s.serviceCategoryId || s.name;
        const found = existing.find((e) => e.id === ref || normalize(e.name) === normalize(ref));
        if (!found) {
          throw new ApiError(httpStatus.BAD_REQUEST, `Service Category not found: ${ref}`);
        }
        return {
          ...s,
          serviceCategoryId: found.id,
          name: found.name, // Use the official admin-defined name
        };
      });
    }

    // 1. Update basic fields
    await tx.cleanerProfile.update({
      where: { userId },
      data: {
        workingDays: data.workingDays,
        serviceAreas: data.serviceAreas,
        propertyTypeIds: data.propertyTypeIds,
        additionalServiceIds: data.additionalServiceIds,
        workFrom: data.workFrom,
        workTo: data.workTo,
        blockOffDates: data.blockOffDates,
        yearsExperience: data.yearsExperience,
      },
    });

    // 2. Delete existing services and add new ones (sync)
    await tx.cleanerService.deleteMany({
      where: { cleanerProfileId: user.cleanerProfile!.id },
    });

    await tx.cleanerService.createMany({
      data: data.services.map((s: any) => ({
        cleanerProfileId: user.cleanerProfile!.id,
        serviceCategoryId: s.serviceCategoryId,
        name: s.name,
        pricePerHour: s.pricePerHour,
      })),
    });

    return await tx.cleanerProfile.findUnique({
      where: { userId },
      include: { services: true },
    });
  });
};

const completeOnboarding = async (userId: string) => {
  return await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  });
};

// ---------------------------------------------------------------------------
// Distance & Search
// ---------------------------------------------------------------------------

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getNearbyCleaners = async (userLat: number, userLng: number, radiusKm: number = 10) => {
  // Get all cleaners who have set their location
  const allCleaners = await prisma.cleanerProfile.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
    },
    include: {
      services: true,
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  // Filter with distance calculation
  const nearby = allCleaners
    .map((cleaner) => {
      const dist = getDistanceKm(userLat, userLng, cleaner.latitude!, cleaner.longitude!);
      return {
        ...cleaner,
        name: cleaner.displayName,
        avatar: cleaner.profilePhoto, // Add for compatibility
        distance: dist,
      };
    })
    .filter((cleaner) => cleaner.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance); // Nearest first

  return nearby;
};

const enrichCleanerProfile = async (cleanerProfile: any) => {
  if (!cleanerProfile) return null;

  const cleanerId = cleanerProfile.userId;

  // 1. Fetch related data and Bookings for stats in parallel
  const [propertyTypes, serviceCategories, bookings] = await Promise.all([
    cleanerProfile.propertyTypeIds?.length
      ? prisma.propertyCategory.findMany({
          where: { id: { in: cleanerProfile.propertyTypeIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.serviceCategory.findMany({
      where: { id: { in: (cleanerProfile.services ?? []).map((s: any) => s.serviceCategoryId) } },
      select: { id: true, banner: true },
    }),
    prisma.booking.findMany({
      where: { cleanerId, status: "COMPLETE" },
    }),
  ]);

  // 2. Calculate Dashboard Stats
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let totalEarnings = 0;
  let weeklyEarnings = 0;
  let totalHours = 0;

  bookings.forEach((b) => {
    const cleanerShare = b.charge * 0.95;
    totalEarnings += cleanerShare;

    if (b.updatedAt >= sevenDaysAgo) {
      weeklyEarnings += cleanerShare;
    }

    // Parse duration from "HH:mm" strings
    try {
      const startParts = b.startTime.split(":");
      const endParts = b.endTime.split(":");
      const startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
      const diffHrs = (endMins - startMins) / 60;
      if (diffHrs > 0) totalHours += diffHrs;
    } catch (e) {
      // Skip if time format is invalid
    }
  });

  // 2. Map services and attach the banner from parent category
  const enrichedServices = (cleanerProfile.services ?? []).map((s: any) => {
    const parentCategory = serviceCategories.find((cat) => cat.id === s.serviceCategoryId);
    return {
      id: s.serviceCategoryId,
      name: s.name,
      pricePerHour: s.pricePerHour,
      banner: parentCategory?.banner || null,
    };
  });

  // 3. Map reviews to flatten customer profile
  const enrichedReviews = (cleanerProfile.reviews ?? []).map((r: any) => {
    const { customer, ...reviewRest } = r;
    return {
      ...reviewRest,
      customer: {
        name: customer?.customerProfile?.name || "Customer",
        avatar: customer?.customerProfile?.profilePhoto || null,
      },
    };
  });

  // Strip internal DB fields, raw ID arrays, and duplicate location fields
  const {
    propertyTypeIds,
    additionalServiceIds,
    id,
    userId,
    address,
    city,
    latitude,
    longitude,
    reviews,
    ...rest
  } = cleanerProfile;

  return {
    ...rest,
    propertyTypes,
    services: enrichedServices,
    reviews: enrichedReviews,
    dashboardStats: {
      totalEarnings: Number(totalEarnings.toFixed(2)),
      weeklyEarnings: Number(weeklyEarnings.toFixed(2)),
      totalHours: Number(totalHours.toFixed(1)),
    },
    paymentInfo: {
      stripeAccountId: cleanerProfile.stripeAccountId,
      isPayoutReady: !!cleanerProfile.stripeAccountId && !!cleanerProfile.stripeOnboarded,
    },
  };
};

const enrichCustomerProfile = async (customerProfile: any) => {
  if (!customerProfile) return null;

  const customerId = customerProfile.userId;

  // Fetch bookings and reviews to calculate stats
  const [bookings, reviews] = await Promise.all([
    prisma.booking.findMany({
      where: { customerId, status: "COMPLETE" },
    }),
    prisma.review.findMany({
      where: { customerId },
    }),
  ]);

  const totalSpent = bookings.reduce((sum, b) => sum + b.totalCharge, 0);
  const avgRatingGiven =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const { id, userId, stripeCustomerId, ...rest } = customerProfile;
  return {
    ...rest,
    dashboardStats: {
      totalSpentMoney: Number(totalSpent.toFixed(2)),
      totalBookings: bookings.length,
      avgRatingGiven: Number(avgRatingGiven.toFixed(1)),
    },
    paymentInfo: {
      stripeCustomerId,
      hasSavedCard: !!stripeCustomerId,
    },
  };
};

const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      language: true,
      lastLogin: true,
      onboardingCompleted: true,
      customerProfile: true,
      cleanerProfile: {
        select: {
          // Internal IDs
          id: true,
          userId: true,
          propertyTypeIds: true,
          additionalServiceIds: true,
          address: true,
          city: true,
          latitude: true,
          longitude: true,
          stripeAccountId: true,
          stripeOnboarded: true,
          // meaningful cleaner fields
          displayName: true,
          bio: true,
          profilePhoto: true,
          yearsExperience: true,
          serviceAreas: true,
          workingDays: true,
          workFrom: true,
          workTo: true,
          blockOffDates: true,
          avgRating: true,
          totalReviews: true,
          totalJobs: true,
          services: {
            select: {
              id: true,
              serviceCategoryId: true,
              name: true,
              pricePerHour: true,
            },
          },
          reviews: {
            select: {
              id: true,
              rating: true,
              description: true,
              tags: true,
              createdAt: true,
              customer: {
                select: {
                  customerProfile: {
                    select: {
                      name: true,
                      profilePhoto: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  // Flatten logic to preserve Postman response structure
  const profile =
    user.role === "CLEANER"
      ? await enrichCleanerProfile(user.cleanerProfile)
      : await enrichCustomerProfile(user.customerProfile);

  const flatData: any = {
    ...user,
    name:
      user.role === "CLEANER"
        ? user.cleanerProfile?.displayName
        : user.customerProfile?.name || user.email.split("@")[0],
    avatar:
      user.role === "CLEANER"
        ? user.cleanerProfile?.profilePhoto
        : user.customerProfile?.profilePhoto,
    address: user.role === "CLEANER" ? user.cleanerProfile?.address : user.customerProfile?.address,
    city: user.role === "CLEANER" ? user.cleanerProfile?.city : user.customerProfile?.city,
    latitude:
      user.role === "CLEANER" ? user.cleanerProfile?.latitude : user.customerProfile?.latitude,
    longitude:
      user.role === "CLEANER" ? user.cleanerProfile?.longitude : user.customerProfile?.longitude,
  };

  // Remove profiles from root and add the enriched one
  delete flatData.customerProfile;
  delete flatData.cleanerProfile;

  return {
    ...flatData,
    cleanerProfile: user.role === "CLEANER" ? profile : undefined,
    customerProfile: user.role === "CUSTOMER" ? profile : undefined,
  };
};

const updateProfile = async (userId: string, data: IUpdateProfileInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true, customerProfile: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  await prisma.$transaction(async (tx) => {
    // 1. Update User account fields
    await tx.user.update({
      where: { id: userId },
      data: {
        language: data.language,
        onboardingCompleted: true,
      },
    });

    // 2. Handle Profile Updates
    if (user.role === "CLEANER") {
      // Validation & ID Resolution for Cleaner Profile fields
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .trim()
          .replace(/[\s_-]+/g, " ");

      const propertyInputs = (data as any).propertyTypes || (data as any).propertyTypeIds || [];
      if (propertyInputs.length > 0) {
        const existing = await tx.propertyCategory.findMany({ select: { id: true, name: true } });
        data.propertyTypeIds = propertyInputs.map((input: string) => {
          const found = existing.find(
            (e) => e.id === input || normalize(e.name) === normalize(input)
          );
          if (!found)
            throw new ApiError(httpStatus.BAD_REQUEST, `Property Category not found: ${input}`);
          return found.id;
        });
      }

      const additionalServiceInputs =
        (data as any).additionalServices || (data as any).additionalServiceIds || [];
      if (additionalServiceInputs.length > 0) {
        const existing = await tx.additionalServiceCategory.findMany({
          select: { id: true, name: true },
        });
        data.additionalServiceIds = additionalServiceInputs.map((input: string) => {
          const found = existing.find(
            (e) => e.id === input || normalize(e.name) === normalize(input)
          );
          if (!found)
            throw new ApiError(httpStatus.BAD_REQUEST, `Additional Service not found: ${input}`);
          return found.id;
        });
      }

      if (data.services && data.services.length > 0) {
        const existing = await tx.serviceCategory.findMany({ select: { id: true, name: true } });
        data.services = data.services.map((s: any) => {
          const ref = s.serviceCategoryId || s.name;
          const found = existing.find((e) => e.id === ref || normalize(e.name) === normalize(ref));
          if (!found)
            throw new ApiError(httpStatus.BAD_REQUEST, `Service Category not found: ${ref}`);
          return {
            ...s,
            serviceCategoryId: found.id,
            name: found.name,
            pricePerHour: s.pricePerHour,
          };
        });
      }

      const cleanerProfile = await tx.cleanerProfile.upsert({
        where: { userId },
        create: {
          userId,
          displayName: data.displayName,
          bio: data.bio,
          profilePhoto: data.profilePhoto,
          address: data.address,
          city: data.city,
          latitude: data.latitude,
          longitude: data.longitude,
          workingDays: data.workingDays,
          serviceAreas: data.serviceAreas,
          propertyTypeIds: data.propertyTypeIds,
          additionalServiceIds: data.additionalServiceIds,
          workFrom: data.workFrom,
          workTo: data.workTo,
          blockOffDates: data.blockOffDates,
          yearsExperience: data.yearsExperience,
        },
        update: {
          displayName: data.displayName !== undefined ? data.displayName : undefined,
          bio: data.bio !== undefined ? data.bio : undefined,
          profilePhoto: data.profilePhoto !== undefined ? data.profilePhoto : undefined,
          address: data.address !== undefined ? data.address : undefined,
          city: data.city !== undefined ? data.city : undefined,
          latitude: data.latitude !== undefined ? data.latitude : undefined,
          longitude: data.longitude !== undefined ? data.longitude : undefined,
          workingDays: data.workingDays !== undefined ? data.workingDays : undefined,
          serviceAreas: data.serviceAreas !== undefined ? data.serviceAreas : undefined,
          propertyTypeIds: data.propertyTypeIds !== undefined ? data.propertyTypeIds : undefined,
          additionalServiceIds:
            data.additionalServiceIds !== undefined ? data.additionalServiceIds : undefined,
          workFrom: data.workFrom !== undefined ? data.workFrom : undefined,
          workTo: data.workTo !== undefined ? data.workTo : undefined,
          blockOffDates: data.blockOffDates !== undefined ? data.blockOffDates : undefined,
          yearsExperience: data.yearsExperience !== undefined ? data.yearsExperience : undefined,
        },
      });

      if (data.services) {
        await tx.cleanerService.deleteMany({ where: { cleanerProfileId: cleanerProfile.id } });
        await tx.cleanerService.createMany({
          data: data.services.map((s: any) => ({
            cleanerProfileId: cleanerProfile.id,
            serviceCategoryId: s.serviceCategoryId,
            name: s.name,
            pricePerHour: s.pricePerHour,
          })),
        });
      }
    } else if (user.role === "CUSTOMER") {
      await tx.customerProfile.upsert({
        where: { userId },
        create: {
          userId,
          name: data.displayName,
          profilePhoto: data.profilePhoto,
          address: data.address,
          city: data.city,
          latitude: data.latitude,
          longitude: data.longitude,
        },
        update: {
          name: data.displayName !== undefined ? data.displayName : undefined,
          profilePhoto: data.profilePhoto !== undefined ? data.profilePhoto : undefined,
          address: data.address !== undefined ? data.address : undefined,
          city: data.city !== undefined ? data.city : undefined,
          latitude: data.latitude !== undefined ? data.latitude : undefined,
          longitude: data.longitude !== undefined ? data.longitude : undefined,
        },
      });
    }
  });

  return await getUserById(userId);
};

const changePassword = async (userId: string, data: any) => {
  const { oldPassword, newPassword } = data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  // Ensure user has a password set (e.g. not an OAuth user without password)
  if (!user.password) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No password set for this account. Please use password reset.");
  }

  // Check if old password matches
  const isMatch = await compareItem(oldPassword, user.password);
  if (!isMatch) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Incorrect old password");
  }

  // Hash new password and save
  const hashedNewPassword = await hashItem(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword },
  });

  return { message: "Password changed successfully" };
};

export const UserService = {
  updateLanguage,
  updateLocation,
  updateBasicProfile,
  updateCleanerDetails,
  getNearbyCleaners,
  getUserById,
  updateProfile,
  changePassword,
};

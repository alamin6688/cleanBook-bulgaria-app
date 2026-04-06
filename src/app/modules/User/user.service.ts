import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
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
    include: { cleanerProfile: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Update User location
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        address: data.address,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    });

    // 2. If user is a cleaner, also update CleanerProfile location
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
    }

    return updatedUser;
  });
};

const updateBasicProfile = async (userId: string, data: IUpdateBasicProfileInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role === "CLEANER") {
    return await prisma.cleanerProfile.update({
      where: { userId },
      data: {
        displayName: data.displayName,
        bio: data.bio,
        profilePhoto: data.profilePhoto,
      },
    });
  }

  return user;
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
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[\s_-]+/g, " ");

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
        workType: data.workType,
        blockOffDates: data.blockOffDates,
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
          name: true,
          avatar: true,
        },
      },
    },
  });

  // Filter with distance calculation
  const nearby = allCleaners
    .map((cleaner) => {
      const dist = getDistanceKm(userLat, userLng, cleaner.latitude!, cleaner.longitude!);
      return { ...cleaner, distance: dist };
    })
    .filter((cleaner) => cleaner.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance); // Nearest first

  return nearby;
};

const enrichCleanerProfile = async (cleanerProfile: any) => {
  if (!cleanerProfile) return null;

  const [propertyTypes, additionalServices] = await Promise.all([
    cleanerProfile.propertyTypeIds?.length
      ? prisma.propertyCategory.findMany({
          where: { id: { in: cleanerProfile.propertyTypeIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    cleanerProfile.additionalServiceIds?.length
      ? prisma.additionalServiceCategory.findMany({
          where: { id: { in: cleanerProfile.additionalServiceIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  // Services are already pre-selected as { id, name, pricePerHour } from the DB query
  const enrichedServices = (cleanerProfile.services ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    pricePerHour: s.pricePerHour,
  }));

  // Strip internal DB fields, raw ID arrays, duplicate location fields, and static enums
  const {
    propertyTypeIds,
    additionalServiceIds,
    id,
    userId,
    address,
    city,
    latitude,
    longitude,
    workType,     // static enum — excluded
    ...rest
  } = cleanerProfile;

  return {
    ...rest,
    propertyTypes,
    additionalServices,
    services: enrichedServices,
  };
};

const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      phone: true,
      role: true,
      city: true,
      address: true,
      latitude: true,
      longitude: true,
      isActive: true,
      language: true,
      lastLogin: true,
      onboardingCompleted: true,
      cleanerProfile: {
        select: {
          // Internal IDs — used only inside enrichCleanerProfile, stripped from output
          id: true,
          userId: true,
          propertyTypeIds: true,
          additionalServiceIds: true,
          // Duplicate location — already on user root, stripped from output
          address: true,
          city: true,
          latitude: true,
          longitude: true,
          // Dynamic / meaningful cleaner fields
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
          // workType intentionally omitted — static enum, stripped in enrichCleanerProfile
          services: {
            select: {
              id: true,
              name: true,
              pricePerHour: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return {
    ...user,
    cleanerProfile: await enrichCleanerProfile(user.cleanerProfile),
  };
};

const updateProfile = async (userId: string, data: IUpdateProfileInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Update User basic and location fields if provided
    await tx.user.update({
      where: { id: userId },
      data: {
        city: data.city,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        language: data.language,
        onboardingCompleted: true,
      },
    });

    // Validation & ID Resolution for Cleaner Profile fields
    if (user.role === "CLEANER") {
      const normalize = (s: string) => s.toLowerCase().trim().replace(/[\s_-]+/g, " ");

      const propertyInputs = (data as any).propertyTypes || (data as any).propertyTypeIds || [];
      if (propertyInputs.length > 0) {
        const isObjectId = /^[0-9a-fA-F]{24}$/;
        const objectIds = propertyInputs.filter((id: string) => isObjectId.test(id));

        const existing = await tx.propertyCategory.findMany({
          select: { id: true, name: true },
        });

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
    }

    // 2. If user is a cleaner, handle CleanerProfile upsert and services sync
    if (user.role === "CLEANER") {
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
          workType: data.workType,
          blockOffDates: data.blockOffDates,
        },
        update: {
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
          workType: data.workType,
          blockOffDates: data.blockOffDates,
        },
      });

      // 3. Update services if provided
      if (data.services) {
        await tx.cleanerService.deleteMany({
          where: { cleanerProfileId: cleanerProfile.id },
        });

        await tx.cleanerService.createMany({
          data: data.services.map((s: any) => ({
            cleanerProfileId: cleanerProfile.id,
            serviceCategoryId: s.serviceCategoryId,
            name: s.name,
            pricePerHour: s.pricePerHour,
          })),
        });
      }
    }

    const result = await tx.user.findUnique({
      where: { id: userId },
      include: {
        cleanerProfile: {
          include: { services: true },
        },
      },
    });

    return {
      ...result,
      cleanerProfile: await enrichCleanerProfile(result?.cleanerProfile),
    };
  });
};

export const UserService = {
  updateLanguage,
  updateLocation,
  updateBasicProfile,
  updateCleanerDetails,
  getNearbyCleaners,
  getUserById,
  updateProfile,
};

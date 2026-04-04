import { PropertyType, ServiceType } from "@prisma/client";
import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import {
  IUpdateBasicProfileInput,
  IUpdateCleanerProfileInput,
  IUpdateLanguageInput,
  IUpdateLocationInput,
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

  if (user.role === "CLEANER") {
    if (!user.cleanerProfile) {
      throw new ApiError(httpStatus.NOT_FOUND, "Cleaner profile not found");
    }
    return await prisma.cleanerProfile.update({
      where: { userId },
      data: {
        address: data.address,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    });
  }

  // If we had a ClientProfile, we'd update it here. 
  // For now, let's just return success or update User if needed.
  return user;
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
    // 1. Update basic fields
    await tx.cleanerProfile.update({
      where: { userId },
      data: {
        workingDays: data.workingDays,
        serviceAreas: data.serviceAreas,
        propertyTypes: data.propertyTypes as PropertyType[],
      },
    });

    // 2. Delete existing services and add new ones (sync)
    await tx.cleanerService.deleteMany({
      where: { cleanerProfileId: user.cleanerProfile!.id },
    });

    await tx.cleanerService.createMany({
      data: data.services.map((s) => ({
        cleanerProfileId: user.cleanerProfile!.id,
        name: s.name as ServiceType,
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

export const UserService = {
  updateLanguage,
  updateLocation,
  updateBasicProfile,
  updateCleanerDetails,
  completeOnboarding,
};

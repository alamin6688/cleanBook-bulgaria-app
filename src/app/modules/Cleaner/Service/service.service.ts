import httpStatus from "http-status";
import ApiError from "../../../../errors/apiError";
import prisma from "../../../../lib/prisma";
import { IUpdateCleanerServicesInput } from "./service.interface";

const getMyServices = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      cleanerProfile: {
        include: {
          services: true,
        },
      },
    },
  });

  if (!user || user.role !== "CLEANER" || !user.cleanerProfile) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User is not a cleaner or profile not found");
  }

  return user.cleanerProfile.services.map((s) => ({
    id: s.id,
    name: s.name,
    pricePerHour: s.pricePerHour,
    serviceCategoryId: s.serviceCategoryId,
  }));
};

const updateMyServices = async (userId: string, data: IUpdateCleanerServicesInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true },
  });

  if (!user || user.role !== "CLEANER" || !user.cleanerProfile) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User is not a cleaner or profile not found");
  }

  return await prisma.$transaction(async (tx) => {
    const cleanerProfileId = user.cleanerProfile!.id;

    // Validate service category IDs and get names
    const categoryIds = data.services.map((s) => s.serviceCategoryId);
    const categories = await tx.serviceCategory.findMany({
      where: {
        id: { in: categoryIds },
      },
    });

    if (categories.length !== categoryIds.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "One or more service categories are invalid. Make sure you are passing the correct 'serviceCategoryId' and not the cleaner's internal service 'id'."
      );
    }

    // 1. Upsert each service (Update if exists, Create if new)
    for (const service of data.services) {
      const category = categories.find((c) => c.id === service.serviceCategoryId);
      if (!category) continue;

      const existingService = await tx.cleanerService.findFirst({
        where: {
          cleanerProfileId,
          serviceCategoryId: service.serviceCategoryId,
        },
      });

      if (existingService) {
        // Update price
        await tx.cleanerService.update({
          where: { id: existingService.id },
          data: { pricePerHour: service.pricePerHour },
        });
      } else {
        // Create new service
        await tx.cleanerService.create({
          data: {
            cleanerProfileId,
            serviceCategoryId: service.serviceCategoryId,
            name: category.name,
            pricePerHour: service.pricePerHour,
          },
        });
      }
    }

    const result = await tx.cleanerService.findMany({
      where: { cleanerProfileId },
    });

    return result.map((s) => ({
      id: s.id,
      name: s.name,
      pricePerHour: s.pricePerHour,
      serviceCategoryId: s.serviceCategoryId,
    }));
  });
};

export const CleanerService_Service = {
  getMyServices,
  updateMyServices,
};

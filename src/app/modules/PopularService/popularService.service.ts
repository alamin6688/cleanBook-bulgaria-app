import { ServiceCategory } from "@prisma/client";
import prisma from "../../../lib/prisma";

const getPopularServices = async (
  page: number = 1,
  limit: number = 12
): Promise<{ meta: { page: number; limit: number; total: number }; data: ServiceCategory[] }> => {
  const skip = (page - 1) * limit;

  const result = await prisma.serviceCategory.findMany({
    skip,
    take: limit,
    orderBy: {
      bookings: {
        _count: "desc",
      },
    },
  });

  const total = await prisma.serviceCategory.count();

  return {
    meta: {
      page,
      limit,
      total,
    },
    data: result,
  };
};

export const PopularServiceService = {
  getPopularServices,
};

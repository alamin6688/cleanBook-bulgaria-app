import { PropertyCategory, ServiceCategory, AdditionalServiceCategory } from "@prisma/client";
import httpStatus from "http-status";
import ApiError from "../../../../errors/apiError";
import prisma from "../../../../lib/prisma";

// Property Category
const createPropertyCategory = async (data: { name: string }): Promise<PropertyCategory> => {
  const isExist = await prisma.propertyCategory.findFirst({
    where: {
      name: {
        equals: data.name.trim(),
        mode: "insensitive",
      },
    },
  });

  if (isExist) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Property Category with name '${data.name}' already exists.`);
  }

  return await prisma.propertyCategory.create({
    data: {
      name: data.name.trim(),
    },
  });
};

const getAllPropertyCategories = async (): Promise<PropertyCategory[]> => {
  return await prisma.propertyCategory.findMany();
};

const updatePropertyCategory = async (id: string, data: { name: string }): Promise<PropertyCategory> => {
  if (data.name) {
    const isExist = await prisma.propertyCategory.findFirst({
      where: {
        name: {
          equals: data.name.trim(),
          mode: "insensitive",
        },
        NOT: {
          id: id,
        },
      },
    });

    if (isExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Property Category with name '${data.name}' already exists.`);
    }

    data.name = data.name.trim();
  }

  return await prisma.propertyCategory.update({
    where: { id },
    data,
  });
};

const deletePropertyCategory = async (id: string): Promise<PropertyCategory> => {
  return await prisma.propertyCategory.delete({
    where: { id },
  });
};

// Service Category
const createServiceCategory = async (data: { name: string }): Promise<ServiceCategory> => {
  const isExist = await prisma.serviceCategory.findFirst({
    where: {
      name: {
        equals: data.name.trim(),
        mode: "insensitive",
      },
    },
  });

  if (isExist) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Service Category with name '${data.name}' already exists.`);
  }

  return await prisma.serviceCategory.create({
    data: {
      name: data.name.trim(),
    },
  });
};

const getAllServiceCategories = async (): Promise<ServiceCategory[]> => {
  return await prisma.serviceCategory.findMany();
};

const updateServiceCategory = async (id: string, data: { name: string }): Promise<ServiceCategory> => {
  if (data.name) {
    const isExist = await prisma.serviceCategory.findFirst({
      where: {
        name: {
          equals: data.name.trim(),
          mode: "insensitive",
        },
        NOT: {
          id: id,
        },
      },
    });

    if (isExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Service Category with name '${data.name}' already exists.`);
    }

    data.name = data.name.trim();
  }

  return await prisma.serviceCategory.update({
    where: { id },
    data,
  });
};

const deleteServiceCategory = async (id: string): Promise<ServiceCategory> => {
  return await prisma.serviceCategory.delete({
    where: { id },
  });
};

// Additional Service Category
const createAdditionalServiceCategory = async (data: { name: string }): Promise<AdditionalServiceCategory> => {
  const isExist = await prisma.additionalServiceCategory.findFirst({
    where: {
      name: {
        equals: data.name.trim(),
        mode: "insensitive",
      },
    },
  });

  if (isExist) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Additional Service Category with name '${data.name}' already exists.`);
  }

  return await prisma.additionalServiceCategory.create({
    data: {
      name: data.name.trim(),
    },
  });
};

const getAllAdditionalServiceCategories = async (): Promise<AdditionalServiceCategory[]> => {
  return await prisma.additionalServiceCategory.findMany();
};

const updateAdditionalServiceCategory = async (id: string, data: { name: string }): Promise<AdditionalServiceCategory> => {
  if (data.name) {
    const isExist = await prisma.additionalServiceCategory.findFirst({
      where: {
        name: {
          equals: data.name.trim(),
          mode: "insensitive",
        },
        NOT: {
          id: id,
        },
      },
    });

    if (isExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Additional Service Category with name '${data.name}' already exists.`);
    }

    data.name = data.name.trim();
  }

  return await prisma.additionalServiceCategory.update({
    where: { id },
    data,
  });
};

const deleteAdditionalServiceCategory = async (id: string): Promise<AdditionalServiceCategory> => {
  return await prisma.additionalServiceCategory.delete({
    where: { id },
  });
};

export const CategoryService = {
  createPropertyCategory,
  getAllPropertyCategories,
  updatePropertyCategory,
  deletePropertyCategory,
  createServiceCategory,
  getAllServiceCategories,
  updateServiceCategory,
  deleteServiceCategory,
  createAdditionalServiceCategory,
  getAllAdditionalServiceCategories,
  updateAdditionalServiceCategory,
  deleteAdditionalServiceCategory,
};

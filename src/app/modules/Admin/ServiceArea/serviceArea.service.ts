import prisma from "../../../../lib/prisma";

const createServiceArea = async (data: { name: string; postcodes: string[] }) => {
  return await prisma.serviceArea.create({
    data: {
      name: data.name,
      postcodes: data.postcodes.map(pc => pc.trim()),
    },
  });
};

const getAllServiceAreas = async () => {
  return await prisma.serviceArea.findMany();
};

const deleteServiceArea = async (id: string) => {
  return await prisma.serviceArea.delete({
    where: { id },
  });
};

export const ServiceAreaService = {
  createServiceArea,
  getAllServiceAreas,
  deleteServiceArea,
};

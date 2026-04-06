export type ICleanerServiceInput = {
  serviceCategoryId: string;
  pricePerHour: number;
};

export type IUpdateCleanerServicesInput = {
  services: ICleanerServiceInput[];
};

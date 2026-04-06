import { z } from "zod";

const updateCleanerServicesZodSchema = z.object({
  body: z.object({
    services: z
      .array(
        z.object({
          serviceCategoryId: z.string({
            error: "Service Category ID is required",
          }),
          pricePerHour: z
            .number({ error: "Price per hour must be a number" })
            .positive("Price per hour must be a positive number"),
        }),
        { error: "Services must be provided as an array" }
      )
      .min(1, "At least one service must be added to your profile"),
  }),
});

export const CleanerServiceValidation = {
  updateCleanerServicesZodSchema,
};

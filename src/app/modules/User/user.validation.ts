import { z } from "zod";

const updateLanguageZodSchema = z.object({
  body: z.object({
    language: z.string().min(1),
  }),
});

const updateLocationZodSchema = z.object({
  body: z.object({
    address: z.string().min(1),
    city: z.string().min(1),
    latitude: z.number(),
    longitude: z.number(),
  }),
});

const updateBasicProfileZodSchema = z.object({
  body: z.object({
    displayName: z.string().min(1),
    bio: z.string().min(1),
    profilePhoto: z.string().optional(),
  }),
});

const updateCleanerProfileZodSchema = z.object({
  body: z.object({
    workingDays: z.array(z.string()).min(1),
    serviceAreas: z.array(z.string()).min(1),
    propertyTypes: z.array(z.string()).min(1),
    services: z
      .array(
        z.object({
          serviceCategoryId: z.string().optional(),
          name: z.string().min(1),
          pricePerHour: z.number().positive(),
        })
      )
      .min(1),
    workFrom: z.string().optional(),
    workTo: z.string().optional(),

    blockOffDates: z
      .array(
        z.coerce.date().refine((date) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return date > today;
        }, { message: "Block off dates must be in the future (starting from tomorrow)" })
      )
      .optional(),
  }),
});

const saveProfileZodSchema = z.object({
  body: z.object({
    displayName: z.string().optional(),
    bio: z.string().optional(),
    profilePhoto: z.string().optional(),
    language: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    workingDays: z.array(z.string()).optional(),
    serviceAreas: z.array(z.string()).optional(),
    propertyTypes: z.array(z.string()).optional(),
    services: z
      .array(
        z.object({
          serviceCategoryId: z.string().optional(),
          name: z.string().optional(),
          pricePerHour: z.number().positive().optional(),
        })
      )
      .optional(),
    workFrom: z.string().optional(),
    workTo: z.string().optional(),

    blockOffDates: z
      .array(
        z.coerce.date().refine(
          (date) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return date > today;
          },
          { message: "Block off dates must be in the future (starting from tomorrow)" }
        )
      )
      .optional(),
    postcodes: z.array(z.string()).optional(),
    country: z.string().optional(),
  }),
});

const updateAvailabilityZodSchema = z.object({
  body: z.object({
    workingDays: z.array(z.string()).optional(),
    serviceAreas: z.array(z.string()).optional(),
    workFrom: z.string().optional(),
    workTo: z.string().optional(),

    blockOffDates: z
      .array(
        z.coerce.date().refine(
          (date) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return date > today;
          },
          { message: "Block off dates must be in the future (starting from tomorrow)" }
        )
      )
      .optional(),
    postcodes: z.array(z.string()).optional(),
    country: z.string().optional(),
  }),
});

export const UserValidation = {
  updateLanguageZodSchema,
  updateLocationZodSchema,
  updateBasicProfileZodSchema,
  updateCleanerProfileZodSchema,
  saveProfileZodSchema,
  updateAvailabilityZodSchema,
};

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
    propertyTypes: z.array(z.enum(["FLAT", "HOUSE", "OFFICE", "STUDIO"])).min(1),
    services: z.array(
      z.object({
        name: z.enum([
          "REGULAR_CLEANING",
          "DEEP_CLEANING",
          "IRONING",
          "WINDOW_CLEANING",
          "MOVE_OUT_CLEAN",
          "LAUNDRY",
        ]),
        pricePerHour: z.number().positive(),
      })
    ).min(1),
  }),
});

export const UserValidation = {
  updateLanguageZodSchema,
  updateLocationZodSchema,
  updateBasicProfileZodSchema,
  updateCleanerProfileZodSchema,
};

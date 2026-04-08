import { z } from "zod";

const createCategoryZodSchema = z.object({
  body: z.object({
    name: z.string({ error: "Title is required" }).min(1, "Title cannot be empty"),
    banner: z.string().optional(),
  }),
});

const createServiceCategoryZodSchema = z.object({
  body: z.object({
    name: z.string({ error: "Title is required" }).min(1, "Title cannot be empty"),
    banner: z.string({ error: "Banner image is required" }).min(1, "Banner cannot be empty"),
  }),
});

const updateCategoryZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    banner: z.string().optional(),
  }),
});

export const CategoryValidation = {
  createCategoryZodSchema,
  createServiceCategoryZodSchema,
  updateCategoryZodSchema,
};

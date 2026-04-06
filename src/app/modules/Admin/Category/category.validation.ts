import { z } from "zod";

const createCategoryZodSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Title is required"), 
  }),
});

const updateCategoryZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
  }),
});

export const CategoryValidation = {
  createCategoryZodSchema,
  updateCategoryZodSchema,
};

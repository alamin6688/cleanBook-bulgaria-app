import { z } from "zod";

const createReviewSchema = z.object({
  body: z.object({
    bookingId: z.string({
      error: "Booking ID is required",
    }),
    rating: z
      .number({
        error: "Rating is required",
      })
      .int({
        message: "Rating must be a whole number (1-5)",
      })
      .min(1, { message: "Rating must be at least 1" })
      .max(5, { message: "Rating cannot be more than 5" }),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const ReviewValidation = {
  createReviewSchema,
};

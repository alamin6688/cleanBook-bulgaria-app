import { z } from "zod";


const createBookingSchema = z.object({
  body: z.object({
    cleanerId: z.string().nonempty({ message: "cleanerId is required" }),
    propertyCategoryId: z.string().nonempty({ message: "propertyCategoryId is required" }),
    serviceCategoryId: z.string().nonempty({ message: "serviceCategoryId is required" }),
    rooms: z.number().int().min(1, { message: "Rooms must be at least 1" }),
    spaceSqft: z.number().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/, { message: "Invalid ISO date string" })
      .or(z.date()),
    startTime: z.string().regex(/^\d{2}:\d{2}(\s?[AaPp][Mm])?$/, { message: "Start time must be HH:mm or hh:mm a format" }),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(\s?[AaPp][Mm])?$/, { message: "End time must be HH:mm or hh:mm a format" }),
    address: z.string().optional(),
    city: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    specialInstructions: z.string().optional(),
  }),
});

const getSlotsSchema = z.object({
  query: z.object({
    cleanerId: z.string().nonempty({ message: "cleanerId is required" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be YYYY-MM-DD" }),
  }),
});

const updatePaymentStatusSchema = z.object({
  body: z.object({
    paymentStatus: z
      .enum(["PENDING", "PAID", "FAILED"], {
        message: "Payment status must be one of: PENDING, PAID, FAILED",
      })
      .default("PENDING"),
  }),
});

const checkAvailabilitySchema = z.object({
  body: z.object({
    cleanerId: z.string().nonempty({ message: "cleanerId is required" }),
    serviceCategoryId: z.string().nonempty({ message: "serviceCategoryId is required" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, { message: "Invalid date format, expect YYYY-MM-DD" }),
    startTime: z.string().regex(/^\d{1,2}:\d{2}(\s?[AaPp][Mm])?$/, { message: "Start time format invalid (use HH:mm AM/PM)" }),
    endTime: z.string().regex(/^\d{1,2}:\d{2}(\s?[AaPp][Mm])?$/, { message: "End time format invalid (use HH:mm AM/PM)" }),
  }),
});

const getAvailableCleanersSchema = z.object({
  query: z.object({
    searchTerm: z.string().optional(),
    serviceCategoryIds: z.union([z.string(), z.array(z.string())]).optional(),
    propertyCategoryId: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
    minRating: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    radius: z.string().optional(),
    city: z.string().optional(),
    sortBy: z.enum(["rating_high_to_low", "rating_low_to_high", "nearest", "price_low_to_high"]).optional(),
  }),
});

export const BookingValidation = {
  createBookingSchema,
  getSlotsSchema,
  updatePaymentStatusSchema,
  checkAvailabilitySchema,
  getAvailableCleanersSchema,
};

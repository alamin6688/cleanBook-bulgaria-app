import { z } from "zod";

const createPaymentIntentSchema = z.object({
  params: z.object({
    bookingId: z.string().nonempty({ message: "Booking ID is required" }),
  }),
});

const refundPaymentSchema = z.object({
  params: z.object({
    bookingId: z.string().nonempty({ message: "Booking ID is required" }),
  }),
});

export const PaymentValidation = {
  createPaymentIntentSchema,
  refundPaymentSchema,
};

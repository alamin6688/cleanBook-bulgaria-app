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

const addBankAccountSchema = z.object({
  body: z.object({
    bankToken: z.string().nonempty({ message: "Bank token is required" }),
  }),
});

const bankAccountIdSchema = z.object({
  params: z.object({
    bankAccountId: z.string().nonempty({ message: "Bank account ID is required" }),
  }),
});

export const PaymentValidation = {
  createPaymentIntentSchema,
  refundPaymentSchema,
  addBankAccountSchema,
  bankAccountIdSchema,
};

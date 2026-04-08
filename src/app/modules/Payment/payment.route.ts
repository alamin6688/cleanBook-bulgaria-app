import express, { Request, Response, NextFunction } from "express";
import { RequestValidation } from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { Role } from "@prisma/client";
import { PaymentController } from "./payment.controller";
import { PaymentValidation } from "./payment.validation";

const router = express.Router();

// Create payment intent (for Stripe)
router.post(
  "/:bookingId/intent",
  auth(Role.CUSTOMER),
  RequestValidation.validateRequest(PaymentValidation.createPaymentIntentSchema),
  PaymentController.createPaymentIntent
);

// Refund payment
router.post(
  "/:bookingId/refund",
  auth(Role.CUSTOMER),
  RequestValidation.validateRequest(PaymentValidation.refundPaymentSchema),
  PaymentController.refundPayment
);

// Stripe webhook (no auth required - Stripe signature verification instead)
router.post("/webhook", express.raw({ type: "application/json" }), PaymentController.handleWebhook);

export const PaymentRoutes = router;

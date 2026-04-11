import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { PaymentService } from "./payment.service";

// ─────────────────────────────────────────────
// PHASE 1 — CLEANER ONBOARDING
// ─────────────────────────────────────────────

/**
 * GET /payments/onboarding/link
 * Returns the Stripe hosted onboarding URL for the authenticated cleaner.
 */
const getOnboardingLink = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const result = await PaymentService.getOnboardingLink(cleanerId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Onboarding link generated. Direct cleaner to complete bank setup.",
    data: result,
  });
});

/**
 * GET /payments/dashboard-link
 * Returns the Stripe Express dashboard login link for the authenticated cleaner.
 */
const getDashboardLink = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const result = await PaymentService.getDashboardLink(cleanerId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard link generated",
    data: result,
  });
});

// ─────────────────────────────────────────────
// PHASE 2 — CUSTOMER HOLDS PAYMENT
// ─────────────────────────────────────────────

/**
 * POST /payments/:bookingId/hold
 * Body: { paymentMethodId: string }
 *
 * Authorises the card and HOLDS the money without capturing it.
 * Cleaner must be onboarded before this works.
 */
const holdPayment = catchAsync(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const customerId = req.user.id as string;
  const { paymentMethodId } = req.body;

  if (!paymentMethodId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "paymentMethodId is required",
      data: null,
    });
  }

  const result = await PaymentService.holdPayment(
    bookingId as string,
    customerId,
    paymentMethodId as string
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// ─────────────────────────────────────────────
// PHASE 3 — CUSTOMER CONFIRMS JOB DONE → RELEASE
// ─────────────────────────────────────────────

/**
 * POST /payments/:bookingId/release
 * Captures the held payment — money flows to cleaner's bank minus platform fee.
 * Only callable after cleaner has uploaded completion evidence.
 */
const releasePayment = catchAsync(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const customerId = req.user.id as string;
  const result = await PaymentService.releasePayment(bookingId as string, customerId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// ─────────────────────────────────────────────
// CANCEL — Release hold without charge
// ─────────────────────────────────────────────

/**
 * POST /payments/:bookingId/cancel
 * Cancels the PaymentIntent (releases the auth hold, no charge).
 */
const cancelHeldPayment = catchAsync(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const userId = req.user.id as string;
  const result = await PaymentService.cancelHeldPayment(bookingId as string, userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

// ─────────────────────────────────────────────
// ATTACH PAYMENT METHOD
// ─────────────────────────────────────────────

/**
 * POST /payments/attach-method
 * Body: { paymentMethodId: string }
 * Attaches a Stripe PaymentMethod to the customer's Stripe Customer object.
 */
const attachPaymentMethod = catchAsync(async (req: Request, res: Response) => {
  const customerId = req.user.id;
  const { paymentMethodId } = req.body;

  if (!paymentMethodId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "paymentMethodId is required",
      data: null,
    });
  }

  const result = await PaymentService.attachPaymentMethod(customerId, paymentMethodId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

// ─────────────────────────────────────────────
// PHASE 4 — STRIPE WEBHOOK
// ─────────────────────────────────────────────

/**
 * POST /payments/webhook
 * Raw body required — registered BEFORE express.json() middleware in app.ts.
 *
 * Handles:
 *  - account.updated              (cleaner verified)
 *  - payment_intent.succeeded     (payment captured)
 *  - payment_intent.canceled      (booking cancelled)
 *  - payment_intent.payment_failed (payment failed)
 *  - payout.paid                  (money in cleaner's bank)
 */
const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  console.log(signature);

  if (!signature) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Missing stripe-signature header",
      data: null,
    });
  }

  // Use rawBody saved by express.json verify hook in app.ts
  const rawBody = (req as any).rawBody as Buffer;
  if (!rawBody) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Raw body not found — webhook misconfigured",
      data: null,
    });
  }

  const event = PaymentService.verifyWebhookSignature(rawBody, signature);
  await PaymentService.handleWebhookEvent(event);

  // Stripe expects a 2xx response quickly
  res.status(200).json({ received: true });
});

export const PaymentController = {
  getOnboardingLink,
  getDashboardLink,
  holdPayment,
  releasePayment,
  cancelHeldPayment,
  attachPaymentMethod,
  handleWebhook,
};

import express from "express";
import auth from "../../middlewares/auth";
import { Role } from "@prisma/client";
import { PaymentController } from "./payment.controller";

const router = express.Router();

// ─────────────────────────────────────────────
// PHASE 4 — Stripe Webhook (MUST be before any body parsers on this route)
// Raw body is required so Stripe can verify the signature.
// ─────────────────────────────────────────────
router.post("/webhook", PaymentController.handleWebhook);

// ─────────────────────────────────────────────
// PHASE 1 — Cleaner Onboarding
// ─────────────────────────────────────────────

/** GET /payments/onboarding/link  → returns Stripe hosted onboarding URL */
router.get("/onboarding/link", auth(Role.CLEANER), PaymentController.getOnboardingLink);

/** GET /payments/dashboard-link  → returns Stripe Express dashboard URL */
router.get("/dashboard-link", auth(Role.CLEANER), PaymentController.getDashboardLink);

// ─────────────────────────────────────────────
// Customer — Attach Payment Method
// ─────────────────────────────────────────────

/** POST /payments/attach-method  → attach card to customer's Stripe account */
router.post("/attach-method", auth(Role.CUSTOMER), PaymentController.attachPaymentMethod);

// ─────────────────────────────────────────────
// PHASE 2 — Hold Payment at Booking Time
// ─────────────────────────────────────────────

/** POST /payments/:bookingId/hold  → authorise & hold payment */
router.post("/:bookingId/hold", auth(Role.CUSTOMER), PaymentController.holdPayment);

// ─────────────────────────────────────────────
// PHASE 3 — Release Payment (Customer Confirms Job Done)
// ─────────────────────────────────────────────

/** POST /payments/:bookingId/release  → capture held payment to cleaner */
router.post("/:bookingId/release", auth(Role.CUSTOMER), PaymentController.releasePayment);

// ─────────────────────────────────────────────
// Cancel — Booking Cancelled (release hold)
// ─────────────────────────────────────────────

/** POST /payments/:bookingId/cancel  → cancel PaymentIntent (no charge) */
router.post(
  "/:bookingId/cancel",
  auth(Role.CUSTOMER, Role.CLEANER),
  PaymentController.cancelHeldPayment
);

export const PaymentRoutes = router;

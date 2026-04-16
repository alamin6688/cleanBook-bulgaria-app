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

// ─────────────────────────────────────────────
// BANK ACCOUNT MANAGEMENT (for Cleaners)
// ─────────────────────────────────────────────

const addBankAccount = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const { bankToken } = req.body;

  if (!bankToken) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "bankToken is required",
      data: null,
    });
  }

  const result = await PaymentService.addBankAccount(cleanerId, bankToken);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Bank account added successfully",
    data: result,
  });
});

const listBankAccounts = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const result = await PaymentService.listBankAccounts(cleanerId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bank accounts retrieved successfully",
    data: result,
  });
});

const getBankAccount = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const { bankAccountId } = req.params;
  const result = await PaymentService.getBankAccount(cleanerId, bankAccountId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bank account retrieved successfully",
    data: result,
  });
});

const setDefaultBankAccount = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const { bankAccountId } = req.params;
  const result = await PaymentService.setDefaultBankAccount(cleanerId, bankAccountId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bank account set as default successfully",
    data: result,
  });
});

const deleteBankAccount = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const { bankAccountId } = req.params;
  const result = await PaymentService.deleteBankAccount(cleanerId, bankAccountId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bank account deleted successfully",
    data: result,
  });
});

const verifyBankAccount = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const { bankAccountId } = req.params;
  const { amounts } = req.body;

  if (!amounts || !Array.isArray(amounts)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "amounts (array) is required for verification",
      data: null,
    });
  }

  const result = await PaymentService.verifyBankAccount(cleanerId, bankAccountId as string, amounts);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bank account verification submitted",
    data: result,
  });
});

/**
 * Serves a simple HTML page for successful onboarding.
 */
const onboardingSuccessHTML = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Onboarding Successful</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f6f9fc; }
        .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08); text-align: center; max-width: 400px; width: 90%; }
        h1 { color: #32325d; margin-bottom: 16px; font-size: 24px; }
        p { color: #6b7c93; line-height: 1.6; margin-bottom: 24px; }
        .button { background-color: #635bff; color: white; border: none; padding: 12px 24px; border-radius: 4px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background-color 0.15s ease; }
        .button:hover { background-color: #5851d8; }
        .icon { font-size: 48px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✅</div>
        <h1>Setup Successful!</h1>
        <p>Your bank account has been connected. You can now receive payments for your services.</p>
        <p>You may now close this window and return to the app.</p>
      </div>
    </body>
  </html>
`;

/**
 * Serves a simple HTML page for refreshing onboarding.
 */
const onboardingRefreshHTML = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Refresh Onboarding</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f6f9fc; }
        .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08); text-align: center; max-width: 400px; width: 90%; }
        h1 { color: #32325d; margin-bottom: 16px; font-size: 24px; }
        p { color: #6b7c93; line-height: 1.6; margin-bottom: 24px; }
        .button { background-color: #635bff; color: white; border: none; padding: 12px 24px; border-radius: 4px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background-color 0.15s ease; }
        .button:hover { background-color: #5851d8; }
        .icon { font-size: 48px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">🔄</div>
        <h1>Session Expired</h1>
        <p>The setup link has expired or was already used. Please go back to the app and click "Complete Bank Setup" again to generate a new link.</p>
      </div>
    </body>
  </html>
`;

export const PaymentController = {
  getOnboardingLink,
  getDashboardLink,
  holdPayment,
  releasePayment,
  cancelHeldPayment,
  attachPaymentMethod,
  handleWebhook,
  // Bank Account Management
  addBankAccount,
  listBankAccounts,
  getBankAccount,
  setDefaultBankAccount,
  deleteBankAccount,
  verifyBankAccount,
  // HTML Views
  onboardingSuccess: (req: Request, res: Response) => res.send(onboardingSuccessHTML),
  onboardingRefresh: (req: Request, res: Response) => res.send(onboardingRefreshHTML),
};

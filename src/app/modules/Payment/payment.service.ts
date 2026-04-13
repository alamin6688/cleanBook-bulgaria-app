import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import stripe, {
  createStripeAccount,
  addBankAccount as stripeAddBank,
  listBankAccounts as stripeListBanks,
  retrieveBankAccount as stripeGetBank,
  updateBankAccount as stripeUpdateBank,
  deleteBankAccount as stripeDeleteBank,
  verifyBankAccount as stripeVerifyBank,
  StripeExternalAccountResponse,
  StripeBankAccountListResponse,
  StripeDeletedExternalAccountResponse,
} from "../../../utils/Stripe/stripe";
import { BookingStatus } from "@prisma/client";

// ─────────────────────────────────────────────
// PHASE 1 — CLEANER ONBOARDING
// ─────────────────────────────────────────────

/**
 * Generate / refresh a Stripe hosted onboarding link for a cleaner.
 * Called when cleaner taps "Complete Bank Setup" in the app.
 */
const getOnboardingLink = async (cleanerId: string) => {
  const cleaner = await prisma.user.findUnique({
    where: { id: cleanerId },
    include: { cleanerProfile: true },
  });

  if (!cleaner || !cleaner.cleanerProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner not found");
  }

  const profile = cleaner.cleanerProfile;

  // If no Stripe account yet (e.g. registration failed), create one now
  if (!profile.stripeAccountId) {
    const account = await stripe.accounts.create({
      controller: {
        fees: { payer: "application" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
        stripe_dashboard: { type: "none" },
      },
      country: "US",
      email: cleaner.email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: "individual",
      metadata: { cleanerId },
    });

    await prisma.cleanerProfile.update({
      where: { userId: cleanerId },
      data: { stripeAccountId: account.id },
    });

    profile.stripeAccountId = account.id;
  }

  const accountLink = await stripe.accountLinks.create({
    account: profile.stripeAccountId,
    refresh_url: `${process.env.FRONTEND_URL}/cleaner/stripe/refresh`,
    return_url: `${process.env.FRONTEND_URL}/cleaner/stripe/success`,
    type: "account_onboarding",
  });

  return {
    onboardingUrl: accountLink.url,
    stripeAccountId: profile.stripeAccountId,
    isOnboarded: profile.stripeOnboarded,
  };
};

/**
 * Return the cleaner's Stripe Express dashboard login link.
 * Only works after they have completed onboarding.
 */
const getDashboardLink = async (cleanerId: string) => {
  const profile = await prisma.cleanerProfile.findUnique({
    where: { userId: cleanerId },
  });

  if (!profile?.stripeAccountId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cleaner has not connected a Stripe account");
  }

  if (!profile.stripeOnboarded) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cleaner has not completed Stripe onboarding");
  }

  const loginLink = await stripe.accounts.createLoginLink(profile.stripeAccountId);
  return { dashboardUrl: loginLink.url };
};

// ─────────────────────────────────────────────
// PHASE 2 — CUSTOMER PAYS (MONEY HELD)
// ─────────────────────────────────────────────

/**
 * Create a PaymentIntent with capture_method: 'manual' so money is
 * authorised but NOT captured until the customer confirms job done.
 *
 * Requires: customer has added a payment method & cleaner is onboarded.
 */
const holdPayment = async (
  bookingId: string,
  customerId: string,
  paymentMethodId: string
): Promise<{
  paymentIntentId: string;
  status: string;
  amountHeld: number;
  platformFee: number;
  cleanerReceives: number;
  message: string;
}> => {
  // 1. Load booking
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      cleaner: { include: { cleanerProfile: true } },
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");

  // 2. Ownership check
  if (booking.customerId !== customerId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  // 3. Idempotency — already held?
  if (booking.paymentStatus === "PAYMENT_HELD" || booking.paymentStatus === "PAID") {
    throw new ApiError(httpStatus.BAD_REQUEST, `Payment is already ${booking.paymentStatus}`);
  }

  // 4. Check cleaner is onboarded
  const cleanerProfile = booking.cleaner?.cleanerProfile;
  if (!cleanerProfile?.stripeOnboarded || !cleanerProfile.stripeAccountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This cleaner has not completed bank setup yet. Payment cannot be processed."
    );
  }

  // 5. Resolve or create a Stripe Customer for this customer user
  let stripeCustomerId = booking.customer?.customerProfile?.stripeCustomerId;
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      email: booking.customer.email,
      metadata: { userId: customerId },
    });
    stripeCustomerId = stripeCustomer.id;
    await prisma.customerProfile.update({
      where: { userId: customerId },
      data: { stripeCustomerId },
    });
  }

  // 6. Attach / verify payment method
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (pm.customer && pm.customer !== stripeCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "This card is already used by another account");
  }
  if (!pm.customer) {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
  }

  // 7. Calculate amounts based on +5% Customer / -5% Cleaner logic
  const amountInCents = Math.round(booking.totalCharge * 100); // Total customer pays ($105)
  const cleanerReceivesInCents = Math.round(booking.charge * 0.95 * 100); // Cleaner gets Base - 5% ($95)
  const platformFeeInCents = amountInCents - cleanerReceivesInCents; // Platform takes the difference ($10)

  // 8. Create PaymentIntent — HOLD, do not capture yet
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    capture_method: "manual", // ← authorise only; money held
    transfer_data: {
      destination: cleanerProfile.stripeAccountId, // release to cleaner's bank
    },
    application_fee_amount: platformFeeInCents, // platform cut ($10)
    metadata: {
      bookingId,
      customerId,
      cleanerId: booking.cleanerId,
    },
  });

  // 9. Persist paymentIntentId + status
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentIntentId: paymentIntent.id,
      paymentStatus: "PAYMENT_HELD",
      status: BookingStatus.CONFIRMED,
    },
  });

  return {
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    amountHeld: booking.totalCharge,
    platformFee: platformFeeInCents / 100,
    cleanerReceives: cleanerReceivesInCents / 100,
    message: "Payment held. Funds will be released when you confirm the job is done.",
  };
};

// ─────────────────────────────────────────────
// PHASE 3 — CUSTOMER CONFIRMS JOB DONE → RELEASE
// ─────────────────────────────────────────────

/**
 * Customer taps "Confirm Job Done" → we capture the held payment.
 * Money flows to cleaner's bank (minus platform fee).
 */
const releasePayment = async (
  bookingId: string,
  customerId: string
): Promise<{
  paymentIntentId: string;
  status: string;
  message: string;
}> => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");

  // Ownership check
  if (booking.customerId !== customerId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  // Must be in COMPLETION_REQUESTED state (cleaner uploaded evidence)
  if (booking.status !== BookingStatus.COMPLETION_REQUESTED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot release payment: cleaner has not requested completion yet"
    );
  }

  // Payment must be held
  if (booking.paymentStatus !== "PAYMENT_HELD") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot release payment: current payment status is ${booking.paymentStatus}`
    );
  }

  if (!booking.paymentIntentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No payment intent found for this booking");
  }

  // Capture the held funds — money flows to cleaner
  const captured = await stripe.paymentIntents.capture(booking.paymentIntentId);

  // Update booking — webhook will also confirm, but we update optimistically
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.COMPLETE,
      paymentStatus: "PAID",
    },
  });

  // Increment cleaner's job count
  await prisma.cleanerProfile.update({
    where: { userId: booking.cleanerId },
    data: { totalJobs: { increment: 1 } },
  });

  return {
    paymentIntentId: captured.id,
    status: captured.status,
    message: "Payment released to cleaner. Job marked as complete.",
  };
};

// ─────────────────────────────────────────────
// CANCEL PAYMENT (booking cancelled before job)
// ─────────────────────────────────────────────

const cancelHeldPayment = async (bookingId: string, userId: string) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");

  if (booking.customerId !== userId && booking.cleanerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (!booking.paymentIntentId) {
    // No payment was ever made — just cancel the booking
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED, paymentStatus: "CANCELLED" },
    });
    return { message: "Booking cancelled (no payment to void)" };
  }

  if (booking.paymentStatus === "PAYMENT_HELD") {
    // Cancel the PaymentIntent — releases the hold (no charge)
    await stripe.paymentIntents.cancel(booking.paymentIntentId);
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.CANCELLED, paymentStatus: "CANCELLED" },
  });

  return { message: "Booking cancelled and payment hold released" };
};

// ─────────────────────────────────────────────
// PHASE 4 — WEBHOOKS
// ─────────────────────────────────────────────

type StripeEvent = ReturnType<typeof stripe.webhooks.constructEvent>;

const verifyWebhookSignature = (rawBody: Buffer | string, signature: string): StripeEvent => {
  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Webhook signature failed: ${err.message}`);
  }
};

const handleWebhookEvent = async (event: any) => {
  const obj = event.data.object;

  switch (event.type) {
    // ── Cleaner verified & onboarded ───────────────────────────────────
    case "account.updated": {
      const account = obj;
      if (account.details_submitted && account.charges_enabled) {
        await prisma.cleanerProfile.updateMany({
          where: { stripeAccountId: account.id },
          data: { stripeOnboarded: true },
        });
        console.log(`[Webhook] Cleaner onboarded: stripeAccountId=${account.id}`);
      }
      break;
    }

    // ── Payment captured (money released to cleaner) ───────────────────
    case "payment_intent.succeeded": {
      const pi = obj;
      const bookingId = pi.metadata?.bookingId;
      if (bookingId) {
        await prisma.booking.updateMany({
          where: { id: bookingId, paymentStatus: { not: "PAID" } },
          data: { paymentStatus: "PAID", status: BookingStatus.COMPLETE },
        });
        console.log(`[Webhook] payment_intent.succeeded: booking=${bookingId}`);
      }
      break;
    }

    // ── Payment cancelled / hold released ──────────────────────────────
    case "payment_intent.canceled": {
      const pi = obj;
      const bookingId = pi.metadata?.bookingId;
      if (bookingId) {
        await prisma.booking.updateMany({
          where: { id: bookingId },
          data: { paymentStatus: "CANCELLED", status: BookingStatus.CANCELLED },
        });
        console.log(`[Webhook] payment_intent.canceled: booking=${bookingId}`);
      }
      break;
    }

    // ── Payment failed ─────────────────────────────────────────────────
    case "payment_intent.payment_failed": {
      const pi = obj;
      const bookingId = pi.metadata?.bookingId;
      const reason = pi.last_payment_error?.message || "Unknown error";
      if (bookingId) {
        await prisma.booking.updateMany({
          where: { id: bookingId },
          data: { paymentStatus: "FAILED" },
        });
        console.log(
          `[Webhook] payment_intent.payment_failed: booking=${bookingId}, reason=${reason}`
        );
        // TODO: send push notification to customer
      }
      break;
    }

    // ── Money hit cleaner's bank account ──────────────────────────────
    case "payout.paid": {
      const payout = obj;
      // Payout is on the connected account — identify by stripeAccountId
      const stripeAccountId = event.account; // Stripe sets this for Connect events
      if (stripeAccountId) {
        const profile = await prisma.cleanerProfile.findFirst({
          where: { stripeAccountId },
          include: { user: true },
        });
        if (profile) {
          console.log(
            `[Webhook] payout.paid: cleaner=${profile.userId} amount=${payout.amount / 100} ${payout.currency}`
          );
          // TODO: send push notification to cleaner
        }
      }
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event: ${event.type}`);
  }
};

// ─────────────────────────────────────────────
// ATTACH PAYMENT METHOD (customer adds card)
// ─────────────────────────────────────────────

const attachPaymentMethod = async (customerId: string, paymentMethodId: string) => {
  const profile = await prisma.customerProfile.findUnique({
    where: { userId: customerId },
  });

  if (!profile?.stripeCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Customer Stripe account not found");
  }

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

  if (pm.customer && pm.customer !== profile.stripeCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "This card is already used by another account");
  }

  if (!pm.customer) {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: profile.stripeCustomerId,
    });
  }

  await stripe.customers.update(profile.stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  return { message: "Payment method attached successfully" };
};

// ─────────────────────────────────────────────
// BANK ACCOUNT MANAGEMENT (for Cleaners)
// ─────────────────────────────────────────────

const getCleanerStripeAccountId = async (cleanerId: string) => {
  const profile = await prisma.cleanerProfile.findUnique({
    where: { userId: cleanerId },
    include: { user: true },
  });

  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner profile not found.");
  }

  if (profile.stripeAccountId) {
    return profile.stripeAccountId;
  }

  // Automatically create Stripe account if it doesn't exist so they can add bank details right away
  const cleanerName = profile.displayName || profile.user.email.split("@")[0];
  const stripeAccountId = await createStripeAccount(profile.user.email, cleanerId, cleanerName);

  await prisma.cleanerProfile.update({
    where: { userId: cleanerId },
    data: { stripeAccountId },
  });

  return stripeAccountId;
};

const addBankAccount = async (
  cleanerId: string,
  bankToken: string
): Promise<StripeExternalAccountResponse> => {
  const stripeAccountId = await getCleanerStripeAccountId(cleanerId);
  const bankAccount = await stripeAddBank(stripeAccountId, bankToken);
  return bankAccount;
};

const listBankAccounts = async (cleanerId: string): Promise<StripeBankAccountListResponse> => {
  const stripeAccountId = await getCleanerStripeAccountId(cleanerId);
  const bankAccounts = await stripeListBanks(stripeAccountId);
  return bankAccounts;
};

const getBankAccount = async (
  cleanerId: string,
  bankAccountId: string
): Promise<StripeExternalAccountResponse> => {
  const stripeAccountId = await getCleanerStripeAccountId(cleanerId);
  const bankAccount = await stripeGetBank(stripeAccountId, bankAccountId);
  return bankAccount;
};

const setDefaultBankAccount = async (
  cleanerId: string,
  bankAccountId: string
): Promise<StripeExternalAccountResponse> => {
  const stripeAccountId = await getCleanerStripeAccountId(cleanerId);
  // Stripe documentation: default_for_currency=true on the external account
  const updated = await stripeUpdateBank(stripeAccountId, bankAccountId, {
    default_for_currency: true,
  });
  return updated;
};

const deleteBankAccount = async (
  cleanerId: string,
  bankAccountId: string
): Promise<StripeDeletedExternalAccountResponse> => {
  const stripeAccountId = await getCleanerStripeAccountId(cleanerId);
  const deleted = await stripeDeleteBank(stripeAccountId, bankAccountId);
  return deleted;
};

const verifyBankAccount = async (
  cleanerId: string,
  bankAccountId: string,
  amounts: number[]
): Promise<StripeExternalAccountResponse> => {
  const stripeAccountId = await getCleanerStripeAccountId(cleanerId);
  const verified = await stripeVerifyBank(stripeAccountId, bankAccountId, amounts);
  return verified;
};

export const PaymentService = {
  // Phase 1
  getOnboardingLink,
  getDashboardLink,
  // Phase 2
  holdPayment,
  // Phase 3
  releasePayment,
  // Cancel
  cancelHeldPayment,
  // Phase 4
  verifyWebhookSignature,
  handleWebhookEvent,
  // Utilities
  attachPaymentMethod,
  // Bank Account Management
  addBankAccount,
  listBankAccounts,
  getBankAccount,
  setDefaultBankAccount,
  deleteBankAccount,
  verifyBankAccount,
};

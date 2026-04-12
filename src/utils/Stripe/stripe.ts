import Stripe from "stripe";
import config from "../../config";
import httpStatus from "http-status";
import ApiError from "../../errors/apiError";

const stripe: InstanceType<typeof Stripe> = new Stripe(config.stripe.secretKey as string, {
  apiVersion: "2025-12-15.clover" as any,
});

// ─── CLEANER ACCOUNT (Express) ───────────────────────────
export const createStripeAccount = async (userEmail: string, cleanerId: string) => {
  try {
    const account = await stripe.accounts.create({
      controller: {
        fees: { payer: "application" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
        stripe_dashboard: { type: "none" },
      },
      country: "US",
      email: userEmail,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: "individual",
      settings: {
        payouts: {
          schedule: {
            interval: "daily",
          },
        },
      },
      metadata: {
        cleanerId, // links stripe account to your DB cleaner
      },
    });

    return account.id; // save this in your DB
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to create Stripe account"
    );
  }
};

// ─── ONBOARDING LINK ─────────────────────────────────────
export const generateAccountLink = async (stripeAccountId: string) => {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${config.app.frontendUrl}/cleaner/stripe/refresh`,
      return_url: `${config.app.frontendUrl}/cleaner/stripe/success`,
      type: "account_onboarding",
    });

    return accountLink.url;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to generate onboarding link"
    );
  }
};

type StripeCustomerResponse = Awaited<ReturnType<typeof stripe.customers.create>>;

// ─── STRIPE CUSTOMER (for booking customer) ──────────────
export const createStripeCustomer = async (
  email: string,
  name: string,
  paymentMethodId?: string // optional at registration time
): Promise<StripeCustomerResponse> => {
  try {
    const customer = await stripe.customers.create({
      email,
      name,
      ...(paymentMethodId
        ? {
            payment_method: paymentMethodId,
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          }
        : {}),
    });

    return customer;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to create Stripe customer"
    );
  }
};

// ─── ATTACH PAYMENT METHOD ───────────────────────────────
export const attachPaymentMethod = async (paymentMethodId: string, stripeCustomerId: string) => {
  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer && paymentMethod.customer !== stripeCustomerId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "This card is already used by another account");
    }

    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId,
      });
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  } catch (error: any) {
    if (error.code === "payment_method_already_attached") return;
    if (error instanceof ApiError) throw error;

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Payment processing failed"
    );
  }
};

type StripePaymentIntentResponse = Awaited<ReturnType<typeof stripe.paymentIntents.create>>;

// ─── CREATE PAYMENT INTENT (HOLD MONEY) ──────────────────
export const createPaymentIntent = async (
  stripeCustomerId: string,
  paymentMethodId: string,
  cleanerStripeAccountId: string, // ← cleaner's acct_xxx id
  amount: number,
  bookingId: string,
  cleanerId: string
): Promise<StripePaymentIntentResponse> => {
  try {
    const amountInCents = Math.round(amount * 100);
    const platformFee = Math.round(amountInCents * 0.1); // 10% cut

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      capture_method: "manual", // ← HOLDS money, no release yet
      transfer_data: {
        destination: cleanerStripeAccountId, // ← cleaner's stripe acct
      },
      application_fee_amount: platformFee, // ← your 10% platform cut
      metadata: {
        bookingId,
        cleanerId,
      },
    });

    return paymentIntent;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to create payment intent"
    );
  }
};

// ─── RELEASE PAYMENT (customer confirms job done) ─────────
export const releasePaymentToCleaner = async (
  paymentIntentId: string
): Promise<StripePaymentIntentResponse> => {
  try {
    // This is what actually sends money to cleaner
    const captured = await stripe.paymentIntents.capture(paymentIntentId);
    return captured;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to release payment to cleaner"
    );
  }
};

// ─── CANCEL PAYMENT (booking cancelled before job) ────────
export const cancelPayment = async (
  paymentIntentId: string
): Promise<StripePaymentIntentResponse> => {
  try {
    const cancelled = await stripe.paymentIntents.cancel(paymentIntentId);
    return cancelled;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to cancel payment"
    );
  }
};

// ─── CHECK IF CLEANER IS VERIFIED ─────────────────────────
export const getStripeAccountStatus = async (stripeAccountId: string) => {
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);

    return {
      isVerified: account.details_submitted && account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    };
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve account status"
    );
  }
};

// ─── CLEANER DASHBOARD LOGIN LINK ─────────────────────────
export const getLoginLink = async (stripeAccountId: string) => {
  try {
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    return loginLink.url;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve login link"
    );
  }
};

// ─── EXTERNAL ACCOUNTS (BANK ACCOUNTS) ──────────────────
export type StripeExternalAccountResponse = Awaited<
  ReturnType<typeof stripe.accounts.createExternalAccount>
>;
export type StripeBankAccountListResponse = Awaited<
  ReturnType<typeof stripe.accounts.listExternalAccounts>
>["data"];
export type StripeDeletedExternalAccountResponse = Awaited<
  ReturnType<typeof stripe.accounts.deleteExternalAccount>
>;

export const addBankAccount = async (
  stripeAccountId: string,
  bankToken: string
): Promise<StripeExternalAccountResponse> => {
  try {
    return await stripe.accounts.createExternalAccount(stripeAccountId, {
      external_account: bankToken,
    });
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to add bank account"
    );
  }
};

export const listBankAccounts = async (
  stripeAccountId: string
): Promise<StripeBankAccountListResponse> => {
  try {
    const accounts = await stripe.accounts.listExternalAccounts(stripeAccountId, {
      object: "bank_account",
    });
    return accounts.data;
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to list bank accounts"
    );
  }
};

export const retrieveBankAccount = async (
  stripeAccountId: string,
  bankAccountId: string
): Promise<StripeExternalAccountResponse> => {
  try {
    return await stripe.accounts.retrieveExternalAccount(stripeAccountId, bankAccountId);
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve bank account"
    );
  }
};

export const updateBankAccount = async (
  stripeAccountId: string,
  bankAccountId: string,
  data: Parameters<(typeof stripe.accounts)["updateExternalAccount"]>[2]
): Promise<StripeExternalAccountResponse> => {
  try {
    return await stripe.accounts.updateExternalAccount(stripeAccountId, bankAccountId, data);
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to update bank account"
    );
  }
};

export const deleteBankAccount = async (
  stripeAccountId: string,
  bankAccountId: string
): Promise<StripeDeletedExternalAccountResponse> => {
  try {
    return await stripe.accounts.deleteExternalAccount(stripeAccountId, bankAccountId);
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to delete bank account"
    );
  }
};

export const verifyBankAccount = async (
  stripeAccountId: string,
  bankAccountId: string,
  amounts: number[]
): Promise<StripeExternalAccountResponse> => {
  try {
    return (await (stripe.accounts as any).verifyExternalAccount(stripeAccountId, bankAccountId, {
      amounts,
    })) as StripeExternalAccountResponse;
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to verify bank account"
    );
  }
};

export default stripe;

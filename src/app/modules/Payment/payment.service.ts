import httpStatus from "http-status";
import Stripe from "stripe";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import config from "../../../config";
import { ICreatePaymentIntent, IProcessPayment } from "./payment.interface";
import { BookingStatus } from "@prisma/client";

// Initialize Stripe with validation
const getStripeInstance = () => {
  if (!config.stripe.secretKey) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables."
    );
  }

  return new Stripe(config.stripe.secretKey, {
    apiVersion: "2026-03-25.dahlia" as any,
  });
};

let stripe: any = null;

const initializeStripe = () => {
  if (!stripe) {
    stripe = getStripeInstance();
  }
  return stripe;
};

const createPaymentIntent = async (data: ICreatePaymentIntent) => {
  const { bookingId, amount, currency = "usd", description } = data;

  // Verify booking exists and is in PENDING status
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: {
        select: { id: true, name: true, email: true },
      },
      cleaner: {
        select: { id: true, name: true },
      },
      serviceCategory: true,
    },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.paymentStatus === "PAID") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Booking is already paid");
  }

  try {
    const stripeInstance = initializeStripe();

    // Create Stripe Payment Intent
    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount, // Amount in cents (e.g., 50000 = $500.00)
      currency,
      description: description || `Cleaning Service - Booking #${bookingId}`,
      metadata: {
        bookingId,
        customerId: booking.customerId,
        cleanerId: booking.cleanerId,
        serviceName: booking.serviceCategory.name,
        bookingDate: booking.date.toISOString(),
      },
      receipt_email: booking.customer.email,
    });

    // Store paymentIntentId in booking
    await prisma.booking.update({
      where: { id: bookingId },
      data: { paymentIntentId: paymentIntent.id },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
      status: paymentIntent.status,
      booking: {
        id: booking.id,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        charge: booking.charge,
        platformCharge: booking.platformCharge,
        totalCharge: booking.totalCharge,
      },
    };
  } catch (error: any) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Stripe error: ${error.message}`);
  }
};

const handlePaymentSuccess = async (paymentIntentId: string) => {
  try {
    const stripeInstance = initializeStripe();
    // Retrieve the payment intent to verify
    const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Payment intent has not succeeded");
    }

    const bookingId = paymentIntent.metadata.bookingId;

    // Update booking payment status to PAID
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: "PAID",
      },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
          },
        },
        cleaner: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      message: "Payment processed successfully",
      booking: {
        id: updatedBooking.id,
        paymentStatus: updatedBooking.paymentStatus,
        status: updatedBooking.status,
      },
    };
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Payment processing error: ${error.message}`
    );
  }
};

const handlePaymentFailure = async (paymentIntentId: string, reason: string) => {
  try {
    const stripeInstance = initializeStripe();
    const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);

    const bookingId = paymentIntent.metadata.bookingId;

    // Update booking payment status to FAILED
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: "FAILED",
      },
    });

    return {
      success: true,
      message: `Payment failed: ${reason}`,
      bookingId,
    };
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to process payment failure: ${error.message}`
    );
  }
};

const verifyWebhookSignature = (body: string, signature: string): any => {
  try {
    const stripeInstance = initializeStripe();
    const event = stripeInstance.webhooks.constructEvent(body, signature, config.stripe.webhookSecret);
    return event;
  } catch (error: any) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Webhook signature verification failed: ${error.message}`
    );
  }
};

const refundPayment = async (paymentIntentId: string) => {
  try {
    const stripeInstance = initializeStripe();
    const refund = await stripeInstance.refunds.create({
      payment_intent: paymentIntentId,
    });

    // Update booking
    const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);
    const bookingId = paymentIntent.metadata.bookingId;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: "REFUNDED",
        status: BookingStatus.CANCELLED,
      },
    });

    return {
      success: true,
      message: "Payment refunded successfully",
      refundId: refund.id,
    };
  } catch (error: any) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Refund error: ${error.message}`);
  }
};

export const PaymentService = {
  createPaymentIntent,
  handlePaymentSuccess,
  handlePaymentFailure,
  verifyWebhookSignature,
  refundPayment,
};

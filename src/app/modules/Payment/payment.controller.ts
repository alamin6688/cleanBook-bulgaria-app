import { Request, Response } from "express";
import httpStatus from "http-status";
// import catchAsync from "../../../utils/catchAsync";
// import sendResponse from "../../../utils/sendResponse";
import { PaymentService } from "./payment.service";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";

const createPaymentIntent = catchAsync(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const userId = req.user.userId;

  // Verify booking belongs to user
  const { booking } = await req.app.locals.prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      customerId: true,
      totalCharge: true,
      serviceCategory: { select: { name: true } },
    },
  });

  if (!booking || booking.customerId !== userId) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: "Access denied",
      data: null,
    });
  }

  // Convert totalCharge to cents for Stripe
  const amountInCents = Math.round(booking.totalCharge * 100);

  const result = await PaymentService.createPaymentIntent({
    bookingId,
    amount: amountInCents,
    currency: "usd",
    description: `Cleaning Service - ${booking.serviceCategory.name}`,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment intent created successfully",
    data: result,
  });
});

const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  const rawBody = req.body;

  const event = PaymentService.verifyWebhookSignature(JSON.stringify(rawBody), signature);

  // Handle payment_intent events
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    await PaymentService.handlePaymentSuccess(paymentIntent.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Payment processed successfully",
      data: null,
    });
  } else if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object;
    await PaymentService.handlePaymentFailure(
      paymentIntent.id,
      paymentIntent.last_payment_error?.message || "Unknown error"
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Payment failure recorded",
      data: null,
    });
  } else {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Event received",
      data: null,
    });
  }
});

const refundPayment = catchAsync(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const userId = req.user.userId;

  // Verify booking belongs to user
  const booking = await req.app.locals.prisma.booking.findUnique({
    where: { id: bookingId },
    select: { customerId: true, paymentIntentId: true },
  });

  if (!booking || booking.customerId !== userId) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: "Access denied",
      data: null,
    });
  }

  if (!booking.paymentIntentId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "No payment found to refund",
      data: null,
    });
  }

  const result = await PaymentService.refundPayment(booking.paymentIntentId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

export const PaymentController = {
  createPaymentIntent,
  handleWebhook,
  refundPayment,
};

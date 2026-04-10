import { Request, Response } from "express";
import httpStatus from "http-status";
// import catchAsync from "../../../utils/catchAsync";
// import sendResponse from "../../../utils/sendResponse";
import { BookingService } from "./booking.service";
import { IBookingSlotQuery, ICreateBooking } from "./booking.interface";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import ApiError from "../../../errors/apiError";
import config from "../../../config";

const getAvailableSlots = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as unknown as IBookingSlotQuery;
  const result = await BookingService.getAvailableSlots(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Available slots retrieved successfully",
    data: result,
  });
});

const createBooking = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const data = req.body as ICreateBooking;
  const result = await BookingService.createBooking(userId, data);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Booking created successfully",
    data: result,
  });
});

const getMyBookings = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { tab } = req.query;
  const result = await BookingService.getMyBookings(userId, role, tab as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My bookings retrieved successfully",
    data: result,
  });
});

const getBookingById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;
  const result = await BookingService.getBookingById(
    id as string,
    userId as string,
    role as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking retrieved successfully",
    data: result,
  });
});

const getBookingForPayment = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;
  const result = await BookingService.getBookingForPayment(id as string, userId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking details for payment retrieved successfully",
    data: result,
  });
});

const confirmBooking = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;
  const result = await BookingService.confirmBooking(id as string, userId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking confirmed successfully",
    data: result,
  });
});

const updatePaymentStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { paymentStatus } = req.body;
  const result = await BookingService.updatePaymentStatus(id as string, paymentStatus);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment status updated successfully",
    data: result,
  });
});

const getCleanerAvailability = catchAsync(async (req: Request, res: Response) => {
  const { cleanerId } = req.params;
  const result = await BookingService.getCleanerAvailability(cleanerId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cleaner availability retrieved successfully",
    data: result,
  });
});

const checkAvailabilityAndPrice = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingService.checkAvailabilityAndPrice(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Availability checked and price calculated successfully",
    data: result,
  });
});

const getAvailableCleaners = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingService.getAvailableCleaners(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Available cleaners retrieved successfully",
    data: result,
  });
});

const updateBookingStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.id;
  const role = req.user.role;
  const result = await BookingService.updateBookingStatus(
    id as string,
    userId as string,
    role as string,
    status,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking status updated successfully",
    data: result,
  });
});

const requestReschedule = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;
  const result = await BookingService.requestReschedule(id as string, userId as string, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reschedule requested successfully",
    data: result,
  });
});

const acceptReschedule = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;
  const result = await BookingService.acceptReschedule(id as string, userId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reschedule accepted successfully",
    data: result,
  });
});

const requestCompletion = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Extract file path if file was uploaded
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Please upload an image as evidence of completion");
  }

  const imageUrl = `${config.app.backendUrl}/uploads/images/${req.file.filename}`;
  const { completionNote } = req.body;

  const result = await BookingService.requestCompletion(
    id as string,
    userId as string,
    [imageUrl],
    completionNote
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Completion requested successfully",
    data: result,
  });
});

const confirmCompletion = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;
  const result = await BookingService.confirmCompletion(id as string, userId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Completion confirmed successfully",
    data: result,
  });
});

const cancelCompletion = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;
  const result = await BookingService.cancelCompletion(id as string, userId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Completion request rejected successfully",
    data: result,
  });
});

export const BookingController = {
  getAvailableSlots,
  getCleanerAvailability,
  createBooking,
  getMyBookings,
  getBookingById,
  getBookingForPayment,
  confirmBooking,
  updatePaymentStatus,
  checkAvailabilityAndPrice,
  getAvailableCleaners,
  updateBookingStatus,
  requestReschedule,
  acceptReschedule,
  requestCompletion,
  confirmCompletion,
  cancelCompletion,
};

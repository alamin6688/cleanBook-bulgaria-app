import { Request, Response } from "express";
import httpStatus from "http-status";
// import catchAsync from "../../../utils/catchAsync";
// import sendResponse from "../../../utils/sendResponse";
import { BookingService } from "./booking.service";
import { IBookingSlotQuery, ICreateBooking } from "./booking.interface";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";

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
  const result = await BookingService.getMyBookings(userId, role);

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

export const BookingController = {
  getAvailableSlots,
  getCleanerAvailability,
  createBooking,
  getMyBookings,
  getBookingById,
  getBookingForPayment,
  confirmBooking,
  updatePaymentStatus,
};

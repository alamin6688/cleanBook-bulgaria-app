import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import { AvailabilityService } from "./availability.service";

const updateAvailability = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await AvailabilityService.updateAvailability(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Availability updated successfully",
    data: result,
  });
});

const getAvailability = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await AvailabilityService.getAvailability(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Availability retrieved successfully",
    data: result,
  });
});

export const AvailabilityController = {
  updateAvailability,
  getAvailability,
};

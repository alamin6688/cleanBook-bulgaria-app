import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { UserService } from "./user.service";

const updateLanguage = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.updateLanguage(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Language updated successfully",
    data: result,
  });
});

const updateLocation = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.updateLocation(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Location updated successfully/handled",
    data: result,
  });
});

const updateBasicProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.updateBasicProfile(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Basic profile updated successfully",
    data: result,
  });
});

const updateCleanerDetails = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.updateCleanerDetails(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cleaner details updated successfully",
    data: result,
  });
});

const completeOnboarding = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  await UserService.completeOnboarding(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Onboarding completed successfully",
    data: null,
  });
});

export const UserController = {
  updateLanguage,
  updateLocation,
  updateBasicProfile,
  updateCleanerDetails,
  completeOnboarding,
};

import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/apiError";
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

const getNearbyCleaners = catchAsync(async (req: Request, res: Response) => {
  const { latitude, longitude, radius } = req.query;
  
  if (!latitude || !longitude) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Latitude and Longitude are required");
  }

  const result = await UserService.getNearbyCleaners(
    Number(latitude),
    Number(longitude),
    radius ? Number(radius) : undefined
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Nearby cleaners retrieved successfully",
    data: result,
  });
});

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.updateProfile(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully!",
    data: result,
  });
});

const getUserById = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getUserById(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User details retrieved successfully",
    data: result,
  });
});

const getProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getUserById(req.user.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile retrieved successfully",
    data: result,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.changePassword(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const UserController = {
  updateLanguage,
  updateLocation,
  updateBasicProfile,
  updateCleanerDetails,
  getNearbyCleaners,
  updateProfile,
  getUserById,
  getProfile,
  changePassword,
};

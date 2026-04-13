import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import { DashboardService } from "./dashboard.service";

const getCleanerDashboard = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const result = await DashboardService.getCleanerEarningsDashboard(cleanerId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cleaner earnings dashboard retrieved successfully",
    data: result,
  });
});

const getEarningsHistory = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const result = await DashboardService.getEarningsHistory(cleanerId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cleaner earnings history retrieved successfully",
    data: result,
  });
});

const getCleanerHomeData = catchAsync(async (req: Request, res: Response) => {
  const cleanerId = req.user.id;
  const result = await DashboardService.getCleanerHomeData(cleanerId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cleaner home page data retrieved successfully",
    data: result,
  });
});

export const DashboardController = {
  getCleanerDashboard,
  getEarningsHistory,
  getCleanerHomeData,
};

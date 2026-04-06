import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import { CleanerService_Service } from "./service.service";

const getMyServices = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await CleanerService_Service.getMyServices(user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Services retrieved successfully",
    data: result,
  });
});

const updateMyServices = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await CleanerService_Service.updateMyServices(user.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Services updated successfully",
    data: result,
  });
});

export const CleanerService_Controller = {
  getMyServices,
  updateMyServices,
};

import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import { ServiceAreaService } from "./serviceArea.service";

const createServiceArea = catchAsync(async (req: Request, res: Response) => {
  const result = await ServiceAreaService.createServiceArea(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Service area created successfully",
    data: result,
  });
});

const getAllServiceAreas = catchAsync(async (req: Request, res: Response) => {
  const result = await ServiceAreaService.getAllServiceAreas();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service areas retrieved successfully",
    data: result,
  });
});

const deleteServiceArea = catchAsync(async (req: Request, res: Response) => {
  const result = await ServiceAreaService.deleteServiceArea(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service area deleted successfully",
    data: result,
  });
});

export const ServiceAreaController = {
  createServiceArea,
  getAllServiceAreas,
  deleteServiceArea,
};

import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { PopularServiceService } from "./popularService.service";

const getPopularServices = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 12;

  const result = await PopularServiceService.getPopularServices(page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Popular services retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

export const PopularServiceController = {
  getPopularServices,
};

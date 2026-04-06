import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../../shared/catchAsync";
import sendResponse from "../../../../shared/sendResponse";
import { CategoryService } from "./category.service";

// Property Category
const createPropertyCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.createPropertyCategory(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Property category created successfully",
    data: result,
  });
});

const getAllPropertyCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.getAllPropertyCategories();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Property categories retrieved successfully",
    data: result,
  });
});

const updatePropertyCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CategoryService.updatePropertyCategory(id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Property category updated successfully",
    data: result,
  });
});

const deletePropertyCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CategoryService.deletePropertyCategory(id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Property category deleted successfully",
    data: result,
  });
});

// Service Category
const createServiceCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.createServiceCategory(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Service category created successfully",
    data: result,
  });
});

const getAllServiceCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.getAllServiceCategories();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service categories retrieved successfully",
    data: result,
  });
});

const updateServiceCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CategoryService.updateServiceCategory(id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service category updated successfully",
    data: result,
  });
});

const deleteServiceCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CategoryService.deleteServiceCategory(id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service category deleted successfully",
    data: result,
  });
});

// Additional Service Category
const createAdditionalServiceCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.createAdditionalServiceCategory(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Additional service category created successfully",
    data: result,
  });
});

const getAllAdditionalServiceCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.getAllAdditionalServiceCategories();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Additional service categories retrieved successfully",
    data: result,
  });
});

const updateAdditionalServiceCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CategoryService.updateAdditionalServiceCategory(id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Additional service category updated successfully",
    data: result,
  });
});

const deleteAdditionalServiceCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CategoryService.deleteAdditionalServiceCategory(id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Additional service category deleted successfully",
    data: result,
  });
});

export const CategoryController = {
  createPropertyCategory,
  getAllPropertyCategories,
  updatePropertyCategory,
  deletePropertyCategory,
  createServiceCategory,
  getAllServiceCategories,
  updateServiceCategory,
  deleteServiceCategory,
  createAdditionalServiceCategory,
  getAllAdditionalServiceCategories,
  updateAdditionalServiceCategory,
  deleteAdditionalServiceCategory,
};

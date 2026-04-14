import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { ContactService } from "./contact.service";

const submitContactUs = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { fullName, phoneNumber, email, description } = req.body;

  const result = await ContactService.submitContactUs(userId, {
    fullName,
    phoneNumber,
    email,
    description,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const ContactController = {
  submitContactUs,
};

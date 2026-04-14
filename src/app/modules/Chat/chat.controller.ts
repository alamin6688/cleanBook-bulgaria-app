import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { ChatService } from "./chat.service";

const getMyChatRooms = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const role = req.user.role;
  const search = req.query.search as string | undefined;

  const result = await ChatService.getMyChatRooms(userId, role, search);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Chat rooms retrieved successfully",
    data: result,
  });
});

const getMessages = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { chatRoomId } = req.params;
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;

  const result = await ChatService.getMessages(chatRoomId as string, userId, cursor, limit);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Messages retrieved successfully",
    data: result,
  });
});

const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { chatRoomId } = req.params;

  const result = await ChatService.getUnreadCount(chatRoomId as string, userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Unread count retrieved",
    data: result,
  });
});

export const ChatController = {
  getMyChatRooms,
  getMessages,
  getUnreadCount,
};

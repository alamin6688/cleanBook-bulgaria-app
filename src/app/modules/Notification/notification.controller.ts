import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import prisma from "../../../lib/prisma";
import { getSocketIO } from "../../../socket/socket";

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const notifications = await prisma.notification.findMany({
    where: { receiverId: userId },
    orderBy: { createdAt: "desc" },
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications retrieved successfully",
    data: notifications,
  });
});

const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;

  await prisma.notification.updateMany({
    where: { receiverId: userId, isRead: false },
    data: { isRead: true },
  });

  // Emit event to instantly clear the badge in the app
  const io = getSocketIO();
  io.to(userId).emit("notification:read_all", { userId });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All notifications marked as read",
    data: null,
  });
});

const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const count = await prisma.notification.count({
    where: { receiverId: userId, isRead: false },
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Unread count retrieved successfully",
    data: { unreadCount: count },
  });
});

export const NotificationController = {
  getMyNotifications,
  markAllAsRead,
  getUnreadCount,
};

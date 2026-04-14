import { NotificationType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { isUserOnline, getSocketIO } from "../../../socket/socket";
import admin from "../../lib/firebase";

const sendNotification = async (data: {
  receiverId: string;
  title: string;
  message: string;
  type: NotificationType;
  metadata?: any;
}) => {
  const { receiverId, title, message, type, metadata } = data;

  // 1. Save to Database
  const notification = await prisma.notification.create({
    data: {
      receiverId,
      title,
      message,
      type,
      metadata,
    },
  });

  // 2. Real-time Socket Alert
  if (isUserOnline(receiverId)) {
    const io = getSocketIO();
    io.to(receiverId).emit("notification:new", notification);
  }

  // 3. Push Notification (FCM)
  const user = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    try {
      // Only attempt to send if Firebase was actually initialized
      if (admin.apps.length > 0) {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: {
            title,
            body: message,
          },
          data: {
            type,
            metadata: JSON.stringify(metadata || {}),
          },
        });
        console.log(`[Push Notification] Sent successfully to user ${receiverId}`);
      } else {
        console.log(
          `[Push Notification] Skipped (Firebase not initialized) for user ${receiverId}`
        );
      }
    } catch (error) {
      console.error(`[Push Notification] Failed to send to user ${receiverId}:`, error);
    }
  }

  return notification;
};

export const NotificationService = {
  sendNotification,
};

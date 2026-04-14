import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import { BookingStatus } from "@prisma/client";
import { NotificationService } from "../Notification/notification.service";

// ─────────────────────────────────────────────
// Ensure chatroom exists or create it
// Called when booking is CONFIRMED / payment done
// ─────────────────────────────────────────────
const getOrCreateChatRoom = async (customerId: string, cleanerId: string) => {
  const existing = await prisma.chatRoom.findUnique({
    where: { customerId_cleanerId: { customerId, cleanerId } },
  });
  if (existing) return existing;

  return prisma.chatRoom.create({
    data: { customerId, cleanerId, isLocked: false },
  });
};

// ─────────────────────────────────────────────
// Lock / Unlock chatroom based on booking status
// Called by booking service after status changes
// ─────────────────────────────────────────────
const syncChatRoomLock = async (customerId: string, cleanerId: string) => {
  // Find if there is any OPEN booking between this pair
  const activeBooking = await prisma.booking.findFirst({
    where: {
      customerId,
      cleanerId,
      status: {
        in: [
          BookingStatus.CONFIRMED,
          BookingStatus.IN_PROGRESS,
          BookingStatus.COMPLETION_REQUESTED,
          BookingStatus.RESCHEDULE_REQUESTED,
        ],
      },
    },
  });

  const shouldBeUnlocked = !!activeBooking;

  // Upsert chatroom
  const room = await prisma.chatRoom.upsert({
    where: { customerId_cleanerId: { customerId, cleanerId } },
    update: { isLocked: !shouldBeUnlocked },
    create: { customerId, cleanerId, isLocked: !shouldBeUnlocked },
  });

  return room;
};

// ─────────────────────────────────────────────
// Get chatrooms for a user (with search)
// ─────────────────────────────────────────────
const getMyChatRooms = async (userId: string, role: string, search?: string) => {
  const where: any = role === "CUSTOMER" ? { customerId: userId } : { cleanerId: userId };

  const rooms = await prisma.chatRoom.findMany({
    where,
    include: {
      customer: { include: { customerProfile: true } },
      cleaner: { include: { cleanerProfile: true } },
    },
    orderBy: { lastMessageTime: "desc" },
  });

  // Calculate unread counts per room
  const roomsWithMeta = await Promise.all(
    rooms.map(async (room) => {
      const unreadCount = await prisma.message.count({
        where: {
          chatRoomId: room.id,
          senderId: { not: userId },
          isRead: false,
        },
      });

      // Build the "other user" object (always the opposite party)
      const otherUser =
        role === "CUSTOMER"
          ? {
              id: room.cleaner.id,
              name: room.cleaner.cleanerProfile?.displayName || room.cleaner.email,
              avatar: room.cleaner.cleanerProfile?.profilePhoto || null,
            }
          : {
              id: room.customer.id,
              name: room.customer.customerProfile?.name || room.customer.email,
              avatar: room.customer.customerProfile?.profilePhoto || null,
            };

      // Match search by the other user's name
      if (search) {
        const nameLower = otherUser.name.toLowerCase();
        if (!nameLower.includes(search.toLowerCase())) return null;
      }

      return {
        id: room.id,
        isLocked: room.isLocked,
        lastMessage: room.lastMessage,
        lastMessageTime: room.lastMessageTime,
        unreadCount,
        otherUser,
      };
    })
  );

  return roomsWithMeta.filter(Boolean);
};

// ─────────────────────────────────────────────
// Get paginated messages in a room
// ─────────────────────────────────────────────
const getMessages = async (chatRoomId: string, userId: string, cursor?: string, limit = 30) => {
  const room = await prisma.chatRoom.findUnique({ where: { id: chatRoomId } });
  if (!room) throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");

  if (room.customerId !== userId && room.cleanerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  const messages = await prisma.message.findMany({
    where: {
      chatRoomId,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      sender: {
        select: {
          id: true,
          role: true,
          customerProfile: { select: { name: true, profilePhoto: true } },
          cleanerProfile: { select: { displayName: true, profilePhoto: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Auto-mark messages from the other party as read
  await prisma.message.updateMany({
    where: { chatRoomId, senderId: { not: userId }, isRead: false },
    data: { isRead: true },
  });

  return messages.reverse().map((m) => ({
    id: m.id,
    content: m.content,
    isRead: m.isRead,
    createdAt: m.createdAt,
    isMine: m.senderId === userId,
    sender: {
      id: m.sender.id,
      name:
        m.sender.role === "CLEANER"
          ? m.sender.cleanerProfile?.displayName
          : m.sender.customerProfile?.name,
      avatar:
        m.sender.role === "CLEANER"
          ? m.sender.cleanerProfile?.profilePhoto
          : m.sender.customerProfile?.profilePhoto,
    },
  }));
};

// ─────────────────────────────────────────────
// Mark all messages in a room as read
// ─────────────────────────────────────────────
const markAsRead = async (chatRoomId: string, userId: string) => {
  await prisma.message.updateMany({
    where: { chatRoomId, senderId: { not: userId }, isRead: false },
    data: { isRead: true },
  });
  return { success: true };
};

// ─────────────────────────────────────────────
// Get unread message count for a room
// ─────────────────────────────────────────────
const getUnreadCount = async (chatRoomId: string, userId: string) => {
  const count = await prisma.message.count({
    where: { chatRoomId, senderId: { not: userId }, isRead: false },
  });
  return { unreadCount: count };
};

// ─────────────────────────────────────────────
// Save a message (called from Socket.io handler)
// ─────────────────────────────────────────────
const saveMessage = async (chatRoomId: string, senderId: string, content: string) => {
  const room = await prisma.chatRoom.findUnique({ where: { id: chatRoomId } });
  if (!room) {
    throw new Error("Chat room not found");
  }

  if (room.customerId !== senderId && room.cleanerId !== senderId) {
    throw new Error("Access denied");
  }

  // ─── Real-time Safety Check ────────────────────────────────────────────────
  // Even if the room says "unlocked", we double check the booking status
  // to prevent chatting after manual DB edits or missed syncs.
  const activeStatuses = [
    BookingStatus.CONFIRMED,
    BookingStatus.IN_PROGRESS,
    BookingStatus.COMPLETION_REQUESTED,
    BookingStatus.RESCHEDULE_REQUESTED,
  ];

  const activeBooking = await prisma.booking.findFirst({
    where: {
      customerId: room.customerId,
      cleanerId: room.cleanerId,
      status: { in: activeStatuses },
    },
  });

  if (!activeBooking) {
    // Self-heal: Lock the room in DB so future checks are faster
    await prisma.chatRoom.update({
      where: { id: chatRoomId },
      data: { isLocked: true },
    });
    throw new Error("Chat is locked. There is no active booking for this chat.");
  }

  // If the room was marked as locked but we found a booking, unlock it (Self-heal)
  if (room.isLocked) {
    await prisma.chatRoom.update({
      where: { id: chatRoomId },
      data: { isLocked: false },
    });
  }

  console.log("[Service] Creating message in DB...");

  const message = await prisma.message.create({
    data: { chatRoomId, senderId, content },
    include: {
      sender: {
        select: {
          id: true,
          role: true,
          customerProfile: { select: { name: true, profilePhoto: true } },
          cleanerProfile: { select: { displayName: true, profilePhoto: true } },
        },
      },
    },
  });

  // Update last message preview on chatroom
  await prisma.chatRoom.update({
    where: { id: chatRoomId },
    data: {
      lastMessage: content,
      lastMessageTime: new Date(),
    },
  });

  // ─── Send Notification ─────────────────────────────────────────────────────
  const receiverId = room.customerId === senderId ? room.cleanerId : room.customerId;
  const senderName =
    message.sender.role === "CLEANER"
      ? message.sender.cleanerProfile?.displayName
      : message.sender.customerProfile?.name;

  await NotificationService.sendNotification({
    receiverId,
    title: `New message from ${senderName}`,
    message: content,
    type: "CHAT_MESSAGE",
    metadata: { chatRoomId, senderId },
  });

  return {
    id: message.id,
    chatRoomId,
    senderId,
    content: message.content,
    isRead: false,
    createdAt: message.createdAt,
    sender: {
      id: message.sender.id,
      name:
        message.sender.role === "CLEANER"
          ? message.sender.cleanerProfile?.displayName
          : message.sender.customerProfile?.name,
      avatar:
        message.sender.role === "CLEANER"
          ? message.sender.cleanerProfile?.profilePhoto
          : message.sender.customerProfile?.profilePhoto,
    },
  };
};

// ─────────────────────────────────────────────
// Get only Room IDs for a user (used for auto-joining sockets)
// ─────────────────────────────────────────────
const getUserRoomIds = async (userId: string) => {
  const rooms = await prisma.chatRoom.findMany({
    where: {
      OR: [{ customerId: userId }, { cleanerId: userId }],
    },
    select: { id: true },
  });
  return rooms.map((r) => r.id);
};

export const ChatService = {
  getOrCreateChatRoom,
  syncChatRoomLock,
  getMyChatRooms,
  getMessages,
  markAsRead,
  getUnreadCount,
  saveMessage,
  getUserRoomIds,
};

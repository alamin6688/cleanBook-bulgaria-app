import express from "express";
import auth from "../../middlewares/auth";
import { Role } from "@prisma/client";
import { ChatController } from "./chat.controller";

const router = express.Router();

// Get all chatrooms for the logged-in user (with search by name)
router.get("/rooms", auth(Role.CUSTOMER, Role.CLEANER), ChatController.getMyChatRooms);

// Get or create a chatroom between customer & cleaner (only if booking is active/confirmed)
router.get(
  "/rooms/:chatRoomId/messages",
  auth(Role.CUSTOMER, Role.CLEANER),
  ChatController.getMessages
);

// Unread count
router.get(
  "/rooms/:chatRoomId/unread",
  auth(Role.CUSTOMER, Role.CLEANER),
  ChatController.getUnreadCount
);

export const ChatRoutes = router;

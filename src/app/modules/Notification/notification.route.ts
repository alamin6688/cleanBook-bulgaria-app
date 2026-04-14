import express from "express";
import { Role } from "@prisma/client";
import auth from "../../middlewares/auth";
import { NotificationController } from "./notification.controller";

const router = express.Router();

router.get("/", auth(Role.CUSTOMER, Role.CLEANER), NotificationController.getMyNotifications);
router.get(
  "/unread-count",
  auth(Role.CUSTOMER, Role.CLEANER),
  NotificationController.getUnreadCount
);
router.patch("/mark-read", auth(Role.CUSTOMER, Role.CLEANER), NotificationController.markAllAsRead);

export const NotificationRoutes = router;

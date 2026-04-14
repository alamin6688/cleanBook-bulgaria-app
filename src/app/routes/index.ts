import express from "express";
import { AuthRoutes } from "../modules/Auth/auth.route";
import { UserRoutes } from "../modules/User/user.route";
import { CategoryRoutes } from "../modules/Admin/Category/category.route";
import { AvailabilityRoutes } from "../modules/Cleaner/Availability/availability.route";
import { ServiceAreaRoutes } from "../modules/Admin/ServiceArea/serviceArea.route";

import { CleanerService_Routes } from "../modules/Cleaner/Service/service.route";
import { BookingRoutes } from "../modules/Booking/booking.route";
import { PaymentRoutes } from "../modules/Payment/payment.route";
import { PopularServiceRoutes } from "../modules/PopularService/popularService.route";
import { ReviewRoutes } from "../modules/Review/review.route";
import { DashboardRoutes } from "../modules/Cleaner/Dashboard/dashboard.route";
import { ChatRoutes } from "../modules/Chat/chat.route";
import { NotificationRoutes } from "../modules/Notification/notification.route";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/users",
    route: UserRoutes,
  },
  {
    path: "/categories",
    route: CategoryRoutes,
  },
  {
    path: "/cleaner/availability",
    route: AvailabilityRoutes,
  },
  {
    path: "/cleaner/services",
    route: CleanerService_Routes,
  },
  {
    path: "/service-areas",
    route: ServiceAreaRoutes,
  },
  {
    path: "/bookings",
    route: BookingRoutes,
  },
  {
    path: "/payments",
    route: PaymentRoutes,
  },
  {
    path: "/popular-services",
    route: PopularServiceRoutes,
  },
  {
    path: "/reviews",
    route: ReviewRoutes,
  },
  {
    path: "/cleaner/dashboard",
    route: DashboardRoutes,
  },
  {
    path: "/chat",
    route: ChatRoutes,
  },
  {
    path: "/notifications",
    route: NotificationRoutes,
  },
];

moduleRoutes.forEach((r) => router.use(r.path, r.route));

export default router;

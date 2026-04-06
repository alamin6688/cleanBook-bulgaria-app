import express from "express";
import { AuthRoutes } from "../modules/Auth/auth.route";
import { UserRoutes } from "../modules/User/user.route";
import { CategoryRoutes } from "../modules/Admin/Category/category.route";
import { AvailabilityRoutes } from "../modules/Cleaner/Availability/availability.route";
import { ServiceAreaRoutes } from "../modules/Admin/ServiceArea/serviceArea.route";

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
    path: "/service-areas",
    route: ServiceAreaRoutes,
  },
];

moduleRoutes.forEach((r) => router.use(r.path, r.route));

export default router;

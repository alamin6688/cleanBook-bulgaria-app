import express from "express";
import auth from "../../../middlewares/auth";
import { Role } from "@prisma/client";
import { DashboardController } from "./dashboard.controller";

const router = express.Router();

// Earning dashboard routes
router.get("/summary", auth(Role.CLEANER), DashboardController.getCleanerDashboard);
router.get("/earnings", auth(Role.CLEANER), DashboardController.getEarningsHistory);

// Home page routes
router.get("/home", auth(Role.CLEANER), DashboardController.getCleanerHomeData);

export const DashboardRoutes = router;

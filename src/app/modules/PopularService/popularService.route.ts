import express from "express";
import { PopularServiceController } from "./popularService.controller";

const router = express.Router();

router.get("/", PopularServiceController.getPopularServices);

export const PopularServiceRoutes = router;

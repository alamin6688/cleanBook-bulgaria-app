import express from "express";
import auth from "../../../middlewares/auth";
import { RequestValidation } from "../../../middlewares/validateRequest";
import { UserValidation } from "../../User/user.validation";
import { AvailabilityController } from "./availability.controller";

const router = express.Router();

router.get("/", auth("CLEANER"), AvailabilityController.getAvailability);
router.patch(
  "/",
  auth("CLEANER"),
  RequestValidation.validateRequest(UserValidation.updateAvailabilityZodSchema),
  AvailabilityController.updateAvailability
);

export const AvailabilityRoutes = router;

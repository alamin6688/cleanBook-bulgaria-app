import express from "express";
import auth from "../../middlewares/auth";
import { RequestValidation } from "../../middlewares/validateRequest";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = express.Router();

router.patch(
  "/setup-language",
  auth("CUSTOMER", "CLEANER"),
  RequestValidation.validateRequest(UserValidation.updateLanguageZodSchema),
  UserController.updateLanguage
);

router.patch(
  "/setup-location",
  auth("CUSTOMER", "CLEANER"),
  RequestValidation.validateRequest(UserValidation.updateLocationZodSchema),
  UserController.updateLocation
);

router.patch(
  "/setup-basic",
  auth("CUSTOMER", "CLEANER"),
  RequestValidation.validateRequest(UserValidation.updateBasicProfileZodSchema),
  UserController.updateBasicProfile
);

router.patch(
  "/setup-cleaner-details",
  auth("CLEANER"),
  RequestValidation.validateRequest(UserValidation.updateCleanerProfileZodSchema),
  UserController.updateCleanerDetails
);

router.post("/complete-onboarding", auth("CUSTOMER", "CLEANER"), UserController.completeOnboarding);

export const UserRoutes = router;

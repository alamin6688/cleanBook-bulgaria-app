import express from "express";
import auth from "../../middlewares/auth";
import { RequestValidation } from "../../middlewares/validateRequest";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = express.Router();

router.get("/profile", auth("CUSTOMER", "CLEANER", "ADMIN"), UserController.getProfile);

router.get("/:id", auth("CUSTOMER", "CLEANER", "ADMIN"), UserController.getUserById);

// router.get("/cleaners-nearby", auth("CUSTOMER", "CLEANER","ADMIN"), UserController.getNearbyCleaners); 

router.patch(
  "/save-fcm-token",
  auth("CUSTOMER", "CLEANER"),
  UserController.saveFcmToken
);

router.patch(
  "/update-profile",
  auth("CUSTOMER", "CLEANER", "ADMIN"),
  RequestValidation.validateRequest(UserValidation.saveProfileZodSchema),
  UserController.updateProfile
);

router.patch(
  "/change-password",
  auth("CUSTOMER", "CLEANER", "ADMIN"),
  RequestValidation.validateRequest(UserValidation.changePasswordZodSchema),
  UserController.changePassword
);

export const UserRoutes = router;

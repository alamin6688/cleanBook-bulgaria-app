import express from "express";
import auth from "../../../middlewares/auth";
import { RequestValidation } from "../../../middlewares/validateRequest";
import { CleanerService_Controller } from "./service.controller";
import { CleanerServiceValidation } from "./service.validation";

const router = express.Router();

router.get("/", auth("CLEANER"), CleanerService_Controller.getMyServices);

router.patch(
  "/",
  auth("CLEANER"),
  RequestValidation.validateRequest(CleanerServiceValidation.updateCleanerServicesZodSchema),
  CleanerService_Controller.updateMyServices
);

export const CleanerService_Routes = router;

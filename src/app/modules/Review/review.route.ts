import express from "express";
import { Role } from "@prisma/client";
import auth from "../../middlewares/auth";
import { RequestValidation } from "../../middlewares/validateRequest";
import { ReviewController } from "./review.controller";
import { ReviewValidation } from "./review.validation";

const router = express.Router();

router.post(
  "/",
  auth(Role.CUSTOMER),
  RequestValidation.validateRequest(ReviewValidation.createReviewSchema),
  ReviewController.createReview
);

router.get("/cleaner/:cleanerId", ReviewController.getCleanerReviews);

export const ReviewRoutes = router;

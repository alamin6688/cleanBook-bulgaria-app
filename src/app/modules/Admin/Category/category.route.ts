import express from "express";
import { Role } from "@prisma/client";
import auth from "../../../middlewares/auth";
import { RequestValidation } from "../../../middlewares/validateRequest";
import { CategoryController } from "./category.controller";
import { CategoryValidation } from "./category.validation";

const router = express.Router();

// Property Categories

router.get("/property", CategoryController.getAllPropertyCategories);

router.post(
  "/property",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(CategoryValidation.createCategoryZodSchema),
  CategoryController.createPropertyCategory
);
router.patch(
  "/property/:id",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(CategoryValidation.updateCategoryZodSchema),
  CategoryController.updatePropertyCategory
);

router.delete(
  "/property/:id",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CategoryController.deletePropertyCategory
);

// Service Categories
router.get("/service", CategoryController.getAllServiceCategories);

router.post(
  "/service",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(CategoryValidation.createCategoryZodSchema),
  CategoryController.createServiceCategory
);

router.patch(
  "/service/:id",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(CategoryValidation.updateCategoryZodSchema),
  CategoryController.updateServiceCategory
);

router.delete(
  "/service/:id",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CategoryController.deleteServiceCategory
);

// Additional Service Categories
router.get("/additional-service", CategoryController.getAllAdditionalServiceCategories);

router.post(
  "/additional-service",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(CategoryValidation.createCategoryZodSchema),
  CategoryController.createAdditionalServiceCategory
);

router.patch(
  "/additional-service/:id",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(CategoryValidation.updateCategoryZodSchema),
  CategoryController.updateAdditionalServiceCategory
);

router.delete(
  "/additional-service/:id",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CategoryController.deleteAdditionalServiceCategory
);

export const CategoryRoutes = router;

import express from "express";
import { Role } from "@prisma/client";
import auth from "../../middlewares/auth";
import { ContactController } from "./contact.controller";

const router = express.Router();

// Authenticated users (Customer or Cleaner) can submit a contact request
router.post("/", auth(Role.CUSTOMER, Role.CLEANER), ContactController.submitContactUs);

export const ContactRoutes = router;

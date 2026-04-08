import express from "express";
import { RequestValidation } from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { Role } from "@prisma/client";
import { BookingController } from "./booking.controller";
import { BookingValidation } from "./booking.validation";

const router = express.Router();

// Get available slots for a cleaner on a specific date
router.get(
  "/slots",
  auth(Role.CUSTOMER, Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(BookingValidation.getSlotsSchema),
  BookingController.getAvailableSlots
);

// Get cleaner availability pattern for calendar view
router.get(
  "/availability/:cleanerId",
  BookingController.getCleanerAvailability
);

// Create a new booking
router.post(
  "/",
  auth(Role.CUSTOMER),
  RequestValidation.validateRequest(BookingValidation.createBookingSchema),
  BookingController.createBooking
);

// MORE SPECIFIC ROUTES MUST COME BEFORE GENERIC ROUTES
// Get booking details for payment
// router.get("/:id/payment", auth(Role.CUSTOMER), BookingController.getBookingForPayment);

// Confirm booking (after payment)
// router.patch("/:id/confirm", auth(Role.CUSTOMER), BookingController.confirmBooking);

// Update payment status
// router.patch(
//   "/:id/payment",
//   auth(Role.CUSTOMER, Role.ADMIN, Role.SUPER_ADMIN),
//   RequestValidation.validateRequest(BookingValidation.updatePaymentStatusSchema),
//   BookingController.updatePaymentStatus
// );

// Get all my bookings
router.get(
  "/",
  auth(Role.CUSTOMER, Role.CLEANER, Role.ADMIN, Role.SUPER_ADMIN),
  BookingController.getMyBookings
);

// Get a specific booking by ID (MUST BE LAST - matches /:id)
router.get(
  "/:id",
  auth(Role.CUSTOMER, Role.CLEANER, Role.ADMIN, Role.SUPER_ADMIN),
  BookingController.getBookingById
);

export const BookingRoutes = router;

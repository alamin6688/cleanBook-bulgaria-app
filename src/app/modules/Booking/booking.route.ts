import express from "express";
import { RequestValidation } from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { Role } from "@prisma/client";
import { BookingController } from "./booking.controller";
import { BookingValidation } from "./booking.validation";
import { imageUploader } from "../../../helpers/file_uploader/imageUploader";

const router = express.Router();

// Get available slots for a cleaner on a specific date
router.get(
  "/slots",
  auth(Role.CUSTOMER, Role.ADMIN, Role.SUPER_ADMIN),
  RequestValidation.validateRequest(BookingValidation.getSlotsSchema),
  BookingController.getAvailableSlots
);

// Discover available cleaners
router.get(
  "/available-cleaners",
  RequestValidation.validateRequest(BookingValidation.getAvailableCleanersSchema),
  BookingController.getAvailableCleaners
);

// Check price and availability for a specific cleaner and slot
router.post(
  "/check-availability",
  RequestValidation.validateRequest(BookingValidation.checkAvailabilitySchema),
  BookingController.checkAvailabilityAndPrice
);

// Get cleaner availability pattern for calendar view
router.get("/availability/:cleanerId", BookingController.getCleanerAvailability);

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

// Update booking status (confirm, complete, cancel, etc.)
router.patch(
  "/:id/status",
  auth(Role.CUSTOMER, Role.CLEANER, Role.ADMIN, Role.SUPER_ADMIN),
  BookingController.updateBookingStatus
);

// Request a reschedule
router.patch("/:id/reschedule", auth(Role.CUSTOMER), BookingController.requestReschedule);

// Accept a reschedule request
router.patch("/:id/accept-reschedule", auth(Role.CLEANER), BookingController.acceptReschedule);

// Request booking completion (Cleaner uploads images)
router.patch(
  "/:id/request-completion",
  auth(Role.CLEANER),
  imageUploader.single("image"),
  BookingController.requestCompletion
);

// Confirm booking completion (Customer confirms)
router.patch("/:id/confirm-completion", auth(Role.CUSTOMER), BookingController.confirmCompletion);

// Reject booking completion (Customer rejects)
router.patch("/:id/cancel-completion", auth(Role.CUSTOMER), BookingController.cancelCompletion);

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

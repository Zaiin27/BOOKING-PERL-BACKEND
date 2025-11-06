import express from "express";
import { authorizeRole, isAuthenticatedUser } from "../middlewares/auth.js";
import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  updatePaymentStatus,
  cancelBooking,
  getBookingStats,
  addBookingNote,
  extendBooking,
  getBookingHistory,
} from "../controllers/bookingController.js";

const router = express.Router();

// Public routes
router.post("/", createBooking);
router.get("/:id/public", getBookingById); // Public booking lookup by reference
router.get("/history", getBookingHistory); // Public booking history lookup
router.put("/:id/extend", extendBooking); // Public booking extension

// Public route for admin panel (no auth required)
router.get("/admin", getAllBookings);

// Protected routes
router.get("/", isAuthenticatedUser, getAllBookings);
router.get("/:id", isAuthenticatedUser, getBookingById);

router.patch(
  "/:id/status",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  updateBookingStatus
);

router.patch(
  "/:id/payment-status",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  updatePaymentStatus
);

router.post(
  "/:id/cancel",
  isAuthenticatedUser,
  cancelBooking
);

router.get(
  "/admin/stats",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  getBookingStats
);

router.post(
  "/:id/notes",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  addBookingNote
);

export default router;


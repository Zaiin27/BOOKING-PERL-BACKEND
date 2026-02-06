import express from "express";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";
import {
  listAdminOrders,
  promoteToAdminStaff,
  promoteToAdmin,
  promoteToSubadmin,
  listStaffs,
  activateStaff,
  deactivateStaff,
  getAllUsers,
  createStaff,
  updateStaff,
  deleteUser,
  changeUserPassword,
  getUserById,
  activateUser,
  deactivateUser,
  createUser,
  updateUser,
  listUsers,
  getDashboardOverview,
  getMonthlyOrders,
  getWeeklyVolume,
  debugPayments,
  updateOrderStatus,
  getAllStaff,
  getHotelDashboardOverview,
  getBookingStatsByDateRange,
  getPropertyWiseStats,
  getUpcomingActivity,
  updateStaffCommissionStatus,
} from "../controllers/adminController.js";

const router = express.Router();

router.use(isAuthenticatedUser);

// Admin-only actions
// Admin-only actions (Subadmin can create/list staff)
router.post("/staffs", authorizeRole("admin", "subadmin"), createStaff);
router.get("/staffs", authorizeRole("admin", "subadmin"), listStaffs);
router.get("/staffs/:userId", authorizeRole("admin", "subadmin"), getUserById);
router.put("/staffs/:userId", authorizeRole("admin", "subadmin"), updateStaff);
router.delete("/staffs/:userId", authorizeRole("admin", "subadmin"), deleteUser);
router.patch("/staffs/:userId/activate", authorizeRole("admin", "subadmin"), activateStaff);
router.patch(
  "/staffs/:userId/deactivate",
  authorizeRole("admin", "subadmin"),
  deactivateStaff
);
router.patch("/promote-to-staff", authorizeRole("admin"), promoteToAdminStaff);
router.patch("/promote-to-admin", authorizeRole("admin"), promoteToAdmin);
router.patch("/promote-to-subadmin", authorizeRole("admin"), promoteToSubadmin);

// Commission endpoints
router.patch("/commission/staff/:staffId/pay", authorizeRole("admin"), updateStaffCommissionStatus);

// Generic user management endpoints (admin only, subadmin for their staff)
router.get("/users", authorizeRole("admin", "subadmin"), listUsers);
router.get("/users/:userId", authorizeRole("admin", "subadmin"), getUserById);
router.post("/users", authorizeRole("admin", "subadmin"), createUser);
router.put("/users/:userId", authorizeRole("admin", "subadmin"), updateUser);
router.delete("/users/:userId", authorizeRole("admin", "subadmin"), deleteUser);
router.patch("/users/:userId/activate", authorizeRole("admin", "subadmin"), activateUser);
router.patch(
  "/users/:userId/deactivate",
  authorizeRole("admin", "subadmin"),
  deactivateUser
);
router.patch(
  "/users/:userId/change-password",
  authorizeRole("admin", "subadmin"),
  changeUserPassword
);

// Legacy endpoints for backward compatibility
router.get("/users-legacy", authorizeRole("admin"), getAllUsers);

// Other admin endpoints
router.get("/orders", authorizeRole("admin", "staff", "subadmin"), listAdminOrders);
router.get("/orders/monthly", authorizeRole("admin", "staff", "subadmin"), getMonthlyOrders);
router.patch("/orders/:orderId/status", authorizeRole("admin", "staff", "subadmin"), updateOrderStatus);
router.get("/staff", authorizeRole("admin", "staff", "subadmin"), getAllStaff);

// Dashboard analytics endpoints (admin and staff)
router.get("/dashboard/overview", authorizeRole("admin", "staff"), getDashboardOverview);
router.get("/dashboard/weekly-volume", authorizeRole("admin", "staff"), getWeeklyVolume);

// Hotel Booking System Dashboard endpoints
router.get("/dashboard/hotel-overview", authorizeRole("admin", "staff"), getHotelDashboardOverview);
router.get("/dashboard/booking-stats", authorizeRole("admin", "staff"), getBookingStatsByDateRange);
router.get("/dashboard/property-stats", authorizeRole("admin", "staff"), getPropertyWiseStats);
router.get("/dashboard/upcoming-activity", authorizeRole("admin", "staff"), getUpcomingActivity);

// Debug endpoints (admin and staff)
router.get("/debug/payments", authorizeRole("admin", "staff"), debugPayments);

export default router;

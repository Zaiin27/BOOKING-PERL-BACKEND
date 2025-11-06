import express from "express";
import { authorizeRole, isAuthenticatedUser } from "../middlewares/auth.js";
import {
  createProperty,
  getAllProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  getPropertyStats,
  updateRoomAvailability,
  canCreateProperty,
  getRealTimeRoomAvailability,
} from "../controllers/propertyController.js";

const router = express.Router();


// Public routes
router.get("/", getAllProperties);

// Protected routes - Admin and Staff
router.get(
  "/can-create",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  canCreateProperty
);

router.get("/:id", getPropertyById);
router.get("/:id/availability", getRealTimeRoomAvailability);

router.post(
  "/",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  createProperty
);

router.put(
  "/:id",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  updateProperty
);

router.delete(
  "/:id",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  deleteProperty
);

router.get(
  "/admin/stats",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  getPropertyStats
);

router.patch(
  "/:id/availability",
  isAuthenticatedUser,
  authorizeRole("admin", "staff"),
  updateRoomAvailability
);

export default router;


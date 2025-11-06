import express from "express";
import {
  createSubscription,
  activateSubscription,
  cancelSubscription,
  upgradeSubscription,
  getAllSubscriptions,
} from "../controllers/subscriptionController.js";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";

const router = express.Router();

// User routes
router.post("/", isAuthenticatedUser, createSubscription);
router.patch("/:id/activate", isAuthenticatedUser, activateSubscription);
router.patch("/:id/cancel", isAuthenticatedUser, cancelSubscription);
router.post("/:id/upgrade", isAuthenticatedUser, upgradeSubscription);

// Admin/Super Admin routes
router.get("/", isAuthenticatedUser, authorizeRole("admin", "superadmin"), getAllSubscriptions);

export default router;

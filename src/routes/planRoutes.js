import express from "express";
import {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getMySubscription,
  getMyLimits,
} from "../controllers/planController.js";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";

const router = express.Router();

// Public routes
router.get("/", getAllPlans);

// Authenticated routes - MUST be before /:id route
router.get("/my-subscription", isAuthenticatedUser, getMySubscription);
router.get("/limits", isAuthenticatedUser, getMyLimits);

// Public routes with parameters - MUST be after specific routes
router.get("/:id", getPlanById);

// Super Admin only routes
router.post("/", isAuthenticatedUser, authorizeRole("superadmin"), createPlan);
router.put("/:id", isAuthenticatedUser, authorizeRole("superadmin"), updatePlan);
router.delete("/:id", isAuthenticatedUser, authorizeRole("superadmin"), deletePlan);

export default router;

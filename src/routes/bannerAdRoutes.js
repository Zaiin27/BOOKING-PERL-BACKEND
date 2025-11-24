import express from "express";
import {
  getAllBannerAds,
  getAllBannerAdsAdmin,
  getBannerAdById,
  createBannerAd,
  updateBannerAd,
  deleteBannerAd,
  trackBannerAdClick,
} from "../controllers/bannerAdController.js";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";

const router = express.Router();

// Public route - Get active banner ads for carousel
router.get("/", getAllBannerAds);

// Public route - Track click on banner ad
router.post("/:id/click", trackBannerAdClick);

// Admin routes
router.get("/admin", isAuthenticatedUser, authorizeRole("admin", "superadmin"), getAllBannerAdsAdmin);
router.get("/:id", isAuthenticatedUser, authorizeRole("admin", "superadmin"), getBannerAdById);
router.post("/", isAuthenticatedUser, authorizeRole("admin", "superadmin"), createBannerAd);
router.put("/:id", isAuthenticatedUser, authorizeRole("admin", "superadmin"), updateBannerAd);
router.delete("/:id", isAuthenticatedUser, authorizeRole("admin", "superadmin"), deleteBannerAd);

export default router;

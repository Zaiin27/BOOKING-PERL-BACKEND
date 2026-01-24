import express from "express";
import { contactSupport, getAllContactMessages } from "../controllers/supportController.js";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";

const router = express.Router();

router.post("/contact", contactSupport);

// Admin Only
router.get("/messages", isAuthenticatedUser, authorizeRole("admin"), getAllContactMessages);

export default router;

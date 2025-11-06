import express from "express";
import {
  createSolanaPayment,
  confirmSolanaPayment,
  getSolanaPaymentStatus,
} from "../controllers/solanaPaymentController.js";
import { simulatePayment, createPaymentIntent, createBookingPaymentIntent, createJazzCashPayment, createEasyPaisaPayment, verifyPayment } from "../controllers/paymentController.js";
import { isAuthenticatedUser } from "../middlewares/auth.js";
const router = express.Router();
router.post("/create-booking-payment-intent", createBookingPaymentIntent);
router.post("/create-jazzcash-payment", createJazzCashPayment);
router.post("/create-easypaisa-payment", createEasyPaisaPayment);
router.get("/verify/:transactionId", verifyPayment);
router.use(isAuthenticatedUser);
router.post("/create-payment-intent", createPaymentIntent);
router.post("/create-solana-payment", createSolanaPayment);
router.post("/create-simulate-payment-intent", simulatePayment);
router.post("/confirm-solana-payment", confirmSolanaPayment);
router.get("/:id/status", getSolanaPaymentStatus);

export default router;

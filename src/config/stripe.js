import Stripe from "stripe";

let stripe = null;

// Only initialize Stripe if API key is provided
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("✅ Stripe initialized successfully");
  } catch (error) {
    console.warn("⚠️ Stripe initialization failed:", error.message);
  }
} else {
  console.warn("⚠️ STRIPE_SECRET_KEY not found - Stripe payments disabled");
}

export default stripe;

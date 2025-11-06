import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planName: {
      type: String,
      enum: ["free", "standard", "premium", "customized"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "pending"],
      default: "active",
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      enum: ["USD", "PKR"],
      default: "PKR",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed",
    },
    paymentMethod: {
      type: String,
      enum: ["stripe", "jazzcash", "easypaisa", "manual", "free"],
      default: "free",
    },
    transactionId: {
      type: String,
    },
    // Auto-renewal
    autoRenew: {
      type: Boolean,
      default: false,
    },
    // Cancellation
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    // Custom plan details (for customized plans)
    customDetails: {
      maxProperties: Number,
      maxPhotosPerProperty: Number,
      customFeatures: mongoose.Schema.Types.Mixed, // JSON object for custom features
      accountManagerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  { timestamps: true }
);

// Indexes
subscriptionSchema.index({ user_id: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ planName: 1, status: 1 });

// Virtual to check if subscription is expired
subscriptionSchema.virtual("isExpired").get(function () {
  return this.endDate < new Date() && this.status === "active";
});

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function () {
  const now = new Date();
  return (
    this.status === "active" &&
    this.startDate <= now &&
    this.endDate >= now &&
    this.paymentStatus === "completed"
  );
};

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;

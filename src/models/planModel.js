import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      unique: true,
      enum: ["free", "standard", "premium", "customized"],
    },
    displayName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      enum: ["USD", "PKR"],
      default: "PKR",
    },
    duration: {
      type: String,
      enum: ["monthly", "yearly", "lifetime", "custom"],
      default: "monthly",
    },
    // Property limits
    maxProperties: {
      type: Number,
      default: 1, // Free plan: 1, Standard: 1, Premium: 5, Customized: -1 (unlimited)
    },
    maxPhotosPerProperty: {
      type: Number,
      default: 3, // Free: 3, Standard: 10, Premium: -1 (unlimited), Customized: -1
    },
    // Features
    features: {
      basicInfoDisplay: { type: Boolean, default: true },
      contactForm: { type: Boolean, default: false },
      searchResults: { type: Boolean, default: true },
      priorityVisibility: { type: Boolean, default: false },
      featuredPlacement: { type: Boolean, default: false },
      homepageFeatured: { type: Boolean, default: false },
      socialMediaPromotion: { type: Boolean, default: false },
      emailNotifications: { type: Boolean, default: false },
      reviewManagement: { type: Boolean, default: false },
      bookingManagement: { type: Boolean, default: false },
      discountPromotions: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
      teamAccess: { type: Boolean, default: false },
      dedicatedAccountManager: { type: Boolean, default: false },
    },
    // Analytics access
    analytics: {
      basic: { type: Boolean, default: false }, // Views, clicks
      advanced: { type: Boolean, default: false }, // Conversion rates, region-based insights
    },
    // Badges
    badges: {
      verified: { type: Boolean, default: false },
      trustedHost: { type: Boolean, default: false },
      premium: { type: Boolean, default: false },
    },
    // Priority/ranking
    searchPriority: {
      type: Number,
      default: 1, // Higher number = higher priority in search
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Indexes
planSchema.index({ name: 1 });
planSchema.index({ isActive: 1 });

const Plan = mongoose.model("Plan", planSchema);

export default Plan;

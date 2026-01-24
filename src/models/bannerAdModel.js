import mongoose from "mongoose";

const bannerAdSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Banner title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Banner description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    image: {
      type: String,
      required: [true, "Banner image is required"],
    },
    ctaText: {
      type: String,
      default: "Book Now",
      trim: true,
    },
    property_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: [true, "Property ID is required"],
      index: true,
    },
    // Ad settings
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 1, // Higher number = higher priority in carousel
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date, // Optional expiry date for ads
    },
    // Payment/Advertiser info
    advertiserName: {
      type: String,
      trim: true,
    },
    advertiserEmail: {
      type: String,
      trim: true,
      lowercase: true,
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
    // Click tracking (optional)
    clickCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    clickLimit: {
      type: Number,
      default: null, // null means no limit
      min: 1,
    },
    // Created by admin
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
// Note: 'property_id' field already has index: true which creates an index automatically
bannerAdSchema.index({ isActive: 1, priority: -1, createdAt: -1 });
bannerAdSchema.index({ endDate: 1 });
// Compound index for active ads query optimization
bannerAdSchema.index({ isActive: 1, endDate: 1, clickCount: 1, clickLimit: 1 });

// Virtual to check if ad is expired
bannerAdSchema.virtual("isExpired").get(function () {
  if (this.endDate) {
    return new Date() > this.endDate;
  }
  return false;
});

// Method to check if ad should be displayed
bannerAdSchema.methods.shouldDisplay = function () {
  // Check if click limit is reached
  if (this.clickLimit !== null && this.clickLimit !== undefined) {
    if (this.clickCount >= this.clickLimit) {
      return false; // Limit reached, don't display
    }
  }
  
  return (
    this.isActive &&
    !this.isExpired &&
    this.property_id
  );
};

const BannerAd = mongoose.model("BannerAd", bannerAdSchema);

export default BannerAd;

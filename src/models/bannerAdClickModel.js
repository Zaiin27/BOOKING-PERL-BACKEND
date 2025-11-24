import mongoose from "mongoose";

const bannerAdClickSchema = new mongoose.Schema(
  {
    bannerAd_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BannerAd",
      required: true,
      index: true,
    },
    userIdentifier: {
      type: String,
      required: true,
      index: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Compound index to ensure one click per user per ad
bannerAdClickSchema.index({ bannerAd_id: 1, userIdentifier: 1 }, { unique: true });

const BannerAdClick = mongoose.model("BannerAdClick", bannerAdClickSchema);

export default BannerAdClick;


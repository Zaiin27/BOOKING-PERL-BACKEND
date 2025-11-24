import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      select: false,
    },
    isActive: { type: Boolean, default: true },
    role: {
      type: String,
      enum: ["user", "staff", "admin", "superadmin"],
      default: "user",
      index: true,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    isVerified: { type: Boolean, default: true },
    // Subscription/Plan information
    currentPlan: {
      type: String,
      enum: ["free", "standard", "premium", "customized"],
      default: "free",
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    // Payment type for staff - what payment methods they support
    paymentType: {
      type: String,
      enum: ["online", "cash", "both"],
      default: "both", // Default to both for existing staff
    },
    // Plan features stored directly in user account (for staff) - Future-proof structure
    planFeatures: {
      // Property limits
      maxProperties: { type: Number, default: 1 },
      maxPhotosPerProperty: { type: Number, default: 3 },
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
      // Analytics
      analytics: {
        basic: { type: Boolean, default: false },
        advanced: { type: Boolean, default: false },
      },
      // Badges
      badges: {
        verified: { type: Boolean, default: false },
        trustedHost: { type: Boolean, default: false },
        premium: { type: Boolean, default: false },
      },
      // Priority/ranking
      searchPriority: { type: Number, default: 1 },
      // Plan metadata
      planName: { type: String, default: "free" },
      planDisplayName: { type: String, default: "Free Plan" },
      planUpdatedAt: { type: Date },
    },
  },
  { timestamps: true }
);

const virtual = userSchema.virtual("id");
virtual.get(function () {
  return this._id;
});

userSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  },
});
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getJWTToken = function () {
  const userObject = this.toObject();

  return jwt.sign(
    { id: this._id, ...userObject },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};


userSchema.methods.setResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  return resetToken;
};


const User = mongoose.model("User", userSchema);

export default User;

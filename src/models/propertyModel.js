import mongoose from "mongoose";

const roomTypeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["single", "double"],
      required: true,
    },
    count: {
      type: Number,
      required: true,
      min: 0,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    available: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    property_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Property name is required"],
      trim: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    roomTypes: {
      type: [roomTypeSchema],
      required: true,
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: "At least one room type is required",
      },
    },
    totalRooms: {
      type: Number,
      required: true,
      min: 1,
    },
    photos: {
      type: [String],
      default: [],
    },
    contactEmail: {
      type: String,
      required: [true, "Contact email is required"],
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    checkInTime: {
      type: String,
      required: [true, "Check-in time is required"],
      default: "14:00", // 2 PM
    },
    checkOutTime: {
      type: String,
      required: [true, "Check-out time is required"],
      default: "11:00", // 11 AM
    },
    amenities: {
      type: [String],
      default: [],
    },
    currency: {
      type: String,
      enum: ["USD", "PKR"],
      default: "USD",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
      index: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdBy: {
      type: String,
      enum: ["admin", "staff"],
      required: true,
    },
    // Plan-related features
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPriority: {
      type: Boolean,
      default: false,
      index: true,
    },
    searchPriority: {
      type: Number,
      default: 1, // Higher = higher priority in search results
      index: true,
    },
    featuredUntil: {
      type: Date, // If featured placement has expiry
    },
    planFeatures: {
      verifiedBadge: { type: Boolean, default: false },
      trustedHostBadge: { type: Boolean, default: false },
      premiumBadge: { type: Boolean, default: false },
    },
    // Payment methods supported by this property (inherited from staff)
    paymentType: {
      type: String,
      enum: ["online", "cash", "both"],
      default: "both",
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for calculating average price
propertySchema.virtual("averagePrice").get(function () {
  if (!this.roomTypes || this.roomTypes.length === 0) return 0;
  const total = this.roomTypes.reduce((sum, room) => sum + room.price, 0);
  return total / this.roomTypes.length;
});

// Virtual for total available rooms
propertySchema.virtual("availableRooms").get(function () {
  if (!this.roomTypes || this.roomTypes.length === 0) return 0;
  return this.roomTypes.reduce((sum, room) => sum + room.available, 0);
});

// Optimized compound indexes for common query patterns
propertySchema.index({ status: 1, isFeatured: -1, isPriority: -1, searchPriority: -1, createdAt: -1 });
propertySchema.index({ status: 1, owner_id: 1 });
propertySchema.index({ name: 1, address: 1 }); // Optimized for search queries
propertySchema.index({ createdAt: -1 });
propertySchema.index({ status: 1, name: 1 }); // For status + name searches
propertySchema.index({ status: 1, address: 1 }); // For status + address searches
// Text search index (if needed for full-text search)
try {
  propertySchema.index({ name: "text", address: "text", description: "text" });
} catch (e) {
  // Index might already exist
  console.log("Text index already exists or error creating:", e.message);
}

propertySchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  },
});

const Property = mongoose.model("Property", propertySchema);

export default Property;


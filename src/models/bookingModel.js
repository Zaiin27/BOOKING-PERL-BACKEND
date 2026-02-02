import mongoose from "mongoose";

const bookedRoomSchema = new mongoose.Schema(
  {
    roomType: {
      type: String,
      enum: ["single", "double"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerRoom: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    booking_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Property Details
    property_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    // User Details (if logged in)
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    // Guest Details
    guestName: {
      type: String,
      required: [true, "Guest name is required"],
      trim: true,
    },
    guestEmail: {
      type: String,
      required: [true, "Guest email is required"],
      trim: true,
      lowercase: true,
    },
    guestPhone: {
      type: String,
      required: [true, "Guest phone is required"],
      trim: true,
    },
    // Booking Details
    checkInDate: {
      type: Date,
      required: [true, "Check-in date is required"],
      index: true,
    },
    checkOutDate: {
      type: Date,
      required: [true, "Check-out date is required"],
      index: true,
    },
    numberOfGuests: {
      type: Number,
      required: [true, "Number of guests is required"],
      min: 1,
    },
    bookedRooms: {
      type: [bookedRoomSchema],
      required: true,
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: "At least one room must be booked",
      },
    },
    totalRooms: {
      type: Number,
      required: true,
      min: 1,
    },
    // Pricing
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    // Status
    bookingStatus: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "no-show"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed"],
      default: "pending",
      index: true,
    },
    // Additional Information
    specialRequests: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: [String],
      default: [],
    },
    // Extension history
    extensionHistory: [{
      previousCheckOut: { type: Date, required: true },
      newCheckOut: { type: Date, required: true },
      additionalCost: { type: Number, required: true },
      reason: { type: String, default: "" },
      extendedAt: { type: Date, default: Date.now }
    }],
    // Cancellation
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    // Payment Details
    paymentMethod: {
      type: String,
      enum: ["card", "cash", "bank_transfer"],
    },
    paymentTransactionId: {
      type: String,
    },
    paymentType: {
      type: String,
      enum: ["online", "on_arrival"],
      default: "online",
    },
    platformFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Commission Details
    commissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    hotelOwnerAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for number of nights
bookingSchema.virtual("numberOfNights").get(function () {
  if (!this.checkInDate || !this.checkOutDate) return 0;
  const diffTime = Math.abs(this.checkOutDate - this.checkInDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for booking duration
bookingSchema.virtual("duration").get(function () {
  const nights = this.numberOfNights;
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
});

// Compound index for efficient queries
bookingSchema.index({ property_id: 1, checkInDate: 1, checkOutDate: 1 });
bookingSchema.index({ user_id: 1, createdAt: -1 });
bookingSchema.index({ bookingStatus: 1, createdAt: -1 });

bookingSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  },
});

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;


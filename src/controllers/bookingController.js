import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import Booking from "../models/bookingModel.js";
import Property from "../models/propertyModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import mongoose from "mongoose";

// Helper function to generate booking ID
const generateBookingId = () => {
  return `BOOK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
};

// Helper function to generate booking reference
const generateBookingReference = () => {
  const prefix = "BKG";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

// Helper function to check room availability with real-time calculation
const checkRoomAvailability = async (propertyId, checkInDate, checkOutDate, requestedRooms) => {
  // Get property
  const property = await Property.findById(propertyId);
  if (!property) {
    throw new ErrorHandler("Property not found", 404);
  }

  // Convert dates to proper Date objects
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  // Get ALL bookings for this property (including expired ones for history)
  // Note: We include "active" status to ensure active bookings are considered for availability
  const allBookings = await Booking.find({
    property_id: propertyId,
    bookingStatus: { $in: ["pending", "confirmed", "active", "completed", "cancelled"] },
  });

  // Filter bookings that overlap with the requested period
  const overlappingBookings = allBookings.filter((booking) => {
    const bookingCheckIn = new Date(booking.checkInDate);
    const bookingCheckOut = new Date(booking.checkOutDate);

    // Check if booking overlaps with requested period
    return (
      bookingCheckIn < checkOut &&
      bookingCheckOut > checkIn &&
      booking.bookingStatus !== "cancelled"
    );
  });

  // Calculate booked rooms by type for the specific period
  const bookedRoomsByType = {};
  overlappingBookings.forEach((booking) => {
    booking.bookedRooms.forEach((room) => {
      if (!bookedRoomsByType[room.roomType]) {
        bookedRoomsByType[room.roomType] = 0;
      }
      bookedRoomsByType[room.roomType] += room.quantity;
    });
  });

  // Check availability for requested rooms
  const availability = {};
  for (const requestedRoom of requestedRooms) {
    const propertyRoom = property.roomTypes.find((r) => r.type === requestedRoom.roomType);

    if (!propertyRoom) {
      throw new ErrorHandler(`Room type ${requestedRoom.roomType} not found in property`, 400);
    }

    const bookedCount = bookedRoomsByType[requestedRoom.roomType] || 0;
    const availableCount = propertyRoom.count - bookedCount;

    availability[requestedRoom.roomType] = {
      total: propertyRoom.count,
      booked: bookedCount,
      available: availableCount,
      requested: requestedRoom.quantity,
      canBook: availableCount >= requestedRoom.quantity,
      price: propertyRoom.price,
      overlappingBookings: overlappingBookings.filter(b =>
        b.bookedRooms.some(r => r.roomType === requestedRoom.roomType)
      ).map(b => ({
        bookingReference: b.bookingReference,
        checkIn: b.checkInDate,
        checkOut: b.checkOutDate,
        status: b.bookingStatus
      }))
    };

    if (availableCount < requestedRoom.quantity) {
      throw new ErrorHandler(
        `Not enough ${requestedRoom.roomType} rooms available. Requested: ${requestedRoom.quantity}, Available: ${availableCount}`,
        400
      );
    }
  }

  return { property, availability, overlappingBookings };
};

// Helper function to update booking statuses based on current date
const updateBookingStatuses = async () => {
  const now = new Date();

  // Update bookings that should be marked as completed (check-out date has passed)
  await Booking.updateMany(
    {
      checkOutDate: { $lt: now },
      bookingStatus: { $in: ["pending", "confirmed", "active"] }
    },
    {
      $set: { bookingStatus: "completed" }
    }
  );

  // Update bookings that should be marked as active (check-in time reached, but check-out hasn't)
  await Booking.updateMany(
    {
      checkInDate: { $lte: now },
      checkOutDate: { $gt: now },
      bookingStatus: "confirmed"
    },
    {
      $set: { bookingStatus: "active" }
    }
  );
};

// @desc    Extend booking
// @route   PUT /api/v1/bookings/:id/extend
// @access  Public (with booking reference) or Authenticated
export const extendBooking = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { newCheckOutDate, reason } = req.body;

  if (!newCheckOutDate) {
    return next(new ErrorHandler("New check-out date is required", 400));
  }

  // Find the booking
  const booking = await Booking.findById(id).populate("property_id");
  if (!booking) {
    return next(new ErrorHandler("Booking not found", 404));
  }

  // Validate new check-out date
  const currentCheckOut = new Date(booking.checkOutDate);
  const newCheckOut = new Date(newCheckOutDate);

  if (newCheckOut <= currentCheckOut) {
    return next(new ErrorHandler("New check-out date must be after current check-out date", 400));
  }

  // Check if extension is possible (rooms available for extended period)
  const { availability } = await checkRoomAvailability(
    booking.property_id._id,
    booking.checkOutDate,
    newCheckOutDate,
    booking.bookedRooms
  );

  // Calculate additional cost
  const additionalNights = Math.ceil((newCheckOut - currentCheckOut) / (1000 * 60 * 60 * 24));
  let additionalCost = 0;

  booking.bookedRooms.forEach(room => {
    const roomAvailability = availability[room.roomType];
    additionalCost += roomAvailability.price * room.quantity * additionalNights;
  });

  // Update booking
  booking.checkOutDate = newCheckOut;
  booking.totalAmount += additionalCost;
  booking.extensionHistory = booking.extensionHistory || [];
  booking.extensionHistory.push({
    previousCheckOut: currentCheckOut,
    newCheckOut: newCheckOut,
    additionalCost: additionalCost,
    reason: reason || "Extension requested",
    extendedAt: new Date()
  });

  await booking.save();

  res.json({
    success: true,
    message: "Booking extended successfully",
    data: {
      booking: booking,
      additionalCost: additionalCost,
      additionalNights: additionalNights
    }
  });
});

// @desc    Get user booking history
// @route   GET /api/v1/bookings/history
// @access  Public (with email) or Authenticated
export const getBookingHistory = catchAsyncErrors(async (req, res, next) => {
  const { email, phone } = req.query;
  const { page = 1, limit = 10 } = req.query;

  let filter = {};

  if (req.user) {
    // Authenticated user - show their bookings
    filter.user_id = req.user.id;
  } else if (email || phone) {
    // Public access with email/phone
    if (email) filter.guestEmail = email;
    if (phone) filter.guestPhone = phone;
  } else {
    return next(new ErrorHandler("Email or phone number is required for public access", 400));
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate("property_id", "name address photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Booking.countDocuments(filter)
  ]);

  // Update booking statuses before returning
  await updateBookingStatuses();

  res.json({
    success: true,
    message: "Booking history fetched successfully",
    data: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
      bookings: bookings
    }
  });
});

// @desc    Create new booking
// @route   POST /api/v1/bookings
// @access  Public
export const createBooking = catchAsyncErrors(async (req, res, next) => {
  const {
    property_id,
    guestName,
    guestEmail,
    guestPhone,
    checkInDate,
    checkOutDate,
    checkoutDate, // Support both camelCase and lowercase variants
    numberOfGuests,
    bookedRooms,
    specialRequests,
    paymentType = "online", // Default to online payment
  } = req.body;

  // Use checkOutDate or checkoutDate (whichever is provided)
  const finalCheckOutDate = checkOutDate || checkoutDate;

  // Validate required fields
  if (!property_id || !guestName || !guestEmail || !guestPhone || !checkInDate || !finalCheckOutDate || !numberOfGuests || !bookedRooms) {
    return next(new ErrorHandler("Please provide all required fields", 400));
  }

  // Validate guest name
  if (typeof guestName !== 'string' || guestName.trim().length < 2 || guestName.trim().length > 100) {
    return next(new ErrorHandler("Guest name must be between 2 and 100 characters", 400));
  }

  // Validate guest email (optional)
  if (guestEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guestEmail) || guestEmail.length > 100) {
      return next(new ErrorHandler("Please provide a valid email address", 400));
    }
  }

  // Validate guest phone - Support Pakistani formats: 03084143960 (11 digits) or +92 308 5739464 (12 digits)
  const phoneDigits = guestPhone.replace(/\D/g, ''); // Remove all non-digit characters
  const phoneLength = phoneDigits.length;

  // Check if it's Pakistani format
  if (phoneDigits.startsWith('92')) {
    // International format: +92 XXX XXXXXXX (12 digits total)
    if (phoneLength !== 12) {
      return next(new ErrorHandler("Please provide a valid phone number. International format: +92 XXX XXXXXXX", 400));
    }
  } else if (phoneDigits.startsWith('0')) {
    // Local format: 0XXXXXXXXXX (11 digits)
    if (phoneLength !== 11) {
      return next(new ErrorHandler("Please provide a valid phone number. Local format: 0XXXXXXXXXX (11 digits)", 400));
    }
  } else if (phoneLength === 10) {
    // 10 digits without 0 prefix - acceptable (will be formatted)
    // Allow this format
  } else {
    return next(new ErrorHandler("Please provide a valid Pakistani phone number (e.g., 03084143960 or +92 308 5739464)", 400));
  }

  // Validate number of guests
  if (!Number.isInteger(Number(numberOfGuests)) || Number(numberOfGuests) < 1 || Number(numberOfGuests) > 20) {
    return next(new ErrorHandler("Number of guests must be between 1 and 20", 400));
  }

  // Validate special requests
  if (specialRequests && (typeof specialRequests !== 'string' || specialRequests.length > 500)) {
    return next(new ErrorHandler("Special requests must be less than 500 characters", 400));
  }

  // Validate dates
  // Handle date string parsing - support multiple formats
  let checkIn = new Date(checkInDate);
  let checkOut = new Date(finalCheckOutDate);

  // If date string is in YYYY-MM-DD format, parse it correctly to avoid timezone issues
  if (typeof checkInDate === 'string' && checkInDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Parse as local date to avoid timezone conversion issues
    const [year, month, day] = checkInDate.split('-').map(Number);
    checkIn = new Date(year, month - 1, day);
  }

  if (typeof finalCheckOutDate === 'string' && finalCheckOutDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = finalCheckOutDate.split('-').map(Number);
    checkOut = new Date(year, month - 1, day);
  }

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return next(new ErrorHandler("Please provide valid dates", 400));
  }

  // Get today's date at midnight in local timezone for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Normalize check-in date to midnight for comparison (local timezone)
  const checkInDateOnly = new Date(checkIn);
  checkInDateOnly.setHours(0, 0, 0, 0);

  // Allow same-day check-ins, only reject past dates
  if (checkInDateOnly < today) {
    return next(new ErrorHandler("Check-in date cannot be in the past", 400));
  }

  if (checkOut <= checkIn) {
    return next(new ErrorHandler("Check-out date must be after check-in date", 400));
  }

  // Validate minimum and maximum stay duration
  const diffTime = checkOut - checkIn;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 1) {
    return next(new ErrorHandler("Minimum stay is 1 night", 400));
  }

  if (diffDays > 30) {
    return next(new ErrorHandler("Maximum stay is 30 nights", 400));
  }

  // Validate booked rooms
  if (!Array.isArray(bookedRooms) || bookedRooms.length === 0) {
    return next(new ErrorHandler("At least one room must be booked", 400));
  }

  // Validate room booking data
  let totalRoomsRequested = 0;
  const roomTypeSet = new Set();

  for (const room of bookedRooms) {
    // Validate room type
    if (!room.roomType || !['single', 'double'].includes(room.roomType)) {
      return next(new ErrorHandler("Room type must be 'single' or 'double'", 400));
    }

    // Validate quantity
    if (!room.quantity || !Number.isInteger(Number(room.quantity)) || Number(room.quantity) < 1 || Number(room.quantity) > 10) {
      return next(new ErrorHandler("Room quantity must be between 1 and 10", 400));
    }

    // Check for duplicate room types
    if (roomTypeSet.has(room.roomType)) {
      return next(new ErrorHandler(`Room type '${room.roomType}' can only be booked once per booking`, 400));
    }
    roomTypeSet.add(room.roomType);

    totalRoomsRequested += Number(room.quantity);
  }

  // Validate total rooms
  if (totalRoomsRequested === 0) {
    return next(new ErrorHandler("At least one room must be selected", 400));
  }

  // Check room availability and get property details
  const { property, availability } = await checkRoomAvailability(
    property_id,
    checkIn,
    checkOut,
    bookedRooms
  );

  // Calculate total amount and prepare booked rooms
  let totalAmount = 0;
  let totalRooms = 0;
  const processedRooms = bookedRooms.map((room) => {
    const roomAvailability = availability[room.roomType];
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    const roomTotal = roomAvailability.price * room.quantity * nights;
    totalAmount += roomTotal;
    totalRooms += room.quantity;

    return {
      roomType: room.roomType,
      quantity: room.quantity,
      pricePerRoom: roomAvailability.price,
    };
  });

  // Add platform fee for payment on arrival (200 PKR)
  let platformFee = 0;
  if (paymentType === "on_arrival") {
    platformFee = 200;
    totalAmount += platformFee;
  }

  // Calculate commission based on payment type
  // Online: 20% commission, On Arrival: 15% commission
  let commissionPercentage = paymentType === "online" ? 20 : 15;
  let commissionAmount = (totalAmount * commissionPercentage) / 100;
  let hotelOwnerAmount = totalAmount - commissionAmount;

  // Generate booking ID and reference
  let bookingId = generateBookingId();
  let bookingReference = generateBookingReference();

  // Ensure uniqueness
  let exists = await Booking.exists({ booking_id: bookingId });
  let attempts = 0;
  while (exists && attempts < 5) {
    bookingId = generateBookingId();
    exists = await Booking.exists({ booking_id: bookingId });
    attempts++;
  }

  // Determine booking and payment status based on payment type
  let bookingStatus = "pending";
  let paymentStatus = "pending";

  if (paymentType === "on_arrival") {
    // For payment on arrival, booking is confirmed immediately
    bookingStatus = "confirmed";
    paymentStatus = "pending"; // Payment will be collected on arrival
  }

  // Create booking
  const booking = await Booking.create({
    booking_id: bookingId,
    bookingReference,
    currency: property.currency || "USD",
    property_id,
    user_id: req.user?.id || null,
    guestName,
    guestEmail,
    guestPhone,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    numberOfGuests,
    bookedRooms: processedRooms,
    totalRooms,
    totalAmount,
    specialRequests: specialRequests || "",
    bookingStatus,
    paymentStatus,
    paymentType,
    platformFee,
    commissionAmount,
    commissionPercentage,
    hotelOwnerAmount,
  });

  // Populate property details
  await booking.populate("property_id", "name address contactEmail contactPhone");

  // Emit socket event if available
  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      // Notify property owner
      io.to(`user:${property.owner_id}`).emit("booking.created", {
        booking_id: booking.booking_id,
        bookingReference: booking.bookingReference,
        property_name: property.name,
        guest_name: guestName,
      });

      // Notify all admins
      io.to("staff:all").emit("booking.created", {
        booking_id: booking.booking_id,
        bookingReference: booking.bookingReference,
        property_name: property.name,
        guest_name: guestName,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: "Booking created successfully",
    data: booking,
  });
});

// @desc    Get all bookings
// @route   GET /api/v1/bookings
// @access  Admin, Staff, User
export const getAllBookings = catchAsyncErrors(async (req, res, next) => {
  // Update booking statuses automatically before fetching
  await updateBookingStatuses();

  const {
    page = 1,
    limit = 20,
    bookingStatus,
    paymentStatus,
    search,
    property_id,
    startDate,
    endDate,
    sortBy = "createdAt",
    order = "desc",
  } = req.query;

  const filter = {};

  // Role-based filtering
  if (req.user) {
    if (req.user.role === "user") {
      // Users see only their own bookings
      filter.user_id = req.user.id;
    } else if (req.user.role === "staff") {
      // Staff see bookings for their properties
      const properties = await Property.find({ owner_id: req.user.id }).select("_id");
      const propertyIds = properties.map((p) => p._id);
      filter.property_id = { $in: propertyIds };
    } else if (req.user.role === "subadmin") {
      // Subadmin see bookings for their staff's properties
      const myStaff = await User.find({ createdBy: req.user.id }).select("_id");
      const staffIds = [req.user.id, ...myStaff.map((s) => s._id)];
      const properties = await Property.find({ owner_id: { $in: staffIds } }).select("_id");
      const propertyIds = properties.map((p) => p._id);
      filter.property_id = { $in: propertyIds };
    }

    // Admin sees all bookings
  } else {
    // If no user (public route), check for staff_id parameter for filtering
    const { staff_id } = req.query;
    if (staff_id) {
      // Filter bookings for specific staff member's properties
      const properties = await Property.find({ owner_id: staff_id }).select("_id");
      const propertyIds = properties.map((p) => p._id);
      filter.property_id = { $in: propertyIds };
      console.log("Filtering bookings for staff_id:", staff_id, "Properties:", propertyIds);
    } else {
      // Show all bookings (for admin panel)
      console.log("No user authentication - showing all bookings");
    }
  }

  // Status filters
  if (bookingStatus) {
    filter.bookingStatus = bookingStatus;
  }
  if (paymentStatus) {
    filter.paymentStatus = paymentStatus;
  }

  // Property filter
  if (property_id) {
    filter.property_id = property_id;
  }

  // Date range filter
  if (startDate || endDate) {
    filter.checkInDate = {};
    if (startDate) filter.checkInDate.$gte = new Date(startDate);
    if (endDate) filter.checkInDate.$lte = new Date(endDate);
  }

  // Search filter
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");
    filter.$or = [
      { booking_id: searchRegex },
      { bookingReference: searchRegex },
      { guestName: searchRegex },
      { guestEmail: searchRegex },
      { guestPhone: searchRegex },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortOptions = {};
  sortOptions[sortBy] = order === "asc" ? 1 : -1;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate("property_id", "name address contactEmail contactPhone owner_id")
      .populate("user_id", "name email")
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Booking.countDocuments(filter),
  ]);

  // Hide phone numbers from staff (only admin can see phone numbers)
  const processedBookings = bookings.map(booking => {
    const bookingObj = { ...booking };

    // If user is staff OR staff_id is provided in query (for public admin route), hide phone number
    if ((req.user && req.user.role === "staff") || req.query.staff_id) {
      bookingObj.guestPhone = "***-***-****"; // Hide phone number
    }

    return bookingObj;
  });

  res.json({
    success: true,
    message: "Bookings fetched successfully",
    data: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
      bookings: processedBookings,
    },
  });
});

// @desc    Get booking by ID
// @route   GET /api/v1/bookings/:id
// @access  Admin, Staff, User (own booking)
export const getBookingById = catchAsyncErrors(async (req, res, next) => {
  // Update booking statuses automatically before fetching
  await updateBookingStatuses();

  const { id } = req.params;

  let booking;

  // Check if it's a MongoDB ObjectId, booking_id, or bookingReference
  if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
    booking = await Booking.findById(id)
      .populate("property_id", "name address contactEmail contactPhone checkInTime checkOutTime owner_id")
      .populate("user_id", "name email");
  } else {
    booking = await Booking.findOne({
      $or: [{ booking_id: id }, { bookingReference: id }],
    })
      .populate("property_id", "name address contactEmail contactPhone checkInTime checkOutTime owner_id")
      .populate("user_id", "name email");
  }

  if (!booking) {
    return next(new ErrorHandler("Booking not found", 404));
  }

  // Check access permissions
  if (req.user) {
    if (req.user.role === "user" && (!booking.user_id || String(booking.user_id._id) !== String(req.user.id))) {
      return next(new ErrorHandler("You don't have permission to view this booking", 403));
    }

    if (req.user.role === "staff") {
      const propertyOwnerId = booking.property_id?.owner_id;
      if (String(propertyOwnerId) !== String(req.user.id)) {
        return next(new ErrorHandler("You don't have permission to view this booking", 403));
      }
    }
  }

  // Hide phone number from staff (only admin can see phone numbers)
  const bookingData = booking.toObject();
  if (req.user && req.user.role === "staff") {
    bookingData.guestPhone = "***-***-****"; // Hide phone number
  }

  res.json({
    success: true,
    message: "Booking fetched successfully",
    data: bookingData,
  });
});

// @desc    Update booking status
// @route   PATCH /api/v1/bookings/:id/status
// @access  Admin, Staff
export const updateBookingStatus = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { bookingStatus, paymentStatus, notes } = req.body;

  const booking = await Booking.findById(id).populate("property_id", "owner_id");

  if (!booking) {
    return next(new ErrorHandler("Booking not found", 404));
  }

  // Check permissions for staff
  if (req.user.role === "staff") {
    const propertyOwnerId = booking.property_id?.owner_id;
    if (String(propertyOwnerId) !== String(req.user.id)) {
      return next(new ErrorHandler("You don't have permission to update this booking", 403));
    }
  }

  // Update booking status
  if (bookingStatus && ["pending", "confirmed", "cancelled", "completed", "no-show"].includes(bookingStatus)) {
    booking.bookingStatus = bookingStatus;

    if (bookingStatus === "cancelled") {
      booking.cancelledAt = new Date();
    }
  }

  // Update payment status
  if (paymentStatus && ["pending", "paid", "refunded", "failed"].includes(paymentStatus)) {
    booking.paymentStatus = paymentStatus;
  }

  // Add notes
  if (notes) {
    booking.notes = notes;
  }

  await booking.save();

  // Emit socket event
  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      // Notify guest if they're a registered user
      if (booking.user_id) {
        io.to(`user:${booking.user_id}`).emit("booking.updated", {
          booking_id: booking.booking_id,
          bookingStatus: booking.bookingStatus,
          paymentStatus: booking.paymentStatus,
        });
      }
    }
  }

  res.json({
    success: true,
    message: "Booking status updated successfully",
    data: booking,
  });
});

export const updatePaymentStatus = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { paymentStatus } = req.body;

  if (!paymentStatus || !["pending", "paid", "refunded", "failed"].includes(paymentStatus)) {
    return next(new ErrorHandler("Invalid payment status", 400));
  }

  const booking = await Booking.findById(id).populate("property_id", "owner_id");

  if (!booking) {
    return next(new ErrorHandler("Booking not found", 404));
  }

  // Check permissions for staff
  if (req.user.role === "staff") {
    const propertyOwnerId = booking.property_id?.owner_id;
    if (String(propertyOwnerId) !== String(req.user.id)) {
      return next(new ErrorHandler("You don't have permission to update this booking", 403));
    }
  }

  // Update payment status
  booking.paymentStatus = paymentStatus;
  await booking.save();

  // Emit socket event
  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      // Notify guest if they're a registered user
      if (booking.user_id) {
        io.to(`user:${booking.user_id}`).emit("booking.payment.updated", {
          bookingId: booking._id,
          bookingReference: booking.bookingReference,
          paymentStatus: paymentStatus,
        });
      }
      // Notify property owner
      if (booking.property_id?.owner_id) {
        io.to(`staff:${booking.property_id.owner_id}`).emit("booking.payment.updated", {
          bookingId: booking._id,
          bookingReference: booking.bookingReference,
          paymentStatus: paymentStatus,
        });
      }
    }
  }

  res.json({
    success: true,
    message: "Payment status updated successfully",
    data: booking,
  });
});

// @desc    Cancel booking
// @route   POST /api/v1/bookings/:id/cancel
// @access  Admin, Staff, User (own booking)
export const cancelBooking = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { cancellationReason } = req.body;

  const booking = await Booking.findById(id).populate("property_id", "owner_id");

  if (!booking) {
    return next(new ErrorHandler("Booking not found", 404));
  }

  // Check permissions
  if (req.user) {
    if (req.user.role === "user" && (!booking.user_id || String(booking.user_id) !== String(req.user.id))) {
      return next(new ErrorHandler("You don't have permission to cancel this booking", 403));
    }

    if (req.user.role === "staff") {
      const propertyOwnerId = booking.property_id?.owner_id;
      if (String(propertyOwnerId) !== String(req.user.id)) {
        return next(new ErrorHandler("You don't have permission to cancel this booking", 403));
      }
    }
  }

  // Check if booking can be cancelled
  if (booking.bookingStatus === "cancelled") {
    return next(new ErrorHandler("Booking is already cancelled", 400));
  }

  if (booking.bookingStatus === "completed") {
    return next(new ErrorHandler("Cannot cancel completed booking", 400));
  }

  // Update booking
  booking.bookingStatus = "cancelled";
  booking.cancelledAt = new Date();
  booking.cancellationReason = cancellationReason || "Cancelled by user";
  await booking.save();

  res.json({
    success: true,
    message: "Booking cancelled successfully",
    data: booking,
  });
});

// @desc    Get booking statistics
// @route   GET /api/v1/bookings/stats
// @access  Admin, Staff
export const getBookingStats = catchAsyncErrors(async (req, res, next) => {
  // Update booking statuses automatically before fetching stats
  await updateBookingStatuses();

  const filter = {};

  // Staff/Subadmin data isolation
  if (req.user.role === "staff") {
    const properties = await Property.find({ owner_id: req.user.id }).select("_id");
    const propertyIds = properties.map((p) => p._id);
    filter.property_id = { $in: propertyIds };
  } else if (req.user.role === "subadmin") {
    const myStaff = await User.find({ createdBy: req.user.id }).select("_id");
    const staffIds = [req.user.id, ...myStaff.map((s) => s._id)];
    const properties = await Property.find({ owner_id: { $in: staffIds } }).select("_id");
    const propertyIds = properties.map((p) => p._id);
    filter.property_id = { $in: propertyIds };
  }


  const [statusStats, paymentStats, totalRevenue, todayBookings] = await Promise.all([
    // Booking status statistics
    Booking.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$bookingStatus",
          count: { $sum: 1 },
        },
      },
    ]),

    // Payment status statistics
    Booking.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
        },
      },
    ]),

    // Total revenue from paid bookings
    Booking.aggregate([
      {
        $match: {
          ...filter,
          paymentStatus: "paid",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]),

    // Today's bookings
    Booking.countDocuments({
      ...filter,
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    }),
  ]);

  const totalBookings = await Booking.countDocuments(filter);

  res.json({
    success: true,
    message: "Booking statistics fetched successfully",
    data: {
      totalBookings,
      todayBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      statusStats,
      paymentStats,
    },
  });
});

// @desc    Add admin note to booking
// @route   POST /api/v1/bookings/:id/notes
// @access  Admin, Staff
export const addBookingNote = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { note } = req.body;

  if (!note || !note.trim()) {
    return next(new ErrorHandler("Note is required", 400));
  }

  const booking = await Booking.findById(id);

  if (!booking) {
    return next(new ErrorHandler("Booking not found", 404));
  }

  // Check permissions for staff
  if (req.user.role === "staff") {
    const property = await Property.findById(booking.property_id).select("owner_id");
    if (String(property.owner_id) !== String(req.user.id)) {
      return next(new ErrorHandler("You don't have permission to add notes to this booking", 403));
    }
  }

  const noteWithTimestamp = `[${new Date().toISOString()}] ${req.user.name || req.user.email}: ${note}`;
  booking.adminNotes.push(noteWithTimestamp);
  await booking.save();

  res.json({
    success: true,
    message: "Note added successfully",
    data: booking,
  });
});


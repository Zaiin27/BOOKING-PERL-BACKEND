import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import Property from "../models/propertyModel.js";
import Booking from "../models/bookingModel.js";
import Plan from "../models/planModel.js";
import Subscription from "../models/subscriptionModel.js";
import User from "../models/userModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import mongoose from "mongoose";

// Helper function to generate property ID
const generatePropertyId = () => {
  return `PROP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
};

const MAX_PROPERTY_IMAGES = 2;

export const createProperty = catchAsyncErrors(async (req, res, next) => {
  console.log("Create Property API called");
  console.log("Request body:", req.body);
  console.log("Request user:", req.user);
  console.log("Authorization header:", req.headers.authorization);
  console.log("Owner ID from request:", req.body.owner_id);
  
  const {
    name,
    address,
    description,
    roomTypes,
    photos,
    contactEmail,
    contactPhone,
    checkInTime,
    checkOutTime,
    amenities,
    currency,
    owner_id, // Add owner_id from request body
  } = req.body;

  // Determine the owner (for admin creating property for staff, or staff creating for themselves)
  const ownerId = owner_id || req.user.id;
  
  // Plan-based limits check (only for staff/users, admins and superadmins bypass)
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    // Get user's active subscription and plan
    const subscription = await Subscription.findOne({
      user_id: ownerId,
      status: "active",
    }).populate("plan_id");
    
    let plan;
    if (subscription && subscription.isActive()) {
      plan = subscription.plan_id;
    } else {
      plan = await Plan.findOne({ name: "free" });
    }
    
    if (!plan) {
      return next(new ErrorHandler("Unable to determine your plan. Please contact support.", 500));
    }
    
    // Check property count limit
    if (plan.maxProperties !== -1) {
      const propertyCount = await Property.countDocuments({ owner_id: ownerId });
      if (propertyCount >= plan.maxProperties) {
        return next(
          new ErrorHandler(
            `You have reached the maximum number of properties (${plan.maxProperties}) for your ${plan.displayName}. Please upgrade your plan to add more properties.`,
            403
          )
        );
      }
    }
    
    // Check photo limit per property
    if (plan.maxPhotosPerProperty !== -1) {
      const photoCount = photos?.filter(photo => photo)?.length || 0;
      if (photoCount > plan.maxPhotosPerProperty) {
        return next(
          new ErrorHandler(
            `Your plan (${plan.displayName}) allows a maximum of ${plan.maxPhotosPerProperty} photos per property. You are trying to upload ${photoCount} photos. Please upgrade your plan.`,
            403
          )
        );
      }
    }
  }
  
  // Legacy check: Staff can only create 1 property (if not already handled by plan)
  if (req.user.role === "staff" && !owner_id) {
    const existingProperty = await Property.findOne({ owner_id: req.user.id });
    if (existingProperty) {
      return next(new ErrorHandler("Staff members can only create one property. Contact admin for additional properties.", 403));
    }
  }
  // Admin/Superadmin can create unlimited properties - no restriction

  // Validate required fields
  if (!name || !address || !roomTypes || !contactEmail) {
    return next(new ErrorHandler("Please provide all required fields", 400));
  }

  // Validate property name
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100) {
    return next(new ErrorHandler("Property name must be between 3 and 100 characters", 400));
  }

  // Validate address
  if (typeof address !== 'string' || address.trim().length < 10 || address.trim().length > 500) {
    return next(new ErrorHandler("Address must be between 10 and 500 characters", 400));
  }

  // Validate description
  if (description && (typeof description !== 'string' || description.length > 1000)) {
    return next(new ErrorHandler("Description must be less than 1000 characters", 400));
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(contactEmail)) {
    return next(new ErrorHandler("Please provide a valid email address", 400));
  }

  // Validate phone number
  if (contactPhone && !/^[\+]?[1-9][\d]{0,15}$/.test(contactPhone)) {
    return next(new ErrorHandler("Please provide a valid phone number", 400));
  }

  // Validate check-in/check-out times
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (checkInTime && !timeRegex.test(checkInTime)) {
    return next(new ErrorHandler("Invalid check-in time format (HH:MM)", 400));
  }
  if (checkOutTime && !timeRegex.test(checkOutTime)) {
    return next(new ErrorHandler("Invalid check-out time format (HH:MM)", 400));
  }

  // Validate check-out is after check-in
  if (checkInTime && checkOutTime) {
    const checkIn = new Date(`2000-01-01T${checkInTime}`);
    const checkOut = new Date(`2000-01-01T${checkOutTime}`);
    if (checkOut <= checkIn) {
      return next(new ErrorHandler("Check-out time must be after check-in time", 400));
    }
  }

  // Validate and process photos array
  let processedPhotos = [];
  if (photos !== undefined && photos !== null) {
    if (!Array.isArray(photos)) {
      return next(new ErrorHandler("Photos must be an array", 400));
    }
    if (photos.length > MAX_PROPERTY_IMAGES) {
      return next(new ErrorHandler(`Maximum ${MAX_PROPERTY_IMAGES} images are allowed per property`, 400));
    }
    // Filter out null/undefined values and validate each photo
    processedPhotos = photos.filter(photo => {
      if (!photo || typeof photo !== 'string') return false;
      // Check if it's a base64 string or a valid URL
      const isBase64 = photo.startsWith('data:image/');
      const isUrl = /^https?:\/\/.+/.test(photo);
      return isBase64 || isUrl;
    });
  }

  // Validate room types
  if (!Array.isArray(roomTypes) || roomTypes.length === 0) {
    return next(new ErrorHandler("At least one room type is required", 400));
  }

  // Validate room type uniqueness
  const roomTypeSet = new Set();
  for (const room of roomTypes) {
    if (roomTypeSet.has(room.type)) {
      return next(new ErrorHandler(`Room type '${room.type}' can only be added once`, 400));
    }
    roomTypeSet.add(room.type);
  }

  // Calculate total rooms and validate room data
  let totalRooms = 0;
  const processedRoomTypes = roomTypes.map((room) => {
    // Validate room type
    if (!room.type || !['single', 'double'].includes(room.type)) {
      throw new ErrorHandler("Room type must be 'single' or 'double'", 400);
    }

    // Validate count
    if (!room.count || !Number.isInteger(Number(room.count)) || Number(room.count) < 0 || Number(room.count) > 1000) {
      throw new ErrorHandler("Room count must be an integer between 0 and 1000", 400);
    }

    // Validate price
    if (!room.price || Number(room.price) <= 0 || Number(room.price) > 10000) {
      throw new ErrorHandler("Room price must be between $1 and $10,000", 400);
    }

    totalRooms += Number(room.count);
    return {
      type: room.type,
      count: Number(room.count),
      price: Number(room.price),
      available: Number(room.count), // Initially all rooms are available
    };
  });

  // Validate total rooms
  if (totalRooms === 0) {
    return next(new ErrorHandler("Total rooms must be at least 1", 400));
  }

  // Generate unique property ID
  let propertyId = generatePropertyId();
  let exists = await Property.exists({ property_id: propertyId });
  let attempts = 0;
  while (exists && attempts < 5) {
    propertyId = generatePropertyId();
    exists = await Property.exists({ property_id: propertyId });
    attempts++;
  }

  if (exists) {
    return next(new ErrorHandler("Failed to generate unique property ID", 500));
  }

  
  // Get plan features to apply (for non-admin users)
  let planFeatures = {
    verifiedBadge: false,
    trustedHostBadge: false,
    premiumBadge: false,
  };
  let isPriority = false;
  let isFeatured = false;
  let searchPriority = 1;

  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    const subscription = await Subscription.findOne({
      user_id: ownerId,
      status: "active",
    }).populate("plan_id");
    
    if (subscription && subscription.isActive() && subscription.plan_id) {
      const plan = subscription.plan_id;
      
      // Apply badges
      if (plan.badges) {
        planFeatures = {
          verifiedBadge: plan.badges.verified || false,
          trustedHostBadge: plan.badges.trustedHost || false,
          premiumBadge: plan.badges.premium || false,
        };
      }
      
      // Apply priority/featured
      isPriority = plan.features?.priorityVisibility || false;
      isFeatured = plan.features?.featuredPlacement || false;
      searchPriority = plan.searchPriority || 1;
    }
  }

  // Get paymentType from staff owner if property is owned by staff
  let propertyPaymentType = "both"; // Default
  if (ownerId) {
    const owner = await User.findById(ownerId).select("paymentType role");
    if (owner && owner.role === "staff" && owner.paymentType) {
      propertyPaymentType = owner.paymentType;
    }
  }

  const property = await Property.create({
    property_id: propertyId,
    name,
    address,
    description,
    roomTypes: processedRoomTypes,
    totalRooms,
    photos: processedPhotos,
    contactEmail,
    contactPhone,
    checkInTime: checkInTime || "14:00",
    checkOutTime: checkOutTime || "11:00",
    amenities: amenities || [],
    currency: currency || "USD",
    owner_id: owner_id || req.user.id, // Use provided owner_id or current user
    createdBy: req.user.role,
    planFeatures,
    isPriority,
    isFeatured,
    searchPriority,
    paymentType: propertyPaymentType, // Inherit from staff owner
  });

  console.log("Property created successfully:", property);
  
  res.status(201).json({
    success: true,
    message: "Property created successfully",
    data: property,
  });
});

// @desc    Get all properties (Optimized)
// @route   GET /api/v1/properties
// @access  Public
export const getAllProperties = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 10, status, search, sortBy = "createdAt", order = "desc", owner_id } = req.query;

  const filter = {};

  // Role-based filtering
  if (req.user) {
    if (req.user.role === "staff") {
      filter.owner_id = req.user.id;
    }
  }

  // Owner ID filter
  if (owner_id) {
    filter.owner_id = owner_id;
  }

  // Status filter - optimized with index
  if (status) {
    filter.status = status;
  } else {
    if (!req.user || req.user.role === "user") {
      filter.status = "active";
    }
  }

  // Optimized search - use text index if available, otherwise regex with limit
  if (search && search.trim()) {
    const searchTerm = search.trim();
    // Use text search if index exists, otherwise use optimized regex
    if (searchTerm.length > 2) {
      filter.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { address: { $regex: searchTerm, $options: "i" } },
      ];
      // Only search description if search term is longer
      if (searchTerm.length > 5) {
        filter.$or.push({ description: { $regex: searchTerm, $options: "i" } });
      }
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const limitNum = Math.min(Number(limit), 50); // Max 50 items per page
  
  // Optimized sort options
  let sortOptions = {};
  if (sortBy === "createdAt" && !req.query.sortBy) {
    sortOptions = {
      isFeatured: -1,
      isPriority: -1,
      searchPriority: -1,
      createdAt: -1,
    };
  } else {
    sortOptions[sortBy] = order === "asc" ? 1 : -1;
    if (sortBy !== "isFeatured" && sortBy !== "isPriority" && sortBy !== "searchPriority") {
      sortOptions = {
        isFeatured: -1,
        isPriority: -1,
        searchPriority: -1,
        ...sortOptions,
      };
    }
  }

  // Optimized field selection - exclude heavy fields
  const selectFields = "name address description roomTypes photos status currency isFeatured isPriority searchPriority owner_id createdAt contactEmail amenities checkInTime checkOutTime";
  
  // Try aggregation pipeline first, fallback to find() if it fails
  let properties, total;
  
  try {
    // Use aggregation pipeline for better performance
    const pipeline = [
      { $match: filter },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limitNum },
      {
        $project: {
          name: 1,
          address: 1,
          description: 1,
          roomTypes: 1,
          photos: { $slice: ["$photos", 1] }, // Only first photo for list view
          status: 1,
          currency: 1,
          isFeatured: 1,
          isPriority: 1,
          searchPriority: 1,
          owner_id: 1,
          createdAt: 1,
          contactEmail: 1,
          amenities: 1,
          checkInTime: 1,
          checkOutTime: 1,
          // Calculate available rooms in projection
          availableRooms: {
            $reduce: {
              input: { $ifNull: ["$roomTypes", []] },
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.available", 0] }] }
            }
          }
        }
      },
      // Lightweight populate using lookup
      {
        $lookup: {
          from: "users",
          localField: "owner_id",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            { $project: { name: 1, email: 1, role: 1 } }
          ]
        }
      },
      {
        $unwind: {
          path: "$owner",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          owner_id: "$owner"
        }
      },
      {
        $project: {
          owner: 0
        }
      }
    ];

    // Parallel execution for count and data
    [properties, total] = await Promise.all([
      Property.aggregate(pipeline).maxTimeMS(5000), // 5 second timeout
      Property.countDocuments(filter).maxTimeMS(2000), // 2 second count timeout
    ]);
  } catch (aggregationError) {
    console.error("Aggregation pipeline error, falling back to find():", aggregationError);
    
    // Fallback to traditional find() method
    const selectFields = "name address description roomTypes photos status currency isFeatured isPriority searchPriority owner_id createdAt contactEmail amenities checkInTime checkOutTime";
    
    [properties, total] = await Promise.all([
      Property.find(filter)
        .select(selectFields)
        .populate("owner_id", "name email role")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Property.countDocuments(filter).maxTimeMS(2000),
    ]);

    // Calculate available rooms for each property
    properties = properties.map(property => {
      const availableRooms = property.roomTypes?.reduce((total, room) => {
        return total + (room.available || 0);
      }, 0) || 0;
      
      return {
        ...property,
        availableRooms
      };
    });
  }

  res.json({
    success: true,
    message: "Properties fetched successfully",
    data: {
      total,
      page: Number(page),
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      properties,
    },
  });
});


export const getPropertyById = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  let property;
  
  // Check if it's a MongoDB ObjectId or property_id
  if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
    property = await Property.findById(id).populate("owner_id", "name email contactPhone");
  } else {
    property = await Property.findOne({ property_id: id }).populate("owner_id", "name email contactPhone");
  }

  if (!property) {
    return next(new ErrorHandler("Property not found", 404));
  }

  // Check access for staff
  if (req.user && req.user.role === "staff" && String(property.owner_id._id) !== String(req.user.id)) {
    return next(new ErrorHandler("You don't have permission to view this property", 403));
  }

  res.json({
    success: true,
    message: "Property fetched successfully",
    data: property,
  });
});

// @desc    Update property
// @route   PUT /api/v1/properties/:id
// @access  Admin, Staff (own properties)
export const updateProperty = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  let property = await Property.findById(id);

  if (!property) {
    return next(new ErrorHandler("Property not found", 404));
  }

  // Check permissions
  if (req.user.role === "staff" && String(property.owner_id) !== String(req.user.id)) {
    return next(new ErrorHandler("You don't have permission to update this property", 403));
  }

  const {
    name,
    address,
    description,
    roomTypes,
    photos,
    contactEmail,
    contactPhone,
    checkInTime,
    checkOutTime,
    amenities,
    currency,
    status,
  } = req.body;

  // Validate photos if provided
  if (photos !== undefined) {
    if (!Array.isArray(photos)) {
      return next(new ErrorHandler("Photos must be an array", 400));
    }
    if (photos.length > MAX_PROPERTY_IMAGES) {
      return next(new ErrorHandler(`Maximum ${MAX_PROPERTY_IMAGES} images are allowed per property`, 400));
    }
    // Filter out null/undefined values and validate each photo
    const validPhotos = photos.filter(photo => {
      if (!photo || typeof photo !== 'string') return false;
      // Check if it's a base64 string or a valid URL
      const isBase64 = photo.startsWith('data:image/');
      const isUrl = /^https?:\/\/.+/.test(photo);
      return isBase64 || isUrl;
    });
    property.photos = validPhotos;
  }

  // Update fields
  if (name) property.name = name;
  if (address) property.address = address;
  if (description !== undefined) property.description = description;
  if (contactEmail) property.contactEmail = contactEmail;
  if (contactPhone !== undefined) property.contactPhone = contactPhone;
  if (checkInTime) property.checkInTime = checkInTime;
  if (checkOutTime) property.checkOutTime = checkOutTime;
  if (amenities) property.amenities = amenities;
  if (currency && ["USD", "PKR"].includes(currency)) {
    property.currency = currency;
  }
  if (status && ["active", "inactive", "maintenance"].includes(status)) {
    property.status = status;
  }

  // Update room types if provided
  if (roomTypes && Array.isArray(roomTypes)) {
    let totalRooms = 0;
    const processedRoomTypes = roomTypes.map((room) => {
      if (!room.type || room.count === undefined || !room.price) {
        throw new ErrorHandler("Invalid room type data", 400);
      }
      totalRooms += room.count;
      return {
        type: room.type,
        count: room.count,
        price: room.price,
        available: room.available !== undefined ? room.available : room.count,
      };
    });
    property.roomTypes = processedRoomTypes;
    property.totalRooms = totalRooms;
  }

  await property.save();

  res.json({
    success: true,
    message: "Property updated successfully",
    data: property,
  });
});

// @desc    Delete property
// @route   DELETE /api/v1/properties/:id
// @access  Admin, Staff (own properties)
export const deleteProperty = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const property = await Property.findById(id);

  if (!property) {
    return next(new ErrorHandler("Property not found", 404));
  }

  // Check permissions
  if (req.user.role === "staff" && String(property.owner_id) !== String(req.user.id)) {
    return next(new ErrorHandler("You don't have permission to delete this property", 403));
  }

  // Soft delete - set status to inactive
  property.status = "inactive";
  await property.save();

  res.json({
    success: true,
    message: "Property deleted successfully",
  });
});

// @desc    Get property statistics
// @route   GET /api/v1/properties/stats
// @access  Admin, Staff
// @desc    Check if staff can create property
// @route   GET /api/v1/properties/can-create
// @access  Private (Staff)
export const canCreateProperty = catchAsyncErrors(async (req, res, next) => {
  // Admin can create unlimited properties
  if (req.user.role === "admin") {
    return res.json({
      success: true,
      canCreate: true,
      message: "Admin can create unlimited properties"
    });
  }

  // Staff can only create 1 property
  if (req.user.role === "staff") {
    const existingProperty = await Property.findOne({ owner_id: req.user.id });
    const canCreate = !existingProperty;

    return res.json({
      success: true,
      canCreate,
      message: canCreate 
        ? "You can create a property" 
        : "You already have a property. Contact admin for additional properties.",
      existingProperty: existingProperty ? {
        id: existingProperty._id,
        name: existingProperty.name,
        status: existingProperty.status
      } : null
    });
  }

  // Default case
  return res.json({
    success: true,
    canCreate: false,
    message: "Invalid user role"
  });
});

export const getPropertyStats = catchAsyncErrors(async (req, res, next) => {
  const filter = {};

  // Staff can only see their own properties stats
  if (req.user.role === "staff") {
    filter.owner_id = new mongoose.Types.ObjectId(req.user.id);
  }

  const stats = await Property.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalRooms: { $sum: "$totalRooms" },
      },
    },
  ]);

  const totalProperties = await Property.countDocuments(filter);

  res.json({
    success: true,
    message: "Property statistics fetched successfully",
    data: {
      totalProperties,
      stats,
    },
  });
});

// @desc    Get real-time room availability for a property
// @route   GET /api/v1/properties/:id/availability
// @access  Public
export const getRealTimeRoomAvailability = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { checkInDate, checkOutDate } = req.query;

  const property = await Property.findById(id);
  if (!property) {
    return next(new ErrorHandler("Property not found", 404));
  }

  // If no dates provided, return current availability
  if (!checkInDate || !checkOutDate) {
    // Calculate current availability based on active bookings
    const now = new Date();
    const activeBookings = await Booking.find({
      property_id: id,
      bookingStatus: { $in: ["pending", "confirmed", "active"] },
      $or: [
        { checkInDate: { $lte: now }, checkOutDate: { $gt: now } }, // Currently active
        { checkInDate: { $gt: now } } // Future bookings
      ]
    }).maxTimeMS(5000); // 5 second timeout for availability query

    // Calculate booked rooms by type
    const bookedRoomsByType = {};
    activeBookings.forEach((booking) => {
      booking.bookedRooms.forEach((room) => {
        if (!bookedRoomsByType[room.roomType]) {
          bookedRoomsByType[room.roomType] = 0;
        }
        bookedRoomsByType[room.roomType] += room.quantity;
      });
    });

    // Update room availability
    const updatedRoomTypes = property.roomTypes.map((roomType) => {
      const bookedCount = bookedRoomsByType[roomType.type] || 0;
      return {
        ...roomType.toObject(),
        available: Math.max(0, roomType.count - bookedCount),
        booked: bookedCount
      };
    });

    return res.json({
      success: true,
      data: {
        property: {
          ...property.toObject(),
          roomTypes: updatedRoomTypes
        },
        availability: updatedRoomTypes.reduce((acc, room) => {
          acc[room.type] = {
            total: room.count,
            available: room.available,
            booked: room.booked,
            price: room.price
          };
          return acc;
        }, {})
      }
    });
  }

  // Calculate availability for specific dates
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  // Get overlapping bookings
  const overlappingBookings = await Booking.find({
    property_id: id,
    bookingStatus: { $in: ["pending", "confirmed", "active"] },
    $or: [
      { 
        checkInDate: { $lt: checkOut }, 
        checkOutDate: { $gt: checkIn } 
      }
    ]
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

  // Calculate availability for each room type
  const availability = {};
  property.roomTypes.forEach((roomType) => {
    const bookedCount = bookedRoomsByType[roomType.type] || 0;
    availability[roomType.type] = {
      total: roomType.count,
      available: Math.max(0, roomType.count - bookedCount),
      booked: bookedCount,
      price: roomType.price
    };
  });

  res.json({
    success: true,
    data: {
      property: property,
      availability: availability,
      period: {
        checkIn: checkInDate,
        checkOut: checkOutDate
      }
    }
  });
});

// @desc    Update room availability
// @route   PATCH /api/v1/properties/:id/availability
// @access  Admin, Staff (own properties)
export const updateRoomAvailability = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { roomType, available } = req.body;

  if (!roomType || available === undefined) {
    return next(new ErrorHandler("Room type and available count are required", 400));
  }

  const property = await Property.findById(id);

  if (!property) {
    return next(new ErrorHandler("Property not found", 404));
  }

  // Check permissions
  if (req.user.role === "staff" && String(property.owner_id) !== String(req.user.id)) {
    return next(new ErrorHandler("You don't have permission to update this property", 403));
  }

  // Find and update the room type
  const roomTypeIndex = property.roomTypes.findIndex((room) => room.type === roomType);

  if (roomTypeIndex === -1) {
    return next(new ErrorHandler("Room type not found", 404));
  }

  if (available > property.roomTypes[roomTypeIndex].count) {
    return next(new ErrorHandler("Available rooms cannot exceed total room count", 400));
  }

  property.roomTypes[roomTypeIndex].available = available;
  await property.save();

  res.json({
    success: true,
    message: "Room availability updated successfully",
    data: property,
  });
});


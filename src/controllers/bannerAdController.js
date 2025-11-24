import BannerAd from "../models/bannerAdModel.js";
import BannerAdClick from "../models/bannerAdClickModel.js";
import Property from "../models/propertyModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import mongoose from "mongoose";
import crypto from "crypto";

// @desc    Get all active banner ads (for carousel)
// @route   GET /api/v1/banner-ads
// @access  Public
export const getAllBannerAds = catchAsyncErrors(async (req, res, next) => {
  const now = new Date();
  
  // Ultra-fast aggregation pipeline for maximum performance (<100ms target)
  // Using aggregation is 3-5x faster than find() + populate()
  const ads = await BannerAd.aggregate([
    // Stage 1: Match active ads with valid properties (uses index)
    {
      $match: {
        isActive: true,
        property_id: { $exists: true, $ne: null },
        $or: [
          { endDate: null },
          { endDate: { $gte: now } },
        ],
      },
    },
    // Stage 2: Filter click limits early (before expensive lookup)
    {
      $match: {
        $or: [
          { clickLimit: null },
          { clickLimit: { $exists: false } },
          { $expr: { $lt: ["$clickCount", "$clickLimit"] } },
        ],
      },
    },
    // Stage 3: Lookup property with nested pipeline (single DB operation)
    {
      $lookup: {
        from: "properties",
        localField: "property_id",
        foreignField: "_id",
        as: "property",
        pipeline: [
          { $match: { status: "active" } },
          { $project: { name: 1, address: 1, photos: 1, currency: 1 } },
        ],
      },
    },
    // Stage 4: Unwind and filter out ads without valid properties
    {
      $unwind: {
        path: "$property",
        preserveNullAndEmptyArrays: false,
      },
    },
    // Stage 5: Sort early (before limit for better performance)
    {
      $sort: { priority: -1, createdAt: -1 },
    },
    // Stage 6: Limit results
    {
      $limit: 10,
    },
    // Stage 7: Final projection with property_id renamed
    {
      $project: {
        _id: 1,
        title: 1,
        description: 1,
        image: 1,
        ctaText: 1,
        priority: 1,
        property_id: "$property",
        createdAt: 1,
      },
    },
  ]);

  res.json({
    success: true,
    message: "Banner ads fetched successfully",
    data: ads,
  });
});

// @desc    Get all banner ads (Admin)
// @route   GET /api/v1/banner-ads/admin
// @access  Admin, Super Admin
export const getAllBannerAdsAdmin = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 20, isActive, property_id, search } = req.query;

  const filter = {};
  
  // Only apply isActive filter if it's explicitly "true" or "false", ignore empty strings
  if (isActive !== undefined && isActive !== "" && (isActive === "true" || isActive === "false")) {
    filter.isActive = isActive === "true";
  }
  
  if (property_id && property_id !== "") {
    filter.property_id = property_id;
  }

  // Search functionality
  if (search && search.trim() !== "") {
    const searchRegex = { $regex: search.trim(), $options: "i" };
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  // If search includes property name/address, we need to fetch all and filter in memory
  // Otherwise, use MongoDB query for better performance
  let ads;
  let total;

  if (search && search.trim() !== "") {
    // For search that includes property fields, fetch all matching ads
    ads = await BannerAd.find(filter)
      .populate("property_id", "name address")
      .populate("createdBy", "name email")
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    // Filter by property name/address in memory
    const searchLower = search.trim().toLowerCase();
    ads = ads.filter((ad) => {
      const matchesTitle = ad.title?.toLowerCase().includes(searchLower);
      const matchesDescription = ad.description?.toLowerCase().includes(searchLower);
      const matchesPropertyName = ad.property_id?.name?.toLowerCase().includes(searchLower);
      const matchesPropertyAddress = ad.property_id?.address?.toLowerCase().includes(searchLower);
      return matchesTitle || matchesDescription || matchesPropertyName || matchesPropertyAddress;
    });

    total = ads.length;
    // Apply pagination
    ads = ads.slice(skip, skip + Number(limit));
  } else {
    // No search - use efficient MongoDB query with pagination
    [ads, total] = await Promise.all([
      BannerAd.find(filter)
        .populate("property_id", "name address")
        .populate("createdBy", "name email")
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      BannerAd.countDocuments(filter),
    ]);
  }

  res.json({
    success: true,
    message: "Banner ads fetched successfully",
    data: {
      ads,
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Get banner ad by ID
// @route   GET /api/v1/banner-ads/:id
// @access  Admin, Super Admin
export const getBannerAdById = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const ad = await BannerAd.findById(id)
    .populate("property_id")
    .populate("createdBy", "name email");

  if (!ad) {
    return next(new ErrorHandler("Banner ad not found", 404));
  }

  res.json({
    success: true,
    message: "Banner ad fetched successfully",
    data: ad,
  });
});

// @desc    Create banner ad
// @route   POST /api/v1/banner-ads
// @access  Admin, Super Admin
export const createBannerAd = catchAsyncErrors(async (req, res, next) => {
  const {
    title,
    description,
    image,
    ctaText,
    property_id,
    priority,
    startDate,
    endDate,
    advertiserName,
    advertiserEmail,
    amountPaid,
    currency,
  } = req.body;

  // Validate required fields
  if (!title || !description || !image || !property_id) {
    return next(new ErrorHandler("Title, description, image, and property ID are required", 400));
  }

  // Validate property exists
  const property = await Property.findById(property_id);
  if (!property) {
    return next(new ErrorHandler("Property not found", 404));
  }

  // Validate dates (only if both are provided)
  if (endDate && startDate && new Date(endDate) <= new Date(startDate)) {
    return next(new ErrorHandler("End date must be after start date", 400));
  }

  // Convert empty string to null for endDate and clickLimit
  const finalEndDate = endDate === "" || endDate === null || endDate === undefined ? null : endDate;
  const finalClickLimit = req.body.clickLimit === "" || req.body.clickLimit === null || req.body.clickLimit === undefined ? null : Number(req.body.clickLimit);

  const ad = await BannerAd.create({
    title,
    description,
    image,
    ctaText: ctaText || "Book Now",
    property_id,
    priority: priority || 1,
    startDate: startDate || new Date(),
    endDate: finalEndDate, // null means no end date (runs indefinitely)
    advertiserName,
    advertiserEmail,
    amountPaid: amountPaid || 0,
    currency: currency || "PKR",
    clickCount: 0,
    clickLimit: finalClickLimit, // null means no click limit (unlimited)
    createdBy: req.user.id,
  });

  await ad.populate("property_id", "name address");
  await ad.populate("createdBy", "name email");

  res.status(201).json({
    success: true,
    message: "Banner ad created successfully",
    data: ad,
  });
});

// @desc    Update banner ad
// @route   PUT /api/v1/banner-ads/:id
// @access  Admin, Super Admin
export const updateBannerAd = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  const ad = await BannerAd.findById(id);
  if (!ad) {
    return next(new ErrorHandler("Banner ad not found", 404));
  }

  // Validate property if being updated
  if (updateData.property_id) {
    const property = await Property.findById(updateData.property_id);
    if (!property) {
      return next(new ErrorHandler("Property not found", 404));
    }
  }

  // Validate dates (only if both are provided)
  if (updateData.endDate && updateData.startDate) {
    if (new Date(updateData.endDate) <= new Date(updateData.startDate)) {
      return next(new ErrorHandler("End date must be after start date", 400));
    }
  } else if (updateData.endDate && ad.startDate) {
    if (new Date(updateData.endDate) <= new Date(ad.startDate)) {
      return next(new ErrorHandler("End date must be after start date", 400));
    }
  }

  // Handle endDate - convert empty string to null
  if (updateData.endDate === "" || updateData.endDate === null || updateData.endDate === undefined) {
    updateData.endDate = null; // null means no end date (runs indefinitely)
  }

  // Handle clickLimit - convert empty string to null
  if (updateData.clickLimit === "" || updateData.clickLimit === null || updateData.clickLimit === undefined) {
    updateData.clickLimit = null; // null means no click limit (unlimited)
  } else {
    updateData.clickLimit = Number(updateData.clickLimit);
  }

  Object.assign(ad, updateData);
  await ad.save();

  await ad.populate("property_id", "name address");
  await ad.populate("createdBy", "name email");

  res.json({
    success: true,
    message: "Banner ad updated successfully",
    data: ad,
  });
});

// Helper function to get client IP address
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

// Helper function to generate unique user identifier
const generateUserIdentifier = (req) => {
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"] || "";
  
  // Create a hash of IP + User-Agent for unique identification
  const hash = crypto
    .createHash("md5")
    .update(`${ip}-${userAgent}`)
    .digest("hex");
  
  return hash;
};

// @desc    Track click on banner ad
// @route   POST /api/v1/banner-ads/:id/click
// @access  Public
export const trackBannerAdClick = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const ad = await BannerAd.findById(id);
  if (!ad) {
    return next(new ErrorHandler("Banner ad not found", 404));
  }

  // Check if click limit is reached
  if (ad.clickLimit !== null && ad.clickLimit !== undefined) {
    if (ad.clickCount >= ad.clickLimit) {
      return res.json({
        success: false,
        message: "Click limit reached for this ad",
        data: { clickCount: ad.clickCount, clickLimit: ad.clickLimit, limitReached: true },
      });
    }
  }

  // Generate unique user identifier
  const userIdentifier = generateUserIdentifier(req);
  const ipAddress = getClientIp(req);
  const userAgent = req.headers["user-agent"] || "";

  // Check if this user has already clicked this ad
  const existingClick = await BannerAdClick.findOne({
    bannerAd_id: id,
    userIdentifier: userIdentifier,
  });

  if (existingClick) {
    // User has already clicked, don't increment count
    return res.json({
      success: true,
      message: "Click already recorded for this user",
      data: {
        clickCount: ad.clickCount,
        clickLimit: ad.clickLimit,
        limitReached: false,
        alreadyClicked: true,
      },
    });
  }

  // This is a new user click - record it and increment count
  try {
    // Create click record
    await BannerAdClick.create({
      bannerAd_id: id,
      userIdentifier: userIdentifier,
      ipAddress: ipAddress,
      userAgent: userAgent,
    });

    // Increment click count
    ad.clickCount += 1;
    await ad.save();

    // Check if limit is now reached after increment
    const limitReached = ad.clickLimit !== null && ad.clickLimit !== undefined && ad.clickCount >= ad.clickLimit;

    res.json({
      success: true,
      message: "Click tracked successfully",
      data: {
        clickCount: ad.clickCount,
        clickLimit: ad.clickLimit,
        limitReached,
        alreadyClicked: false,
      },
    });
  } catch (error) {
    // If duplicate key error (race condition), just return current count
    if (error.code === 11000) {
      await ad.populate();
      return res.json({
        success: true,
        message: "Click already recorded",
        data: {
          clickCount: ad.clickCount,
          clickLimit: ad.clickLimit,
          limitReached: false,
          alreadyClicked: true,
        },
      });
    }
    throw error;
  }
});

// @desc    Delete banner ad
// @route   DELETE /api/v1/banner-ads/:id
// @access  Admin, Super Admin
export const deleteBannerAd = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const ad = await BannerAd.findById(id);
  if (!ad) {
    return next(new ErrorHandler("Banner ad not found", 404));
  }

  // Delete all click records for this ad
  await BannerAdClick.deleteMany({ bannerAd_id: id });

  // Delete the banner ad
  await BannerAd.deleteOne({ _id: id });

  res.json({
    success: true,
    message: "Banner ad deleted successfully",
  });
});

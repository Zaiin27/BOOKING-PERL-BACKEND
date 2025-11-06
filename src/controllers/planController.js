import Plan from "../models/planModel.js";
import Subscription from "../models/subscriptionModel.js";
import User from "../models/userModel.js";
import Property from "../models/propertyModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import mongoose from "mongoose";

// @desc    Get all plans
// @route   GET /api/v1/plans
// @access  Public
export const getAllPlans = catchAsyncErrors(async (req, res, next) => {
  const { active } = req.query;
  
  const filter = {};
  if (active === "true") {
    filter.isActive = true;
  }

  const plans = await Plan.find(filter).sort({ price: 1 });

  res.json({
    success: true,
    message: "Plans fetched successfully",
    data: plans,
  });
});

// @desc    Get plan by ID or name
// @route   GET /api/v1/plans/:id
// @access  Public
export const getPlanById = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  let plan;
  if (mongoose.Types.ObjectId.isValid(id)) {
    plan = await Plan.findById(id);
  } else {
    plan = await Plan.findOne({ name: id });
  }

  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  res.json({
    success: true,
    message: "Plan fetched successfully",
    data: plan,
  });
});

// @desc    Create plan (Super Admin only)
// @route   POST /api/v1/plans
// @access  Super Admin
export const createPlan = catchAsyncErrors(async (req, res, next) => {
  const planData = req.body;

  const existingPlan = await Plan.findOne({ name: planData.name });
  if (existingPlan) {
    return next(new ErrorHandler("Plan with this name already exists", 400));
  }

  const plan = await Plan.create(planData);

  res.status(201).json({
    success: true,
    message: "Plan created successfully",
    data: plan,
  });
});

// @desc    Update plan (Super Admin only)
// @route   PUT /api/v1/plans/:id
// @access  Super Admin
export const updatePlan = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  let plan;
  if (mongoose.Types.ObjectId.isValid(id)) {
    plan = await Plan.findById(id);
  } else {
    plan = await Plan.findOne({ name: id });
  }

  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  // Prevent changing plan name if there are active subscriptions
  if (updateData.name && updateData.name !== plan.name) {
    const activeSubscriptions = await Subscription.countDocuments({
      planName: plan.name,
      status: "active",
    });
    if (activeSubscriptions > 0) {
      return next(
        new ErrorHandler(
          "Cannot change plan name while there are active subscriptions",
          400
        )
      );
    }
  }

  Object.assign(plan, updateData);
  await plan.save();

  res.json({
    success: true,
    message: "Plan updated successfully",
    data: plan,
  });
});

// @desc    Delete plan (Super Admin only)
// @route   DELETE /api/v1/plans/:id
// @access  Super Admin
export const deletePlan = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  let plan;
  if (mongoose.Types.ObjectId.isValid(id)) {
    plan = await Plan.findById(id);
  } else {
    plan = await Plan.findOne({ name: id });
  }

  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  // Check for active subscriptions
  const activeSubscriptions = await Subscription.countDocuments({
    planName: plan.name,
    status: "active",
  });

  if (activeSubscriptions > 0) {
    return next(
      new ErrorHandler(
        "Cannot delete plan with active subscriptions. Deactivate it instead.",
        400
      )
    );
  }

  await Plan.deleteOne({ _id: plan._id });

  res.json({
    success: true,
    message: "Plan deleted successfully",
  });
});

// @desc    Get user's current subscription
// @route   GET /api/v1/plans/my-subscription
// @access  Authenticated
export const getMySubscription = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id;

  const subscription = await Subscription.findOne({
    user_id: userId,
    status: "active",
  })
    .populate("plan_id")
    .sort({ createdAt: -1 });

  if (!subscription) {
    // Return free plan details
    const freePlan = await Plan.findOne({ name: "free" });
    return res.json({
      success: true,
      message: "No active subscription found",
      data: {
        subscription: null,
        plan: freePlan,
        isActive: false,
      },
    });
  }

  const isActive = subscription.isActive();

  res.json({
    success: true,
    message: "Subscription fetched successfully",
    data: {
      subscription,
      plan: subscription.plan_id,
      isActive,
    },
  });
});

// @desc    Get user's plan limits and usage
// @route   GET /api/v1/plans/limits
// @access  Authenticated
export const getMyLimits = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user.id;

  // Get user's active subscription
  const subscription = await Subscription.findOne({
    user_id: userId,
    status: "active",
  }).populate("plan_id");

  let plan;
  if (subscription && subscription.isActive()) {
    plan = subscription.plan_id;
  } else {
    plan = await Plan.findOne({ name: "free" });
  }

  // Get user's property count
  const propertyCount = await Property.countDocuments({ owner_id: userId });

  // Calculate photo usage
  const properties = await Property.find({ owner_id: userId }).select("photos");
  const totalPhotos = properties.reduce(
    (sum, prop) => sum + (prop.photos?.length || 0),
    0
  );
  const maxPhotosPerProperty = plan.maxPhotosPerProperty === -1 ? 999999 : plan.maxPhotosPerProperty;

  res.json({
    success: true,
    message: "Limits fetched successfully",
    data: {
      plan: {
        name: plan.name,
        displayName: plan.displayName,
        maxProperties: plan.maxProperties === -1 ? null : plan.maxProperties, // null = unlimited
        maxPhotosPerProperty: plan.maxPhotosPerProperty === -1 ? null : plan.maxPhotosPerProperty,
      },
      usage: {
        properties: propertyCount,
        photos: {
          perProperty: maxPhotosPerProperty,
          totalUsed: totalPhotos,
        },
      },
      canCreateProperty: plan.maxProperties === -1 || propertyCount < plan.maxProperties,
      canAddPhotos: (propertyId) => {
        const property = properties.find(p => p._id.toString() === propertyId);
        if (!property) return false;
        return plan.maxPhotosPerProperty === -1 || 
               (property.photos?.length || 0) < plan.maxPhotosPerProperty;
      },
    },
  });
});

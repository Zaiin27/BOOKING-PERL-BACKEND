import Subscription from "../models/subscriptionModel.js";
import Plan from "../models/planModel.js";
import User from "../models/userModel.js";
import Property from "../models/propertyModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import mongoose from "mongoose";

// @desc    Create subscription
// @route   POST /api/v1/subscriptions
// @access  Authenticated
export const createSubscription = catchAsyncErrors(async (req, res, next) => {
  const { planId, planName, duration = "monthly", paymentMethod = "manual", transactionId, customDetails } = req.body;
  const userId = req.user.id;

  // Get plan
  let plan;
  if (planId) {
    plan = await Plan.findById(planId);
  } else if (planName) {
    plan = await Plan.findOne({ name: planName });
  } else {
    return next(new ErrorHandler("Plan ID or plan name is required", 400));
  }

  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  // For free plan, auto-activate
  if (plan.name === "free") {
    // Cancel existing subscriptions and set to free
    await Subscription.updateMany(
      { user_id: userId, status: "active" },
      { status: "cancelled", cancelledAt: new Date() }
    );

    const freeSubscription = await Subscription.create({
      user_id: userId,
      plan_id: plan._id,
      planName: plan.name,
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000), // 100 years (lifetime)
      amountPaid: 0,
      currency: plan.currency,
      paymentStatus: "completed",
      paymentMethod: "free",
      autoRenew: false,
      ...(customDetails && { customDetails }),
    });

    // Update user with plan features
    const user = await User.findById(userId);
    if (user) {
      user.currentPlan = plan.name;
      user.subscriptionId = freeSubscription._id;
      
      // Override plan features in user account
      user.planFeatures = {
        maxProperties: plan.maxProperties || 1,
        maxPhotosPerProperty: plan.maxPhotosPerProperty || 3,
        features: {
          basicInfoDisplay: plan.features?.basicInfoDisplay ?? true,
          contactForm: plan.features?.contactForm ?? false,
          searchResults: plan.features?.searchResults ?? true,
          priorityVisibility: plan.features?.priorityVisibility ?? false,
          featuredPlacement: plan.features?.featuredPlacement ?? false,
          homepageFeatured: plan.features?.homepageFeatured ?? false,
          socialMediaPromotion: plan.features?.socialMediaPromotion ?? false,
          emailNotifications: plan.features?.emailNotifications ?? false,
          reviewManagement: plan.features?.reviewManagement ?? false,
          bookingManagement: plan.features?.bookingManagement ?? false,
          discountPromotions: plan.features?.discountPromotions ?? false,
          customBranding: plan.features?.customBranding ?? false,
          apiAccess: plan.features?.apiAccess ?? false,
          teamAccess: plan.features?.teamAccess ?? false,
          dedicatedAccountManager: plan.features?.dedicatedAccountManager ?? false,
        },
        analytics: {
          basic: plan.analytics?.basic ?? false,
          advanced: plan.analytics?.advanced ?? false,
        },
        badges: {
          verified: plan.badges?.verified ?? false,
          trustedHost: plan.badges?.trustedHost ?? false,
          premium: plan.badges?.premium ?? false,
        },
        searchPriority: plan.searchPriority || 1,
        planName: plan.name,
        planDisplayName: plan.displayName,
        planUpdatedAt: new Date(),
      };
      
      await user.save();
    }

    return res.status(201).json({
      success: true,
      message: "Free plan activated successfully",
      data: freeSubscription,
    });
  }

  // Check if user already has an active subscription
  const existingSubscription = await Subscription.findOne({
    user_id: userId,
    status: "active",
  });

  if (existingSubscription && existingSubscription.isActive()) {
    // Check if current subscription period has ended
    const now = new Date();
    const subscriptionEndDate = new Date(existingSubscription.endDate);
    
    // If subscription period hasn't ended, don't allow new subscription
    if (subscriptionEndDate > now) {
      const daysRemaining = Math.ceil((subscriptionEndDate - now) / (1000 * 60 * 60 * 24));
      return next(
        new ErrorHandler(
          `You already have an active subscription. Your current plan expires in ${daysRemaining} day(s). Please wait until the subscription period ends or cancel your current subscription first.`,
          400
        )
      );
    }
    
    // If subscription period has ended but status is still active, cancel it first
    if (subscriptionEndDate <= now) {
      existingSubscription.status = "expired";
      await existingSubscription.save();
    }
  }

  // Calculate end date based on duration
  const startDate = new Date();
  let endDate = new Date();
  if (duration === "monthly") {
    endDate.setMonth(endDate.getMonth() + 1);
  } else if (duration === "yearly") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else if (duration === "lifetime") {
    endDate.setFullYear(endDate.getFullYear() + 100);
  }

  // Create subscription
  const subscription = await Subscription.create({
    user_id: userId,
    plan_id: plan._id,
    planName: plan.name,
    status: "pending", // Will be activated after payment confirmation
    startDate,
    endDate,
    amountPaid: plan.price,
    currency: plan.currency,
    paymentStatus: "pending",
    paymentMethod,
    transactionId,
    autoRenew: duration !== "lifetime",
    ...(customDetails && { customDetails }),
  });

  res.status(201).json({
    success: true,
    message: "Subscription created. Please complete payment to activate.",
    data: subscription,
  });
});

// @desc    Activate subscription (after payment confirmation)
// @route   PATCH /api/v1/subscriptions/:id/activate
// @access  Authenticated (or webhook)
export const activateSubscription = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { transactionId } = req.body;

  const subscription = await Subscription.findById(id).populate("plan_id");
  if (!subscription) {
    return next(new ErrorHandler("Subscription not found", 404));
  }

  // Check permissions
  if (req.user && String(subscription.user_id) !== String(req.user.id)) {
    return next(new ErrorHandler("Unauthorized", 403));
  }

  // Cancel existing active subscriptions
  await Subscription.updateMany(
    {
      user_id: subscription.user_id,
      status: "active",
      _id: { $ne: subscription._id },
    },
    { status: "cancelled", cancelledAt: new Date() }
  );

  // Activate subscription
  subscription.status = "active";
  subscription.paymentStatus = "completed";
  if (transactionId) {
    subscription.transactionId = transactionId;
  }
  await subscription.save();

  // Get plan details
  const plan = subscription.plan_id;
  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  // Update user with plan features (for staff - override existing features)
  const user = await User.findById(subscription.user_id);
  if (user) {
    user.currentPlan = subscription.planName;
    user.subscriptionId = subscription._id;
    
    // Override plan features in user account (Future-proof structure)
    user.planFeatures = {
      maxProperties: plan.maxProperties || 1,
      maxPhotosPerProperty: plan.maxPhotosPerProperty || 3,
      features: {
        basicInfoDisplay: plan.features?.basicInfoDisplay ?? true,
        contactForm: plan.features?.contactForm ?? false,
        searchResults: plan.features?.searchResults ?? true,
        priorityVisibility: plan.features?.priorityVisibility ?? false,
        featuredPlacement: plan.features?.featuredPlacement ?? false,
        homepageFeatured: plan.features?.homepageFeatured ?? false,
        socialMediaPromotion: plan.features?.socialMediaPromotion ?? false,
        emailNotifications: plan.features?.emailNotifications ?? false,
        reviewManagement: plan.features?.reviewManagement ?? false,
        bookingManagement: plan.features?.bookingManagement ?? false,
        discountPromotions: plan.features?.discountPromotions ?? false,
        customBranding: plan.features?.customBranding ?? false,
        apiAccess: plan.features?.apiAccess ?? false,
        teamAccess: plan.features?.teamAccess ?? false,
        dedicatedAccountManager: plan.features?.dedicatedAccountManager ?? false,
      },
      analytics: {
        basic: plan.analytics?.basic ?? false,
        advanced: plan.analytics?.advanced ?? false,
      },
      badges: {
        verified: plan.badges?.verified ?? false,
        trustedHost: plan.badges?.trustedHost ?? false,
        premium: plan.badges?.premium ?? false,
      },
      searchPriority: plan.searchPriority || 1,
      planName: plan.name,
      planDisplayName: plan.displayName,
      planUpdatedAt: new Date(),
    };
    
    await user.save();
  }

  // Apply plan features to user's properties
  await applyPlanFeaturesToProperties(subscription.user_id, plan);

  res.json({
    success: true,
    message: "Subscription activated successfully. Plan features have been applied to your account.",
    data: subscription,
  });
});

// @desc    Update subscription
// @route   PATCH /api/v1/subscriptions/:id
// @access  Authenticated
export const updateSubscription = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { transactionId } = req.body;
  const userId = req.user.id;

  const subscription = await Subscription.findById(id);
  if (!subscription) {
    return next(new ErrorHandler("Subscription not found", 404));
  }

  // Check permissions
  if (String(subscription.user_id) !== String(userId)) {
    return next(new ErrorHandler("Unauthorized", 403));
  }

  // Update transaction ID if provided
  if (transactionId) {
    subscription.transactionId = transactionId;
    await subscription.save();
  }

  res.json({
    success: true,
    message: "Subscription updated successfully",
    data: subscription,
  });
});

// @desc    Cancel subscription
// @route   PATCH /api/v1/subscriptions/:id/cancel
// @access  Authenticated
export const cancelSubscription = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  const subscription = await Subscription.findById(id);
  if (!subscription) {
    return next(new ErrorHandler("Subscription not found", 404));
  }

  // Check permissions
  if (String(subscription.user_id) !== String(userId)) {
    return next(new ErrorHandler("Unauthorized", 403));
  }

  if (subscription.status === "cancelled") {
    return next(new ErrorHandler("Subscription already cancelled", 400));
  }

  subscription.status = "cancelled";
  subscription.cancelledAt = new Date();
  subscription.cancellationReason = reason;
  subscription.autoRenew = false;
  await subscription.save();

  // Update user to free plan
  const freePlan = await Plan.findOne({ name: "free" });
  if (freePlan) {
    // Create free subscription
    const freeSubscription = await Subscription.create({
      user_id: userId,
      plan_id: freePlan._id,
      planName: "free",
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
      amountPaid: 0,
      currency: "PKR",
      paymentStatus: "completed",
      paymentMethod: "free",
      autoRenew: false,
    });

    await User.findByIdAndUpdate(userId, {
      currentPlan: "free",
      subscriptionId: freeSubscription._id,
    });

    // Remove premium features from properties
    await removePlanFeaturesFromProperties(userId);
  }

  res.json({
    success: true,
    message: "Subscription cancelled successfully",
    data: subscription,
  });
});

// @desc    Upgrade subscription
// @route   POST /api/v1/subscriptions/:id/upgrade
// @access  Authenticated
export const upgradeSubscription = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { newPlanId, newPlanName } = req.body;
  const userId = req.user.id;

  const currentSubscription = await Subscription.findById(id).populate("plan_id");
  if (!currentSubscription) {
    return next(new ErrorHandler("Subscription not found", 404));
  }

  if (String(currentSubscription.user_id) !== String(userId)) {
    return next(new ErrorHandler("Unauthorized", 403));
  }

  // Get new plan
  let newPlan;
  if (newPlanId) {
    newPlan = await Plan.findById(newPlanId);
  } else if (newPlanName) {
    newPlan = await Plan.findOne({ name: newPlanName });
  } else {
    return next(new ErrorHandler("New plan ID or name is required", 400));
  }

  if (!newPlan) {
    return next(new ErrorHandler("New plan not found", 404));
  }

  // Check if it's actually an upgrade
  const planHierarchy = { free: 0, standard: 1, premium: 2, customized: 3 };
  const currentLevel = planHierarchy[currentSubscription.planName] || 0;
  const newLevel = planHierarchy[newPlan.name] || 0;

  if (newLevel <= currentLevel && newPlan.name !== "customized") {
    return next(new ErrorHandler("This is not an upgrade. Use change plan instead.", 400));
  }

  // Create new subscription
  const startDate = new Date();
  let endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // Default to monthly

  const newSubscription = await Subscription.create({
    user_id: userId,
    plan_id: newPlan._id,
    planName: newPlan.name,
    status: "pending",
    startDate,
    endDate,
    amountPaid: newPlan.price,
    currency: newPlan.currency,
    paymentStatus: "pending",
    paymentMethod: "manual",
  });

  // Cancel old subscription (but keep it for history)
  currentSubscription.status = "cancelled";
  currentSubscription.cancelledAt = new Date();
  currentSubscription.cancellationReason = "Upgraded to " + newPlan.displayName;
  await currentSubscription.save();

  res.status(201).json({
    success: true,
    message: "Upgrade initiated. Please complete payment to activate new plan.",
    data: {
      oldSubscription: currentSubscription,
      newSubscription,
    },
  });
});

// @desc    Get all subscriptions (Admin/Super Admin)
// @route   GET /api/v1/subscriptions
// @access  Admin, Super Admin
export const getAllSubscriptions = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 20, status, planName, userId } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (planName) filter.planName = planName;
  if (userId) filter.user_id = userId;

  const skip = (Number(page) - 1) * Number(limit);

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .populate("user_id", "name email")
      .populate("plan_id")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Subscription.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: "Subscriptions fetched successfully",
    data: {
      subscriptions,
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// Helper function to apply plan features to properties
const applyPlanFeaturesToProperties = async (userId, plan) => {
  const properties = await Property.find({ owner_id: userId });

  for (const property of properties) {
    // Apply badges
    if (plan.badges) {
      property.planFeatures = {
        verifiedBadge: plan.badges.verified || false,
        trustedHostBadge: plan.badges.trustedHost || false,
        premiumBadge: plan.badges.premium || false,
      };
    }

    // Apply priority/featured
    property.isPriority = plan.features?.priorityVisibility || false;
    property.isFeatured = plan.features?.featuredPlacement || false;
    property.searchPriority = plan.searchPriority || 1;

    await property.save();
  }
};

// Helper function to remove plan features from properties
const removePlanFeaturesFromProperties = async (userId) => {
  await Property.updateMany(
    { owner_id: userId },
    {
      $set: {
        isPriority: false,
        isFeatured: false,
        searchPriority: 1,
        "planFeatures.verifiedBadge": false,
        "planFeatures.trustedHostBadge": false,
        "planFeatures.premiumBadge": false,
      },
    }
  );
};

import Plan from "../models/planModel.js";
import mongoose from "mongoose";

export const seedDefaultPlans = async () => {
  try {
    const plans = [
      {
        name: "free",
        displayName: "Free Plan (Basic)",
        price: 0,
        currency: "PKR",
        duration: "lifetime",
        maxProperties: 1,
        maxPhotosPerProperty: 3,
        features: {
          basicInfoDisplay: true,
          contactForm: false,
          searchResults: true,
          priorityVisibility: false,
          featuredPlacement: false,
          homepageFeatured: false,
          socialMediaPromotion: false,
          emailNotifications: false,
          reviewManagement: false,
          bookingManagement: false,
          discountPromotions: false,
          customBranding: false,
          apiAccess: false,
          teamAccess: false,
          dedicatedAccountManager: false,
        },
        analytics: {
          basic: false,
          advanced: false,
        },
        badges: {
          verified: false,
          trustedHost: false,
          premium: false,
        },
        searchPriority: 1,
        description: "Perfect for getting started. List 1 property with basic information and up to 3 photos.",
      },
      {
        name: "standard",
        displayName: "Standard Plan",
        price: 3000,
        currency: "PKR",
        duration: "monthly",
        maxProperties: 1,
        maxPhotosPerProperty: 10,
        features: {
          basicInfoDisplay: true,
          contactForm: true,
          searchResults: true,
          priorityVisibility: true,
          featuredPlacement: false,
          homepageFeatured: false,
          socialMediaPromotion: false,
          emailNotifications: true,
          reviewManagement: false,
          bookingManagement: false,
          discountPromotions: false,
          customBranding: false,
          apiAccess: false,
          teamAccess: false,
          dedicatedAccountManager: false,
        },
        analytics: {
          basic: true,
          advanced: false,
        },
        badges: {
          verified: true,
          trustedHost: true,
          premium: false,
        },
        searchPriority: 3,
        description: "Boost your visibility with priority placement, up to 10 photos per property, and basic analytics.",
      },
      {
        name: "premium",
        displayName: "Premium Plan",
        price: 6000,
        currency: "PKR",
        duration: "monthly",
        maxProperties: 5,
        maxPhotosPerProperty: -1, // Unlimited
        features: {
          basicInfoDisplay: true,
          contactForm: true,
          searchResults: true,
          priorityVisibility: true,
          featuredPlacement: true,
          homepageFeatured: true,
          socialMediaPromotion: true,
          emailNotifications: true,
          reviewManagement: true,
          bookingManagement: true,
          discountPromotions: true,
          customBranding: false,
          apiAccess: false,
          teamAccess: false,
          dedicatedAccountManager: false,
        },
        analytics: {
          basic: true,
          advanced: true,
        },
        badges: {
          verified: true,
          trustedHost: true,
          premium: true,
        },
        searchPriority: 5,
        description: "Maximum exposure with featured placement, unlimited photos, advanced analytics, and premium features.",
      },
      {
        name: "customized",
        displayName: "Customized Plan",
        price: 0, // Custom pricing
        currency: "PKR",
        duration: "custom",
        maxProperties: -1, // Unlimited
        maxPhotosPerProperty: -1, // Unlimited
        features: {
          basicInfoDisplay: true,
          contactForm: true,
          searchResults: true,
          priorityVisibility: true,
          featuredPlacement: true,
          homepageFeatured: true,
          socialMediaPromotion: true,
          emailNotifications: true,
          reviewManagement: true,
          bookingManagement: true,
          discountPromotions: true,
          customBranding: true,
          apiAccess: true,
          teamAccess: true,
          dedicatedAccountManager: true,
        },
        analytics: {
          basic: true,
          advanced: true,
        },
        badges: {
          verified: true,
          trustedHost: true,
          premium: true,
        },
        searchPriority: 10,
        description: "Fully customized solution with unlimited properties, custom branding, API access, and dedicated account manager.",
      },
    ];

    for (const planData of plans) {
      const existingPlan = await Plan.findOne({ name: planData.name });
      if (!existingPlan) {
        await Plan.create(planData);
        console.log(`✅ Created plan: ${planData.displayName}`);
      } else {
        // Update existing plan with new features if needed
        await Plan.findOneAndUpdate({ name: planData.name }, planData, { new: true });
        console.log(`🔄 Updated plan: ${planData.displayName}`);
      }
    }

    console.log("✅ Default plans seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding plans:", error);
    throw error;
  }
};

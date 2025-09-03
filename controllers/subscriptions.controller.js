import permissions from "../config/permissions.js";
import { PRODUCT_MAPPINGS } from "../constants/productMappings.js";
import User from "../database/models/User.js";

const formatPlanName = (planId) => {
  return planId
    .replace(/\+(\d+)gb/i, " + $1GB Storage")
    .replace(/\+(\d+)/, " + $1 Institution")
    .replace(/([A-Z])/g, " $1")
    .trim();
};

const isBusinessOwnerPlan = (planId) => {
  const businessOwnerPlans = [
    "Founder",
    "Founder+1",
    "Entrepreneur",
    "Entrepreneur+1",
    "Entrepreneur+2",
    "Tycoon",
    "Tycoon+100gb",
  ];
  return businessOwnerPlans.includes(planId);
};

// Get Product ID for a plan on a specific platform
const getProductIdForPlan = (planId, platform) => {
  // Map NODE_ENV to productMappings keys
  const nodeEnv = process.env.NODE_ENV || "dev";
  const env = nodeEnv === "development" ? "dev" : nodeEnv;
  const mappings = PRODUCT_MAPPINGS[env]?.[platform];

  console.log(
    `🔍 getProductIdForPlan("${planId}", "${platform}") - env: ${env}`
  );
  console.log(`🔍 Available mappings:`, mappings);

  if (!mappings) {
    console.log(`❌ No mappings found for env: ${env}, platform: ${platform}`);
    return null;
  }

  // Find the productId that maps to this planId
  for (const [productId, mappedPlanId] of Object.entries(mappings)) {
    console.log(
      `🔍 Checking: "${productId}" → "${mappedPlanId}" vs "${planId}"`
    );
    if (mappedPlanId === planId) {
      console.log(`✅ Found match: "${planId}" → "${productId}"`);
      return productId;
    }
  }

  console.log(`❌ No match found for planId: "${planId}"`);
  return null;
};

const generateFeaturesFromLimits = (limits) => {
  const features = [];

  // Financial Institutions
  if (limits.accounts_max === -1) {
    features.push("Unlimited Financial Institutions");
  } else {
    features.push(
      `Up to ${limits.accounts_max} Financial Institution${
        limits.accounts_max > 1 ? "s" : ""
      }`
    );
  }

  // Storage
  if (limits.storage_max_gb === -1) {
    features.push("Unlimited Storage");
  } else {
    features.push(`${limits.storage_max_gb}GB Storage`);
  }

  // Trips
  if (limits.create_trips_max === -1) {
    features.push("Unlimited Trips");
  } else if (limits.create_trips_max > 0) {
    features.push(
      `Up to ${limits.create_trips_max} Trip${
        limits.create_trips_max > 1 ? "s" : ""
      } per month`
    );
  }

  // Businesses
  if (limits.businesses_max === -1) {
    features.push("Unlimited Business Profiles");
  } else if (limits.businesses_max > 0) {
    features.push(
      `Up to ${limits.businesses_max} Business Profile${
        limits.businesses_max > 1 ? "s" : ""
      }`
    );
  }

  // Receipts
  if (limits.receipts_max === -1) {
    features.push("Unlimited Receipts (subject to storage limits)");
  } else {
    features.push(
      `Up to ${limits.receipts_max} Receipt${
        limits.receipts_max > 1 ? "s" : ""
      }`
    );
  }

  // Documents
  if (limits.docs_max === -1) {
    features.push("Unlimited Documents (subject to storage limits)");
  } else {
    features.push(
      `Up to ${limits.docs_max} Document${limits.docs_max > 1 ? "s" : ""}`
    );
  }

  return features;
};

const getAvailablePlans = async (req, res) => {
  try {
    const uid = req.user?.uid;
    const platform = req.headers["x-platform"] || "ios"; // Default to iOS

    // Get current user plan
    let currentUserPlan = "Free"; // Default
    if (uid) {
      try {
        const user = await User.findOne({ uid });
        currentUserPlan = user?.account_type || "Free";
      } catch (error) {
        console.warn("Could not fetch user plan:", error.message);
      }
    }

    // Admin/internal roles that should NOT be shown to users for purchase
    const adminRoles = ["CFO", "CFO Management", "Admin", "Super Admin"];

    // Plan hierarchy for proper ordering (base plans + add-ons)
    const planOrder = [
      "Free",
      "Personal",
      "Personal+1",
      "Founder",
      "Founder+1",
      "Entrepreneur",
      "Entrepreneur+1",
      "Entrepreneur+2",
      "Tycoon",
      "Tycoon+100gb",
    ];

    // Filter out admin roles and create plan objects
    const allPlans = Object.keys(permissions)
      .filter((planId) => !adminRoles.includes(planId))
      .map((planId) => ({
        id: planId,
        name: formatPlanName(planId),
        limits: permissions[planId],
        business_owner_allowed: isBusinessOwnerPlan(planId),
        features: generateFeaturesFromLimits(permissions[planId]),
        pricing: {
          monthly: permissions[planId].pricing?.monthly || "TBD",
          annual: permissions[planId].pricing?.annual || "TBD",
          sku: getProductIdForPlan(planId, platform),
        },
        isCurrentPlan: planId === currentUserPlan,
        available: true,
      }));

    // Filter plans based on user role if authenticated
    let filteredPlans = allPlans;
    if (uid && req.user?.role === "business_owner") {
      filteredPlans = allPlans.filter((plan) => plan.business_owner_allowed);
    }

    // Sort plans according to hierarchy
    const sortedPlans = filteredPlans.sort((a, b) => {
      const indexA = planOrder.indexOf(a.id);
      const indexB = planOrder.indexOf(b.id);

      // If plan not in order array, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    });

    res.status(200).json({
      currentUserPlan,
      plans: sortedPlans,
    });
  } catch (error) {
    console.error("Error getting available plans:", error);
    res.status(500).json({ message: error.message });
  }
};

const subscriptionsController = {
  getAvailablePlans,
};

export default subscriptionsController;

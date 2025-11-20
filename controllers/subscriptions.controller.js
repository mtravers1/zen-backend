import permissions from "../config/permissions.js";
import { PRODUCT_MAPPINGS } from "../constants/productMappings.js";
import { normalizeEnvironment } from "../utils/environment.js";

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
const getProductIdForPlan = (planId, platform, billingPeriod = "monthly") => {
  // Get normalized environment from NODE_ENV
  const env = normalizeEnvironment();
  const mappings = PRODUCT_MAPPINGS[env]?.[platform];

  if (!mappings) {
    return null;
  }

  // For iOS:
  //   - Monthly: no suffix (base SKU)
  //   - Yearly: .yearly suffix
  // For Android: return the base SKU (no suffix, uses base plans)
  if (platform === "ios") {
    if (billingPeriod === "yearly") {
      // Search for SKUs with .yearly suffix
      for (const [productId, mappedPlanId] of Object.entries(mappings)) {
        if (mappedPlanId === planId && productId.endsWith(".yearly")) {
          return productId;
        }
      }
    } else {
      // Monthly: search for SKUs WITHOUT .yearly suffix
      for (const [productId, mappedPlanId] of Object.entries(mappings)) {
        if (mappedPlanId === planId && !productId.endsWith(".yearly")) {
          return productId;
        }
      }
    }
  } else {
    // Android: return first match (base SKU)
    for (const [productId, mappedPlanId] of Object.entries(mappings)) {
      if (mappedPlanId === planId) {
        return productId;
      }
    }
  }

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
      }`,
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
      } per month`,
    );
  }

  // Businesses
  if (limits.businesses_max === -1) {
    features.push("Unlimited Business Profiles");
  } else if (limits.businesses_max > 0) {
    features.push(
      `Up to ${limits.businesses_max} Business Profile${
        limits.businesses_max > 1 ? "s" : ""
      }`,
    );
  }

  // Receipts
  if (limits.receipts_max === -1) {
    features.push("Unlimited Receipts (subject to storage limits)");
  } else {
    features.push(
      `Up to ${limits.receipts_max} Receipt${
        limits.receipts_max > 1 ? "s" : ""
      }`,
    );
  }

  // Documents
  if (limits.docs_max === -1) {
    features.push("Unlimited Documents (subject to storage limits)");
  } else {
    features.push(
      `Up to ${limits.docs_max} Document${limits.docs_max > 1 ? "s" : ""}`,
    );
  }

  return features;
};

const getAvailablePlans = async (req, res) => {
  try {
    console.log("🚀 [SUBSCRIPTIONS] getAvailablePlans called");
    const platform = req.headers["x-platform"] || "ios"; // Default to iOS
    console.log("🚀 [SUBSCRIPTIONS] platform:", platform);

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
          sku: getProductIdForPlan(planId, platform, "monthly"),
          skuAnnual:
            platform === "ios"
              ? getProductIdForPlan(planId, platform, "yearly")
              : null,
        },
        available: true,
      }));

    // No role-based filtering - frontend handles plan eligibility
    let filteredPlans = allPlans;

    // Sort plans according to hierarchy
    const sortedPlans = filteredPlans.sort((a, b) => {
      const indexA = planOrder.indexOf(a.id);
      const indexB = planOrder.indexOf(b.id);

      // If plan not in order array, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    });

    console.log(
      "🚀 [SUBSCRIPTIONS] Response ready - plans count:",
      sortedPlans.length,
    );
    console.log("🚀 [SUBSCRIPTIONS] First plan example:", sortedPlans[0]);

    res.status(200).json({
      plans: sortedPlans,
    });
  } catch (error) {
    console.error("🚀 [SUBSCRIPTIONS] ERROR in getAvailablePlans:", error);
    console.error("Error getting available plans:", error);
    res.status(500).json({ message: error.message });
  }
};

const subscriptionsController = {
  getAvailablePlans,
};

export default subscriptionsController;

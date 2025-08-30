/**
 * Upgrade Response Service
 *
 * Standardized responses for upgrade triggers that feed frontend popups
 * Based on features-workflow.md requirements
 */

// Upgrade Popup 1: Business Owner + Free Plan
const businessOwnerUpgradeRequired = (user) => {
  return {
    success: false,
    error: "BUSINESS_OWNER_UPGRADE_REQUIRED",
    limit_type: "business_features",
    upgrade_required: true,
    popup_data: {
      title: "Business Features Require Upgrade",
      message:
        "Looks like you've reached the limit of your current plan. To keep things running smoothly and unlock more features, consider upgrading your subscription.",
      current_plan: user.account_type || "Free",
      popup_type: "business_owner",
      action_blocked: "create_business_profile",
    },
  };
};

// Upgrade Popup 2: Institution Limit Exceeded
const institutionLimitExceeded = (user, currentUsage, planLimit) => {
  return {
    success: false,
    error: "LIMIT_EXCEEDED",
    limit_type: "institutions",
    current_usage: currentUsage,
    plan_limit: planLimit,
    upgrade_required: true,
    popup_data: {
      title: "You reached your institution limit",
      message: `Looks like you've reached the limit of your current plan. To keep things running smoothly and unlock more features, consider upgrading your subscription.`,
      current_plan: user.account_type || "Free",
      popup_type: "institution_limit",
      action_blocked: "add_institution",
    },
  };
};

// Upgrade Popup 3: Storage Limit Exceeded
const storageLimitExceeded = (user, currentUsage, planLimit) => {
  return {
    success: false,
    error: "LIMIT_EXCEEDED",
    limit_type: "storage",
    current_usage: Math.round(currentUsage * 100) / 100, // Round to 2 decimals
    plan_limit: planLimit,
    upgrade_required: true,
    popup_data: {
      title: "You reached your storage limit",
      message: `Upgrade your Plan to add up to 5GB per profile.`,
      current_plan: user.account_type || "Free",
      popup_type: "storage_limit",
      action_blocked: "upload_file",
    },
  };
};

// Upgrade Popup 4: Trip Limit Exceeded (Free Plan Only)
const tripLimitExceeded = (user, currentUsage, planLimit) => {
  return {
    success: false,
    error: "LIMIT_EXCEEDED",
    limit_type: "trips",
    current_usage: currentUsage,
    plan_limit: planLimit,
    upgrade_required: true,
    popup_data: {
      title: "Monthly Trip Limit Reached",
      message: `You've reached your limit of ${planLimit} trips this month`,
      current_plan: "Free",
      popup_type: "trip_limit",
      action_blocked: "create_trip",
    },
  };
};

// Upgrade Popup 5: Business Limit Exceeded
const businessLimitExceeded = (user, currentUsage, planLimit) => {
  return {
    success: false,
    error: "LIMIT_EXCEEDED",
    limit_type: "businesses",
    current_usage: currentUsage,
    plan_limit: planLimit,
    upgrade_required: true,
    popup_data: {
      title: "Business Limit Reached",
      message: `You've reached your limit of ${planLimit} businesses`,
      current_plan: user.account_type || "Free",
      popup_type: "business_limit",
      action_blocked: "create_business",
    },
  };
};

// Generic limit exceeded response
const limitExceeded = (
  user,
  limitType,
  currentUsage,
  planLimit,
  actionBlocked
) => {
  return {
    success: false,
    error: "LIMIT_EXCEEDED",
    limit_type: limitType,
    current_usage: currentUsage,
    plan_limit: planLimit,
    upgrade_required: true,
    popup_data: {
      title: "Upgrade Required",
      message: `You've reached your ${limitType} limit`,
      current_plan: user.account_type || "Free",
      action_blocked: actionBlocked,
    },
  };
};

// Success response when action is allowed
const actionAllowed = () => {
  return {
    success: true,
    upgrade_required: false,
  };
};

// Generic error response
const genericError = (message) => {
  return {
    success: false,
    error: "GENERIC_ERROR",
    message: message,
  };
};

const upgradeResponseService = {
  businessOwnerUpgradeRequired,
  institutionLimitExceeded,
  storageLimitExceeded,
  tripLimitExceeded,
  businessLimitExceeded,
  limitExceeded,
  actionAllowed,
  genericError,
};

export default upgradeResponseService;

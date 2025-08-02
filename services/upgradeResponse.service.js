/**
 * Upgrade Response Service
 * 
 * Standardized responses for upgrade triggers that feed frontend popups
 * Based on features-workflow.md requirements
 */

import { PLAN_HIERARCHY } from '../constants/productMappings.js';
import permissions from '../config/permissions.js';

const getNextPlan = (currentPlan) => {
  const currentIndex = PLAN_HIERARCHY.indexOf(currentPlan);
  if (currentIndex !== -1 && currentIndex < PLAN_HIERARCHY.length - 1) {
    return PLAN_HIERARCHY[currentIndex + 1];
  }
  return null;
};

const getAvailableUpgrades = (currentPlan) => {
  const currentIndex = PLAN_HIERARCHY.indexOf(currentPlan);
  if (currentIndex !== -1) {
    return PLAN_HIERARCHY.slice(currentIndex + 1);
  }
  return [];
};

const getPlanLimits = (planName) => {
  return permissions[planName] || {};
};

// Upgrade Popup 1: Business Owner + Free Plan
const businessOwnerUpgradeRequired = (user) => {
  return {
    success: false,
    error: "BUSINESS_OWNER_UPGRADE_REQUIRED",
    limit_type: "business_features",
    upgrade_required: true,
    popup_data: {
      title: "Business Features Require Upgrade",
      message: "To add business profiles and features, you need to upgrade from Free plan",
      current_plan: user.rolePermission || "Free",
      suggested_plans: ["Founder", "Entrepreneur", "Tycoon"],
      popup_type: "business_owner",
      action_blocked: "create_business_profile"
    }
  };
};

// Upgrade Popup 2: Institution Limit Exceeded
const institutionLimitExceeded = (user, currentUsage, planLimit) => {
  const nextPlan = getNextPlan(user.rolePermission);
  
  return {
    success: false,
    error: "LIMIT_EXCEEDED",
    limit_type: "institutions",
    current_usage: currentUsage,
    plan_limit: planLimit,
    upgrade_required: true,
    popup_data: {
      title: "Institution Limit Reached",
      message: `You've reached your limit of ${planLimit} financial institutions`,
      current_plan: user.rolePermission || "Free",
      suggested_plans: nextPlan ? [nextPlan] : getAvailableUpgrades(user.rolePermission),
      popup_type: "institution_limit",
      action_blocked: "add_institution"
    }
  };
};

// Upgrade Popup 3: Storage Limit Exceeded
const storageLimitExceeded = (user, currentUsage, planLimit) => {
  const nextPlan = getNextPlan(user.rolePermission);
  
  return {
    success: false,
    error: "LIMIT_EXCEEDED",
    limit_type: "storage",
    current_usage: Math.round(currentUsage * 100) / 100, // Round to 2 decimals
    plan_limit: planLimit,
    upgrade_required: true,
    popup_data: {
      title: "Storage Limit Reached",
      message: `You've reached your storage limit of ${planLimit}GB`,
      current_plan: user.rolePermission || "Free",
      suggested_plans: nextPlan ? [nextPlan] : getAvailableUpgrades(user.rolePermission),
      popup_type: "storage_limit",
      action_blocked: "upload_file"
    }
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
      suggested_plans: ["Personal", "Founder", "Entrepreneur", "Tycoon"],
      popup_type: "trip_limit",
      action_blocked: "create_trip"
    }
  };
};

// Generic limit exceeded response
const limitExceeded = (user, limitType, currentUsage, planLimit, actionBlocked) => {
  const nextPlan = getNextPlan(user.rolePermission);
  
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
      current_plan: user.rolePermission || "Free",
      suggested_plans: nextPlan ? [nextPlan] : getAvailableUpgrades(user.rolePermission),
      action_blocked: actionBlocked
    }
  };
};

// Success response when action is allowed
const actionAllowed = () => {
  return {
    success: true,
    upgrade_required: false
  };
};

// Get upgrade information for a specific plan
const getUpgradeInfo = (currentPlan, targetPlan) => {
  const currentLimits = getPlanLimits(currentPlan);
  const targetLimits = getPlanLimits(targetPlan);
  
  return {
    current_plan: currentPlan,
    target_plan: targetPlan,
    current_limits: currentLimits,
    target_limits: targetLimits,
    upgrade_benefits: {
      institutions: targetLimits.accounts_max === -1 ? "Unlimited" : targetLimits.accounts_max,
      storage: targetLimits.storage_max_gb === -1 ? "Unlimited" : `${targetLimits.storage_max_gb}GB`,
      trips: targetLimits.create_trips_max === -1 ? "Unlimited" : targetLimits.create_trips_max,
      businesses: targetLimits.businesses_max === -1 ? "Unlimited" : targetLimits.businesses_max
    }
  };
};

const upgradeResponseService = {
  businessOwnerUpgradeRequired,
  institutionLimitExceeded,
  storageLimitExceeded,
  tripLimitExceeded,
  limitExceeded,
  actionAllowed,
  getUpgradeInfo,
  getAvailableUpgrades,
  getPlanLimits
};

export default upgradeResponseService;
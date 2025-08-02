/**
 * Product Mapping Service
 * Maps Apple Store & Google Play Store product IDs to internal plan names by environment
 * Used for subscription upgrade system with dual-platform support
 */

import { PRODUCT_MAPPINGS, PLAN_HIERARCHY, PLAN_TYPES } from '../constants/productMappings.js';

const getProductMapping = (environment = 'dev', platform = 'ios') => {
  if (!PRODUCT_MAPPINGS[environment]) {
    console.warn(`Unknown environment: ${environment}, defaulting to dev`);
    environment = 'dev';
  }
  
  if (!PRODUCT_MAPPINGS[environment][platform]) {
    console.warn(`Unknown platform: ${platform}, defaulting to ios`);
    platform = 'ios';
  }
  
  return PRODUCT_MAPPINGS[environment][platform];
};

const getPlanFromProductId = (productId, environment = 'dev', platform = 'ios') => {
  const mapping = getProductMapping(environment, platform);
  return mapping[productId] || null;
};

const getProductIdFromPlan = (planName, environment = 'dev', platform = 'ios') => {
  const mapping = getProductMapping(environment, platform);
  const productId = Object.keys(mapping).find(key => mapping[key] === planName);
  return productId || null;
};

const getAllPlans = () => {
  return PLAN_HIERARCHY.slice(1); // Exclude 'Free' as it's not purchasable
};

const getBasePlans = () => {
  return PLAN_TYPES.BASE_PLANS.slice(1); // Exclude 'Free'
};

const getAddOns = () => {
  return PLAN_TYPES.ADD_ONS;
};

const isPlanType = (planName, type) => {
  return PLAN_TYPES[type] && PLAN_TYPES[type].includes(planName);
};

const getPlanHierarchyIndex = (planName) => {
  return PLAN_HIERARCHY.indexOf(planName);
};

const isUpgrade = (currentPlan, targetPlan) => {
  const currentIndex = getPlanHierarchyIndex(currentPlan);
  const targetIndex = getPlanHierarchyIndex(targetPlan);
  return targetIndex > currentIndex;
};

const getAvailableUpgrades = (currentPlan) => {
  const currentIndex = getPlanHierarchyIndex(currentPlan);
  return PLAN_HIERARCHY.slice(currentIndex + 1);
};

const validateProductId = (productId, environment = 'dev', platform = 'ios') => {
  const mapping = getProductMapping(environment, platform);
  return productId in mapping;
};

const productMappingService = {
  getProductMapping,
  getPlanFromProductId,
  getProductIdFromPlan,
  getAllPlans,
  getBasePlans,
  getAddOns,
  isPlanType,
  getPlanHierarchyIndex,
  isUpgrade,
  getAvailableUpgrades,
  validateProductId,
  PLAN_HIERARCHY
};

export default productMappingService;
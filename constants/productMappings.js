/**
 * Product Mappings Configuration
 * Maps Apple Store & Google Play Store product IDs to internal plan names by environment
 *
 * DUAL-PLATFORM SUPPORT:
 * - iOS: Apple Store product IDs (com.zentavos.*)
 * - Android: Google Play Store product IDs (com.zentavos.zentavosdev.*)
 *
 * NOTE: When adding new plans or add-ons:
 * 1. Add the product ID mapping for BOTH platforms
 * 2. Update PLAN_HIERARCHY if it's a new tier
 * 3. Update PLAN_TYPES if it's a new category
 */

export const PRODUCT_MAPPINGS = {
  dev: {
    ios: {
      // Base subscription plans (EXIST in Apple Store)
      "com.zentavos.personal": "Personal",
      "com.zentavos.founder": "Founder",
      "com.zentavos.entrepreneur": "Entrepreneur",
      "com.zentavos.tycoon": "Tycoon",

      // Add-on plans (EXIST in Apple Store Connect)
      zentavos_dev_personal_1_institution: "Personal+1",
      zentavos_dev_founder_1_institution: "Founder+1",
      zentavos_dev_entrepreneur_1_institution: "Entrepreneur+1",
      zentavos_dev_entrepreneur_2_institution: "Entrepreneur+2",
      zentavos_dev_tycoon_100gb: "Tycoon+100gb",
    },
    android: {
      // Base subscription plans - NEED to be created in Google Play Store
      "com.zentavos.zentavosdev.personal": "Personal",
      "com.zentavos.zentavosdev.founder": "Founder",
      "com.zentavos.zentavosdev.entrepreneur": "Entrepreneur",
      "com.zentavos.zentavosdev.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Google Play Store
      "com.zentavos.zentavosdev.personal.plus1": "Personal+1",
      "com.zentavos.zentavosdev.founder.plus1": "Founder+1",
      "com.zentavos.zentavosdev.entrepreneur.p1": "Entrepreneur+1",
      "com.zentavos.zentavosdev.entrepreneur.p2": "Entrepreneur+2",
      "com.zentavos.zentavosdev.tycoon.100gb": "Tycoon+100gb",
      // Tycoon is unlimited, no add-ons needed
    },
  },
  stg: {
    ios: {
      // Base subscription plans (EXIST in Apple Store)
      "com.zentavos.stg.personal": "Personal",
      "com.zentavos.stg.founder": "Founder",
      "com.zentavos.stg.entrepreneur": "Entrepreneur",
      "com.zentavos.stg.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Apple Store
      zentavos_stg_personal_1_institution: "Personal+1",
      zentavos_stg_founder_1_institution: "Founder+1",
      zentavos_stg_entrepreneur_1_institution: "Entrepreneur+1",
      zentavos_stg_entrepreneur_2_institution: "Entrepreneur+2",
      zentavos_stg_tycoon_100gb: "Tycoon+100gb",
    },
    android: {
      // Base subscription plans - NEED to be created in Google Play Store
      "com.zentavos.stg.personal": "Personal",
      "com.zentavos.stg.founder": "Founder",
      "com.zentavos.stg.entrepreneur": "Entrepreneur",
      "com.zentavos.stg.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Google Play Store
      "com.zentavos.stg.personal.plus1": "Personal+1",
      "com.zentavos.stg.founder.plus1": "Founder+1",
      "com.zentavos.stg.entrepreneur.p1": "Entrepreneur+1",
      "com.zentavos.stg.entrepreneur.p2": "Entrepreneur+2",
      "com.zentavos.stg.tycoon.100gb": "Tycoon+100gb",
    },
  },
  prod: {
    ios: {
      // Base subscription plans (EXIST in Apple Store)
      "com.zentavos.sub.personal": "Personal",
      "com.zentavos.sub.founder": "Founder",
      "com.zentavos.sub.entrepreneur": "Entrepreneur",
      "com.zentavos.sub.tycoon": "Tycoon",

      zentavos_prod_personal_1_institution: "Personal+1",
      zentavos_prod_founder_1_institution: "Founder+1",
      zentavos_prod_entrepreneur_1_institution: "Entrepreneur+1",
      zentavos_prod_entrepreneur_2_institution: "Entrepreneur+2",
      zentavos_prod_tycoon_100gb: "Tycoon+100gb",
    },
    android: {
      // Base subscription plans - NEED to be created in Google Play Store
      "com.zentavos.mobile.personal": "Personal",
      "com.zentavos.mobile.founder": "Founder",
      "com.zentavos.mobile.entrepreneur": "Entrepreneur",
      "com.zentavos.mobile.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Google Play Store
      "com.zentavos.mobile.personal.plus1": "Personal+1",
      "com.zentavos.mobile.founder.plus1": "Founder+1",
      "com.zentavos.mobile.entrepreneur.p1": "Entrepreneur+1",
      "com.zentavos.mobile.entrepreneur.p2": "Entrepreneur+2",
      "com.zentavos.mobile.tycoon.100gb": "Tycoon+100gb",
    },
  },
};

// Plan hierarchy for base subscription plans (excludes add-ons)
export const PLAN_HIERARCHY = [
  "Free",
  "Personal",
  "Founder",
  "Entrepreneur",
  "Tycoon",
];

// Plan types for categorization
export const PLAN_TYPES = {
  BASE_PLANS: ["Free", "Personal", "Founder", "Entrepreneur", "Tycoon"],
  ADD_ONS: [], // Future add-ons like ['ExtraStorage', 'PremiumSupport']
};

// Store configurations
export const APPLE_STORE_CONFIG = {
  sharedSecret: process.env.APPLE_SHARED_SECRET,
  issuerId: process.env.ISSUER_ID,
  sandboxTester: {
    email: process.env.APPLE_SANDBOX_EMAIL,
    password: process.env.APPLE_SANDBOX_PASSWORD,
  },
};

export const GOOGLE_PLAY_CONFIG = {
  // To be configured when Google Play products are created
  packageName: "com.zentavos.zentavosdev",
  serviceAccountKey: null, // TBD - JSON key file path
};

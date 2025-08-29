/**
 * Product Mappings Configuration
 * Maps Apple Store & Google Play Store product IDs to internal plan names by environment
 *
 * DUAL-PLATFORM SUPPORT:
 * - iOS: Apple Store product IDs (com.zentavos.*)
 * - Android: Google Play Store product IDs (com.zentavos.android.*)
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
      "zentavos_dev_personal_1_institution": "Personal+1",
      "zentavos_dev_founder_1_institution": "Founder+1", 
      "zentavos_dev_entrepreneur_1_institution": "Entrepreneur+1",
      "zentavos_dev_entrepreneur_2_institution": "Entrepreneur+2",
      "zentavos_dev_tycoon_100gb": "Tycoon+100gb",
    },
    android: {
      // Base subscription plans - NEED to be created in Google Play Store
      "com.zentavos.android.personal": "Personal",
      "com.zentavos.android.founder": "Founder",
      "com.zentavos.android.entrepreneur": "Entrepreneur",
      "com.zentavos.android.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Google Play Store
      "com.zentavos.android.personal.plus1": "Personal+1",
      "com.zentavos.android.founder.plus1": "Founder+1",
      "com.zentavos.android.entrepreneur.plus1": "Entrepreneur+1",
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
      "com.zentavos.stg.personal.plus1": "Personal+1",
      "com.zentavos.stg.founder.plus1": "Founder+1",
      "com.zentavos.stg.entrepreneur.plus1": "Entrepreneur+1",
    },
    android: {
      // Base subscription plans - NEED to be created in Google Play Store
      "com.zentavos.stg.android.personal": "Personal",
      "com.zentavos.stg.android.founder": "Founder",
      "com.zentavos.stg.android.entrepreneur": "Entrepreneur",
      "com.zentavos.stg.android.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Google Play Store
      "com.zentavos.stg.android.personal.plus1": "Personal+1",
      "com.zentavos.stg.android.founder.plus1": "Founder+1",
      "com.zentavos.stg.android.entrepreneur.plus1": "Entrepreneur+1",
    },
  },
  prod: {
    ios: {
      // Base subscription plans (EXIST in Apple Store)
      "com.zentavos.sub.personal": "Personal",
      "com.zentavos.sub.founder": "Founder",
      "com.zentavos.sub.entrepreneur": "Entrepreneur",
      "com.zentavos.sub.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Apple Store
      "com.zentavos.sub.personal.plus1": "Personal+1",
      "com.zentavos.sub.founder.plus1": "Founder+1",
      "com.zentavos.sub.entrepreneur.plus1": "Entrepreneur+1",
    },
    android: {
      // Base subscription plans - NEED to be created in Google Play Store
      "com.zentavos.sub.android.personal": "Personal",
      "com.zentavos.sub.android.founder": "Founder",
      "com.zentavos.sub.android.entrepreneur": "Entrepreneur",
      "com.zentavos.sub.android.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra) - NEED to be created in Google Play Store
      "com.zentavos.sub.android.personal.plus1": "Personal+1",
      "com.zentavos.sub.android.founder.plus1": "Founder+1",
      "com.zentavos.sub.android.entrepreneur.plus1": "Entrepreneur+1",
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

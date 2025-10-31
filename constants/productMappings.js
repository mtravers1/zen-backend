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
      // Base subscription plans - Monthly (no suffix)
      "com.zentavos.dev.personal": "Personal",
      "com.zentavos.dev.founder": "Founder",
      "com.zentavos.dev.entrepreneur": "Entrepreneur",
      "com.zentavos.dev.tycoon": "Tycoon",

      // Base subscription plans - Yearly (.yearly suffix)
      "com.zentavos.dev.personal.yearly": "Personal",
      "com.zentavos.dev.founder.yearly": "Founder",
      "com.zentavos.dev.entrepreneur.yearly": "Entrepreneur",
      "com.zentavos.dev.tycoon.yearly": "Tycoon",

      // Add-on plans - Monthly (no suffix)
      "com.zentavos.dev.personal.1.institution": "Personal+1",
      "com.zentavos.dev.founder.1.institution": "Founder+1",
      "com.zentavos.dev.entrepreneur.1.institution": "Entrepreneur+1",
      "com.zentavos.dev.entrepreneur.2.institution": "Entrepreneur+2",
      "com.zentavos.dev.tycoon.100.gb": "Tycoon+100gb",

      // Add-on plans - Yearly (.yearly suffix)
      "com.zentavos.dev.personal.1.institution.yearly": "Personal+1",
      "com.zentavos.dev.founder.1.institution.yearly": "Founder+1",
      "com.zentavos.dev.entrepreneur.1.institution.yearly": "Entrepreneur+1",
      "com.zentavos.dev.entrepreneur.2.institution.yearly": "Entrepreneur+2",
      "com.zentavos.dev.tycoon.100.gb.yearly": "Tycoon+100gb",
    },
    android: {
      // Base subscription plans
      "com.zentavos.zentavosdev.personal": "Personal",
      "com.zentavos.zentavosdev.founder": "Founder",
      "com.zentavos.zentavosdev.entrepreneur": "Entrepreneur",
      "com.zentavos.zentavosdev.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra)
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
      // Base subscription plans - Monthly (no suffix)
      "com.zentavos.stg.personal": "Personal",
      "com.zentavos.stg.founder": "Founder",
      "com.zentavos.stg.entrepreneur": "Entrepreneur",
      "com.zentavos.stg.tycoon": "Tycoon",

      // Base subscription plans - Yearly (.yearly suffix)
      "com.zentavos.stg.personal.yearly": "Personal",
      "com.zentavos.stg.founder.yearly": "Founder",
      "com.zentavos.stg.entrepreneur.yearly": "Entrepreneur",
      "com.zentavos.stg.tycoon.yearly": "Tycoon",

      // Add-on plans - Monthly (no suffix)
      "com.zentavos.stg.personal.1.institution": "Personal+1",
      "com.zentavos.stg.founder.1.institution": "Founder+1",
      "com.zentavos.stg.entrepreneur.1.institution": "Entrepreneur+1",
      "com.zentavos.stg.entrepreneur.2.institution": "Entrepreneur+2",
      "com.zentavos.stg.tycoon.100.gb": "Tycoon+100gb",

      // Add-on plans - Yearly (.yearly suffix)
      "com.zentavos.stg.personal.1.institution.yearly": "Personal+1",
      "com.zentavos.stg.founder.1.institution.yearly": "Founder+1",
      "com.zentavos.stg.entrepreneur.1.institution.yearly": "Entrepreneur+1",
      "com.zentavos.stg.entrepreneur.2.institution.yearly": "Entrepreneur+2",
      "com.zentavos.stg.tycoon.100.gb.yearly": "Tycoon+100gb",
    },
    android: {
      // Base subscription plans
      "com.zentavos.stg.personal": "Personal",
      "com.zentavos.stg.founder": "Founder",
      "com.zentavos.stg.entrepreneur": "Entrepreneur",
      "com.zentavos.stg.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra)
      "com.zentavos.stg.personal.plus1": "Personal+1",
      "com.zentavos.stg.founder.plus1": "Founder+1",
      "com.zentavos.stg.entrepreneur.p1": "Entrepreneur+1",
      "com.zentavos.stg.entrepreneur.p2": "Entrepreneur+2",
      "com.zentavos.stg.tycoon.100gb": "Tycoon+100gb",
    },
  },
  prod: {
    ios: {
      // Base subscription plans - Monthly (no suffix)
      "com.zentavos.sub.personal": "Personal",
      "com.zentavos.sub.founder": "Founder",
      "com.zentavos.sub.entrepreneur": "Entrepreneur",
      "com.zentavos.sub.tycoon": "Tycoon",

      // Base subscription plans - Yearly (.yearly suffix)
      "com.zentavos.sub.personal.yearly": "Personal",
      "com.zentavos.sub.founder.yearly": "Founder",
      "com.zentavos.sub.entrepreneur.yearly": "Entrepreneur",
      "com.zentavos.sub.tycoon.yearly": "Tycoon",

      // Add-on plans - Monthly (no suffix)
      "com.zentavos.sub.personal.1.institution": "Personal+1",
      "com.zentavos.sub.founder.1.institution": "Founder+1",
      "com.zentavos.sub.entrepreneur.1.institution": "Entrepreneur+1",
      "com.zentavos.sub.entrepreneur.2.institution": "Entrepreneur+2",
      "com.zentavos.sub.tycoon.100.gb": "Tycoon+100gb",

      // Add-on plans - Yearly (.yearly suffix)
      "com.zentavos.sub.personal.1.institution.yearly": "Personal+1",
      "com.zentavos.sub.founder.1.institution.yearly": "Founder+1",
      "com.zentavos.sub.entrepreneur.1.institution.yearly": "Entrepreneur+1",
      "com.zentavos.sub.entrepreneur.2.institution.yearly": "Entrepreneur+2",
      "com.zentavos.sub.tycoon.100.gb.yearly": "Tycoon+100gb",
    },
    android: {
      // Base subscription plans
      "com.zentavos.mobile.personal": "Personal",
      "com.zentavos.mobile.founder": "Founder",
      "com.zentavos.mobile.entrepreneur": "Entrepreneur",
      "com.zentavos.mobile.tycoon": "Tycoon",

      // Add-on plans +1 institution ($3 extra)
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

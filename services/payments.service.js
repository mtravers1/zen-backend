import User from "../database/models/User.js";
import { PRODUCT_MAPPINGS } from "../constants/productMappings.js";
import { GoogleAuth } from "google-auth-library";
import { normalizeEnvironment } from "../utils/environment.js";

const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

// Load Google Play Service Account from environment variable
let googlePlayAuth = null;
if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT) {
  try {
    const serviceAccountJson = Buffer.from(
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT,
      "base64"
    ).toString("utf8").replace(/\n/g, "");
    const serviceAccount = JSON.parse(serviceAccountJson);

    googlePlayAuth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    console.log("✅ Google Play authentication configured");
  } catch (error) {
    console.error("❌ Failed to load Google Play Service Account:", error);
  }
} else {
  console.warn("⚠️ GOOGLE_PLAY_SERVICE_ACCOUNT not configured");
}

// Get access token for Google Play API
const getGooglePlayAccessToken = async () => {
  if (!googlePlayAuth) {
    throw new Error("Google Play authentication not configured");
  }

  try {
    const client = await googlePlayAuth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token;
  } catch (error) {
    console.error("❌ Failed to get Google Play access token:", error);
    throw new Error("Failed to authenticate with Google Play API");
  }
};

const validatePayment = async (platform, receipt, uid) => {
  const user = await User.findOne({ authUid: uid });
  try {
    let result;
    let parsedReceipt = null;

    if (platform === "ios") {
      result = await validateApple(receipt);
    } else if (platform === "android") {
      // Parse receipt to extract purchaseToken
      parsedReceipt = typeof receipt === "string" ? JSON.parse(receipt) : receipt;
      result = await validateAndroid(receipt);
    } else {
      return { message: "Invalid platform" };
    }

    if (result.status === 0) {
      await updateUserSubscription(
        user._id.toString(),
        result,
        platform,
        platform === "android" ? parsedReceipt?.purchaseToken : null,
        platform === "android" ? result.fullDetails : null
      );
      return { message: "Valid receipt" };
    } else {
      return { message: "Invalid receipt" };
    }
  } catch (err) {
    console.error(err);
    return { message: "Server error" };
  }
};

const updateUserSubscription = async (userId, data, platform, purchaseToken = null, subscriptionDetails = null) => {
  try {
    const productId = data.latest_receipt_info[0].product_id;
    const expiresDateMs = data.latest_receipt_info[0].expires_date_ms;

    console.log(
      `Updating user ${userId} to plan ${productId} valid until ${expiresDateMs}`
    );

    // Get normalized environment from NODE_ENV
    const environment = normalizeEnvironment();

    // Get plan name from product mappings
    const planMappings = PRODUCT_MAPPINGS[environment]?.[platform];
    if (!planMappings) {
      console.warn(
        `No product mappings found for environment: ${environment}, platform: ${platform}`
      );
    }

    let planName = planMappings?.[productId];
    if (!planName) {
      console.warn(
        `Unknown product ID: ${productId} for environment: ${environment}, platform: ${platform}. Using Free as fallback.`
      );
      planName = "Free";
    }

    // Find and update user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Update user subscription info
    user.account_type = planName;

    // Store subscription metadata for RTDN tracking
    if (purchaseToken && platform === "android") {
      const expiryTime = subscriptionDetails?.lineItems?.[0]?.expiryTime || new Date(parseInt(expiresDateMs)).toISOString();
      const autoRenewing = subscriptionDetails?.lineItems?.[0]?.autoRenewingPlan?.autoRenewEnabled !== false;

      user.subscription_metadata = {
        purchaseToken,
        productId,
        expiryTime,
        autoRenewing,
        state: "active",
        lastUpdated: new Date().toISOString(),
      };

      console.log(`📝 Stored subscription metadata for RTDN tracking`);
    }

    // Save user
    await user.save();

    console.log(`✅ Successfully updated user ${userId} to plan: ${planName}`);

    return {
      success: true,
      userId: userId,
      planName: planName,
    };
  } catch (error) {
    console.error(`❌ Error updating user subscription:`, error);
    throw error;
  }
};

const validateApple = async (receipt) => {
  if (!receipt || typeof receipt !== "string") {
    console.error("❌ Invalid receipt: not a string");
    return { valid: false };
  }

  const body = {
    "receipt-data": receipt,
    password: "d26cffb2aba74e87bc31fae2484cfd00",
    "exclude-old-transactions": true,
  };

  const response = await fetch(APPLE_SANDBOX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  try {
    const result = JSON.parse(text);
    console.log("🍏 Apple Receipt Validation Result:", result);
    return result;
  } catch (e) {
    console.error("❌ Could not parse Apple response:", text);
    return { valid: false, parseError: text };
  }
};

const validateAndroid = async (receipt) => {
  console.log("🤖 Validating Android receipt...");

  // Parse the receipt JSON string
  let parsedReceipt;
  try {
    parsedReceipt = typeof receipt === "string" ? JSON.parse(receipt) : receipt;
    console.log("📱 Parsed receipt:", parsedReceipt);
  } catch (e) {
    console.error("❌ Failed to parse receipt:", e);
    throw new Error("Invalid receipt format");
  }

  const { packageName, productId, purchaseToken } = parsedReceipt;

  if (!packageName || !productId || !purchaseToken) {
    console.error("❌ Missing required fields:", {
      packageName,
      productId,
      purchaseToken,
    });
    throw new Error("Missing required receipt fields");
  }

  // Get OAuth2 access token
  const accessToken = await getGooglePlayAccessToken();
  console.log("🔑 Got Google Play access token");

  // Google Play API v2 endpoint (recommended as of 2025)
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;

  console.log("🔗 Calling Google Play API v2:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Google Play API error:", response.status, errorText);
    throw new Error(
      `Failed to validate purchase: ${response.status} - ${errorText}`
    );
  }

  const result = await response.json();
  console.log("✅ Google Play validation result:", result);
  console.log("🔍 [DETAILED] Full Google Play Response:", JSON.stringify(result, null, 2));

  // ACKNOWLEDGE the purchase if pending
  if (result.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    console.log("🔔 Acknowledging purchase...");
    // Use correct acknowledgement endpoint as per official docs:
    // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/acknowledge
    const acknowledgeUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}:acknowledge`;

    console.log(`🔗 Acknowledgement URL: ${acknowledgeUrl}`);
    console.log(`🔗 ProductId: ${productId}, Token: ${purchaseToken}`);

    const ackResponse = await fetch(acknowledgeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (ackResponse.ok) {
      console.log("✅ Purchase acknowledged successfully");
    } else {
      const ackError = await ackResponse.text();
      console.error("❌ Failed to acknowledge purchase:", ackResponse.status, ackError);
      console.error(`❌ Acknowledgement failed for productId: ${productId}, token: ${purchaseToken}`);
    }
  }

  // Transform Google Play v2 response to match expected format
  // v2 API returns: { lineItems: [{ productId, expiryTime }], subscriptionState }
  return {
    status: 0,
    latest_receipt_info: [
      {
        product_id: result.lineItems?.[0]?.productId || productId,
        expires_date_ms: result.lineItems?.[0]?.expiryTime
          ? new Date(result.lineItems[0].expiryTime).getTime()
          : Date.now() + 30 * 24 * 60 * 60 * 1000,
      },
    ],
    fullDetails: result, // Include full details for subscription_metadata
  };
};

const updateUserUUID = async (uuid, uid) => {
  const user = await User.findOne({ authUid: uid });
  user.id_uuid = uuid;
  await user.save();
};

// Get subscription details from Google Play API
const getSubscriptionDetails = async (purchaseToken) => {
  try {
    const packageName = process.env.ANDROID_PACKAGE_NAME || "com.zentavos.zentavosdev";
    const accessToken = await getGooglePlayAccessToken();

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Failed to get subscription details:", response.status, errorText);
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("❌ Error getting subscription details:", error);
    return null;
  }
};

// Update user subscription from RTDN notification
const updateUserFromRTDN = async (purchaseToken, state, subscriptionDetails) => {
  try {
    console.log(`📝 [RTDN] Updating user from state: ${state}`);

    // Find user by purchaseToken stored in subscription_metadata
    let user = await User.findOne({
      "subscription_metadata.purchaseToken": purchaseToken,
    });

    // Fallback: If RTDN arrives before /very-receipt, find by productId + recent update
    if (!user) {
      console.warn(`⚠️ [RTDN] User not found by purchaseToken, trying fallback...`);
      const productId = subscriptionDetails.lineItems?.[0]?.productId;

      if (productId) {
        // Find users updated in last 5 minutes with this product
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        user = await User.findOne({
          "subscription_metadata.productId": productId,
          "subscription_metadata.lastUpdated": { $gte: fiveMinutesAgo },
        }).sort({ "subscription_metadata.lastUpdated": -1 });

        if (user) {
          console.log(`✅ [RTDN] Found user by fallback (productId + recent update)`);
          // Update purchaseToken now that we have it
          user.subscription_metadata.purchaseToken = purchaseToken;
        }
      }
    }

    if (!user) {
      console.warn(`⚠️ [RTDN] User not found for purchaseToken: ${purchaseToken.substring(0, 20)}...`);
      return;
    }

    console.log(`👤 [RTDN] Found user: ${user._id}`);

    // Get normalized environment from NODE_ENV
    const environment = normalizeEnvironment();

    const productId = subscriptionDetails.lineItems?.[0]?.productId;
    const expiryTime = subscriptionDetails.lineItems?.[0]?.expiryTime;
    const autoRenewing = subscriptionDetails.lineItems?.[0]?.autoRenewingPlan?.autoRenewEnabled || false;

    // Map productId to plan name
    const planMappings = PRODUCT_MAPPINGS[environment]?.android;
    const planName = planMappings?.[productId] || "Free";

    console.log(`📦 [RTDN] Product: ${productId} → Plan: ${planName}`);

    // Handle different subscription states
    switch (state) {
      case "purchased":
      case "renewed":
      case "recovered":
      case "restarted":
        // Activate subscription
        user.account_type = planName;
        user.subscription_metadata = {
          purchaseToken,
          productId,
          expiryTime,
          autoRenewing,
          state: "active",
          lastUpdated: new Date().toISOString(),
        };
        break;

      case "canceled":
        // Mark as canceled but keep access until expiry
        user.subscription_metadata = {
          ...user.subscription_metadata,
          state: "canceled",
          autoRenewing: false,
          lastUpdated: new Date().toISOString(),
        };
        // Don't change account_type yet - user still has access
        break;

      case "expired":
      case "revoked":
        // Downgrade to Free
        user.account_type = "Free";
        user.subscription_metadata = {
          ...user.subscription_metadata,
          state: state,
          lastUpdated: new Date().toISOString(),
        };
        break;

      case "paused":
      case "on_hold":
      case "grace_period":
        // Keep current plan but mark state
        user.subscription_metadata = {
          ...user.subscription_metadata,
          state: state,
          lastUpdated: new Date().toISOString(),
        };
        break;

      default:
        console.warn(`⚠️ [RTDN] Unhandled state: ${state}`);
    }

    await user.save();
    console.log(`✅ [RTDN] User ${user._id} updated successfully`);
  } catch (error) {
    console.error(`❌ [RTDN] Error updating user:`, error);
    throw error;
  }
};

const mockUpgrade = async (uid) => {
  const user = await User.findOne({ authUid: uid });
  user.account_type = "Tycoon+100gb";
  await user.save();
}

const paymentService = {
  validatePayment,
  updateUserUUID,
  getSubscriptionDetails,
  updateUserFromRTDN,
  mockUpgrade,
};

export default paymentService;

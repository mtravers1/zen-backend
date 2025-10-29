import User from "../database/models/User.js";
import { PRODUCT_MAPPINGS } from "../constants/productMappings.js";
import { GoogleAuth } from "google-auth-library";

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

    if (platform === "ios") {
      result = await validateApple(receipt);
    } else if (platform === "android") {
      result = await validateAndroid(receipt);
    } else {
      return { message: "Invalid platform" };
    }

    if (result.status === 0) {
      await updateUserSubscription(user._id.toString(), result, platform);
      return { message: "Valid receipt" };
    } else {
      return { message: "Invalid receipt" };
    }
  } catch (err) {
    console.error(err);
    return { message: "Server error" };
  }
};

const updateUserSubscription = async (userId, data, platform) => {
  try {
    const productId = data.latest_receipt_info[0].product_id;
    const expiresDateMs = data.latest_receipt_info[0].expires_date_ms;

    console.log(
      `Updating user ${userId} to plan ${productId} valid until ${expiresDateMs}`
    );

    // Get environment from NODE_ENV or default to 'dev'
    const nodeEnv = process.env.ENVIRONMENT;
    const environment = nodeEnv === "development" ? "dev" : nodeEnv;

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

  // ACKNOWLEDGE the purchase if pending
  if (result.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    console.log("🔔 Acknowledging purchase...");
    const acknowledgeUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}:acknowledge`;

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
  };
};

const updateUserUUID = async (uuid, uid) => {
  const user = await User.findOne({ authUid: uid });
  user.id_uuid = uuid;
  await user.save();
};

const paymentService = {
  validatePayment,
  updateUserUUID,
};

export default paymentService;

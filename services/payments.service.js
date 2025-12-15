import User from "../database/models/User.js";
import { PRODUCT_MAPPINGS } from "../constants/productMappings.js";
import { GoogleAuth } from "google-auth-library";
import { normalizeEnvironment } from "../utils/environment.js";
import structuredLogger from "../lib/structuredLogger.js";

console.log("RAW GOOGLE_PLAY_SERVICE_ACCOUNT from env:", process.env.GOOGLE_PLAY_SERVICE_ACCOUNT);

const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

// Load Google Play Service Account from environment variable
let googlePlayAuth = null;
if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT) {
  try {
    const serviceAccountJson = Buffer.from(
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT,
      "base64",
    )
      .toString("utf8")
      .replace(/\n/g, "");
    const serviceAccount = JSON.parse(serviceAccountJson);

    const auth = new GoogleAuth();
    googlePlayAuth = auth.fromJSON(serviceAccount);
    googlePlayAuth.scopes = ["https://www.googleapis.com/auth/androidpublisher"];
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
    throw new Error("Google Play authentication not configured
");
  }

  try {
    structuredLogger.logOperationStart("getGooglePlayAccessToken", { serviceAccountEmail: googlePlayAuth.email });
    const tokenResponse = await googlePlayAuth.getAccessToken();
    return tokenResponse.token;
  } catch (error) {
    structuredLogger.logErrorBlock(error, { operation: "getGooglePlayAccessToken" });
    throw new Error("Failed to authenticate with Google Play API");
  }
};

const validatePayment = async (platform, receipt, uid, appleClient, appleSandboxClient) => {
  const user = await User.findOne({ authUid: uid });
  try {
    let result;
    let parsedReceipt = null;

    if (platform === "ios") {
      result = await validateApple(receipt, appleClient, appleSandboxClient);
    } else if (platform === "android") {
      // Parse receipt to extract purchaseToken
      parsedReceipt =
        typeof receipt === "string" ? JSON.parse(receipt) : receipt;
      console.log("📱 Parsed receipt in validatePayment:", parsedReceipt);
      result = await validateAndroid(parsedReceipt);
    } else {
      return { message: "Invalid platform" };
    }

    if (result.status === 0) {
      await updateUserSubscription(
        user._id.toString(),
        result,
        platform,
        platform === "android" ? parsedReceipt?.purchaseToken : null,
        platform === "android" ? result.subscriptionDetails : null,
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

const updateUserSubscription = async (
  userId,
  data,
  platform,
  purchaseToken = null,
  fullDetails = null,
) => {
  try {
    const productId = data.latest_receipt_info[0].product_id;
    const expiresDateMs = data.latest_receipt_info[0].expires_date_ms;

    console.log(
      `Updating user ${userId} to plan ${productId} valid until ${expiresDateMs}`,
    );

    // Get normalized environment from NODE_ENV
    const environment = normalizeEnvironment();

    // Get plan name from product mappings
    const planMappings = PRODUCT_MAPPINGS[environment]?.[platform];
    if (!planMappings) {
      console.warn(
        `No product mappings found for environment: ${environment}, platform: ${platform}`,
      );
    }

    let planName = planMappings?.[productId];
    if (!planName) {
      console.warn(
        `Unknown product ID: ${productId} for environment: ${environment}, platform: ${platform}. Using Free as fallback.`,
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
      const expiryTime =
        fullDetails?.lineItems?.[0]?.expiryTime ||
        new Date(parseInt(expiresDateMs)).toISOString();
      const autoRenewing =
        fullDetails?.lineItems?.[0]?.autoRenewingPlan
          ?.autoRenewEnabled !== false;

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

const validateApple = async (receipt, appleClient, appleSandboxClient) => {
  try {
    // The 'receipt' is a JWT signedPayload from the client
    const [headerB64, payloadB64, signatureB64] = receipt.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));

    const transactionId = payload.transactionId;
    if (!transactionId) {
      throw new Error("No transactionId found in JWT payload");
    }

    console.log(`Found transactionId: ${transactionId}`);

    let transactionInfo;

    try {
      // Per Apple requirements, always try production first
      console.log("Attempting validation with Apple Production client...");
      transactionInfo = await appleClient.getTransactionInfo(transactionId);
    } catch (e) {
      // If production fails, try with sandbox client
      console.warn(`Production validation failed: ${e.message}. Attempting with Apple Sandbox client...`);
      try {
        transactionInfo = await appleSandboxClient.getTransactionInfo(transactionId);
      } catch (sandboxError) {
        console.error(`Sandbox validation also failed: ${sandboxError.message}`);
        throw sandboxError; // Throw the sandbox error if both fail
      }
    }

    if (!transactionInfo) {
      throw new Error("Could not retrieve transaction info from Apple");
    }

    // The response from getTransactionInfo needs to be decoded
    const signedTransactionInfo_b64 = transactionInfo.signedTransactionInfo.split('.')[1];
    const decodedTransaction = JSON.parse(Buffer.from(signedTransactionInfo_b64, 'base64').toString('utf-8'));

    console.log("Successfully validated and decoded transaction from Apple.");

    // Construct a response that is compatible with the existing updateUserSubscription function
    return {
      status: 0, // Success status
      latest_receipt_info: [{
        product_id: decodedTransaction.productId,
        expires_date_ms: decodedTransaction.expiresDate,
      }],
    };

  } catch (error) {
    console.error("❌ Apple Receipt Validation Failed:", error);
    return { valid: false, error: error.message };
  }
};

const validateAndroid = async (parsedReceipt) => {
  console.log("🤖 Validating Android receipt...");
  const { packageName, productId, purchaseToken } = parsedReceipt;

  if (!packageName || !productId || !purchaseToken) {
    console.error("❌ Missing required fields:", {
      packageName,
      productId,
      purchaseToken,
    });
    throw new Error("Missing required receipt fields");
  }

  // Get subscription details
  const subscriptionDetails = await getSubscriptionDetails(purchaseToken);
  if (!subscriptionDetails) {
    throw new Error("Failed to get subscription details");
  }

  console.log(
    "🔍 [DETAILED] Full Google Play Response:",
    JSON.stringify(subscriptionDetails, null, 2),
  );

  // Transform Google Play v2 response to match expected format
  // v2 API returns: { lineItems: [{ productId, expiryTime }], subscriptionState }
  return {
    status: 0,
    latest_receipt_info: [
      {
        product_id: subscriptionDetails.lineItems?.[0]?.productId || productId,
        expires_date_ms: subscriptionDetails.lineItems?.[0]?.expiryTime
          ? new Date(subscriptionDetails.lineItems[0].expiryTime).getTime()
          : Date.now() + 30 * 24 * 60 * 60 * 1000,
      },
    ],
    subscriptionDetails, // Include full details for subscription_metadata
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
    const packageName =
      process.env.ANDROID_PACKAGE_NAME || "com.zentavos.zentavosdev";
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
      console.error(
        "❌ Failed to get subscription details:",
        response.status,
        errorText,
      );
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
const updateUserFromRTDN = async (
  purchaseToken,
  state,
  subscriptionDetails,
) => {
  // First, try to find the user with the incoming purchase token.
  let user = await User.findOne({ "subscription_metadata.purchaseToken": purchaseToken });

  // If not found, check for a linked token.
  if (!user) {
    try {
      console.log(`[RTDN] User not found for purchaseToken, checking for linked token...`);
      const subDetails = await getSubscriptionDetails(purchaseToken);

      if (subDetails && subDetails.linkedPurchaseToken) {
        console.log(`[RTDN] Found linked purchase token: ${subDetails.linkedPurchaseToken}`);
        user = await User.findOne({ "subscription_metadata.purchaseToken": subDetails.linkedPurchaseToken });

        if (user) {
          console.log(`[RTDN] Found user via linked token. Updating to new token.`);
          user.subscription_metadata.purchaseToken = purchaseToken;
        }
      }
    } catch (err) {
      console.error("❌ [RTDN] Error while checking for linked purchase token:", err.message);
    }
  }

  // If user still not found, try to find by external account ID
  if (!user && subscriptionDetails.externalAccountIdentifiers && subscriptionDetails.externalAccountIdentifiers.obfuscatedExternalAccountId) {
    console.log(`[RTDN] User not found, trying to find by external account ID: ${subscriptionDetails.externalAccountIdentifiers.obfuscatedExternalAccountId}`);
    user = await User.findOne({ id_uuid: subscriptionDetails.externalAccountIdentifiers.obfuscatedExternalAccountId });
  }

  // If the user is found (either directly or via linked token), update subscription.
  if (user) {
    try {
      console.log(`👤 [RTDN] Found user: ${user._id}. Updating subscription...`);
      // Get normalized environment from NODE_ENV
      const environment = normalizeEnvironment();

      const productId = subscriptionDetails.lineItems?.[0]?.productId;
      const expiryTime = subscriptionDetails.lineItems?.[0]?.expiryTime;
      const autoRenewing =
        subscriptionDetails.lineItems?.[0]?.autoRenewingPlan?.autoRenewEnabled ||
        false;

      const planMappings = PRODUCT_MAPPINGS[environment]?.android;
      const planName = planMappings?.[productId] || "Free";

      console.log(`📦 [RTDN] Product: ${productId} → Plan: ${planName}`);

      switch (state) {
        case "purchased":
        case "renewed":
        case "recovered":
        case "restarted":
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
          user.subscription_metadata = {
            ...user.subscription_metadata,
            state: "canceled",
            autoRenewing: false,
            lastUpdated: new Date().toISOString(),
          };
          break;
        case "expired":
        case "revoked":
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
      return;
    } catch (error) {
      console.error(`❌ [RTDN] Error updating user:`, error);
    }
  }

  // If user is still not found after all checks, log the failure.
      console.error(
        `❌ [RTDN] Failed to find user for purchaseToken: ${purchaseToken.substring(
          0,
          20,
        )}... after all checks. Full details:`,
        subscriptionDetails,
      );
};



const paymentService = {
  validatePayment,
  updateUserUUID,
  getSubscriptionDetails,
  updateUserFromRTDN,
};

export default paymentService;

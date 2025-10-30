import paymentService from "../services/payments.service.js";
import { importJWK, jwtVerify, SignJWT, importPKCS8, importX509 } from "jose";
import User from "../database/models/User.js";
import fs from "fs";
import permissions from "../config/permissions.js";
import { PRODUCT_MAPPINGS } from "../constants/productMappings.js";
import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";
import dotenv from "dotenv";
dotenv.config();

//Todo move to secret manager
const PRIVATE_KEY_BASE64 = process.env.IAP_CERTIFICATE;

const PRIVATE_KEY = Buffer.from(PRIVATE_KEY_BASE64, "base64").toString("utf8");
const ISSUER_ID = process.env.ISSUER_ID;
const KEY_ID = process.env.KEY_ID;
const ALG = "ES256";
const BUNLDE_ID = process.env.BUNDLEID;
// const privateKeyPEM = fs.readFileSync(PRIVATE_KEY_PATH, "utf-8");
const environment = Environment.SANDBOX;

const client = new AppStoreServerAPIClient(
  PRIVATE_KEY,
  KEY_ID,
  ISSUER_ID,
  BUNLDE_ID,
  environment
);

const verifyReceipts = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;

    const response = await paymentService.validatePayment(
      data.platform,
      data.receipt,
      uid
    );
    res.status(201).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updateUserUUID = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;

    const response = await paymentService.updateUserUUID(data.uuid, uid);
    res.status(201).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const weebhookAndroid = async (req, res) => {
  try {
    // Validate Pub/Sub message structure
    if (!req.body.message) {
      return res.status(400).send("Bad Request");
    }

    const message = req.body.message;

    // Decode base64 Pub/Sub data
    const decodedData = Buffer.from(message.data, "base64").toString("utf-8");

    const notification = JSON.parse(decodedData);

    // Handle subscription notifications
    if (notification.subscriptionNotification) {
      await handleSubscriptionNotification(
        notification.subscriptionNotification
      );
    }
    // Handle one-time product notifications
    else if (notification.oneTimeProductNotification) {
      console.log("🛒 [RTDN] One-time product notification (not implemented)");
    }
    // Handle voided purchase notifications
    else if (notification.voidedPurchaseNotification) {
      console.log("💸 [RTDN] Voided purchase notification (not implemented)");
    }
    // Handle test notifications
    else if (notification.testNotification) {
      console.log("🧪 [RTDN] Test notification received successfully");
    } else {
      console.warn("⚠️ [RTDN] Unknown notification type");
    }

    res.status(200).send("OK");
  } catch (error) {
    res.status(200).send("OK");
  }
};

// Helper function to handle subscription notifications
const handleSubscriptionNotification = async (subscriptionNotification) => {
  const { notificationType, purchaseToken, subscriptionId } =
    subscriptionNotification;

  switch (notificationType) {
    case 1: // SUBSCRIPTION_RECOVERED
      console.log("♻️ [RTDN] Subscription recovered from account hold");
      await updateSubscriptionState(purchaseToken, "recovered");
      break;

    case 2: // SUBSCRIPTION_RENEWED
      console.log("🔄 [RTDN] Subscription renewed");
      await updateSubscriptionState(purchaseToken, "renewed");
      break;

    case 3: // SUBSCRIPTION_CANCELED
      console.log(
        "❌ [RTDN] Subscription canceled (but still valid until expiry)"
      );
      await updateSubscriptionState(purchaseToken, "canceled");
      break;

    case 4: // SUBSCRIPTION_PURCHASED
      console.log("🎉 [RTDN] New subscription purchased");
      await updateSubscriptionState(purchaseToken, "purchased");
      break;

    case 5: // SUBSCRIPTION_ON_HOLD
      console.log("⏸️ [RTDN] Subscription on hold");
      await updateSubscriptionState(purchaseToken, "on_hold");
      break;

    case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
      console.log("⏳ [RTDN] Subscription in grace period");
      await updateSubscriptionState(purchaseToken, "grace_period");
      break;

    case 7: // SUBSCRIPTION_RESTARTED
      console.log("🔄 [RTDN] Subscription restarted");
      await updateSubscriptionState(purchaseToken, "restarted");
      break;

    case 8: // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
      console.log("💰 [RTDN] Price change confirmed");
      await updateSubscriptionState(purchaseToken, "price_changed");
      break;

    case 9: // SUBSCRIPTION_DEFERRED
      console.log("📅 [RTDN] Subscription deferred");
      await updateSubscriptionState(purchaseToken, "deferred");
      break;

    case 10: // SUBSCRIPTION_PAUSED
      console.log("⏸️ [RTDN] Subscription paused");
      await updateSubscriptionState(purchaseToken, "paused");
      break;

    case 11: // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
      console.log("📅 [RTDN] Pause schedule changed");
      break;

    case 12: // SUBSCRIPTION_REVOKED
      console.log("🚫 [RTDN] Subscription revoked");
      await updateSubscriptionState(purchaseToken, "revoked");
      break;

    case 13: // SUBSCRIPTION_EXPIRED
      console.log("⏰ [RTDN] Subscription expired");
      await updateSubscriptionState(purchaseToken, "expired");
      break;

    default:
      console.warn(`⚠️ [RTDN] Unknown notification type: ${notificationType}`);
  }
};

// Helper function to update subscription state in database
const updateSubscriptionState = async (purchaseToken, state) => {
  try {
    // Call Google Play API to get full subscription details
    const subscriptionDetails = await paymentService.getSubscriptionDetails(
      purchaseToken
    );

    if (!subscriptionDetails) return;

    // Update user based on subscription state
    await paymentService.updateUserFromRTDN(
      purchaseToken,
      state,
      subscriptionDetails
    );

    console.log(`✅ [RTDN] Successfully updated subscription state: ${state}`);
  } catch (error) {
    console.error(`❌ [RTDN] Error updating subscription state:`, error);
  }
};

const weebhookApple = async (req, res) => {
  const payload = await decodeSignedPayload(req.body.signedPayload);
  if (!payload) return res.status(200).send("OK");

  const { notificationType } = payload.payload;
  const user = await User.findOne({ id_uuid: payload.appAccountToken });
  if (!user) return res.status(200).send("OK");

  const productId = payload.signedTransactionInfo.productId;
  const nodeEnv = process.env.ENVIRONMENT;
  const env = nodeEnv === "development" ? "dev" : nodeEnv;
  const planMappings = PRODUCT_MAPPINGS[env]?.ios;
  const planName = planMappings?.[productId];

  switch (notificationType) {
    case "SUBSCRIBED":
      if (planName) {
        user.account_type = planName;
        await user.save();
        console.log(`✅ [iOS] User subscribed to ${planName}`);
      }
      break;

    case "DID_CHANGE_RENEWAL_STATUS":
      console.log("⚠️ [iOS] Subscription canceled but still valid until expiry");
      break;

    case "DID_RENEW":
      if (planName) {
        user.account_type = planName;
        await user.save();
        console.log(`✅ [iOS] Subscription renewed: ${planName}`);
      }
      break;

    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
      user.account_type = "Free";
      await user.save();
      console.log("✅ [iOS] Subscription expired, user set to Free");
      break;

    default:
      console.log(`⚠️ [iOS] Unknown notification type: ${notificationType}`);
      break;
  }
  res.status(200).send("OK");
};

const decodeSignedPayload = async (signedPayload) => {
  try {
    const [headerB64] = signedPayload.split(".");
    const header = JSON.parse(
      Buffer.from(headerB64, "base64").toString("utf-8")
    );

    const x5c = header.x5c?.[0];

    if (!x5c) throw new Error("No x5c certificate found in JWT header");

    const certPEM = `-----BEGIN CERTIFICATE-----\n${x5c
      .match(/.{1,64}/g)
      .join("\n")}\n-----END CERTIFICATE-----`;

    const publicKey = await importX509(certPEM, ALG);

    const { payload } = await jwtVerify(signedPayload, publicKey, ALG);

    const transactionB64 = payload.data.signedTransactionInfo.split(".");

    const transactionId = JSON.parse(
      Buffer.from(transactionB64[1], "base64").toString("utf-8")
    );

    const originalTransactionId = transactionId.originalTransactionId;

    if (!originalTransactionId) throw new Error("No originalTransactionId");

    const appAccountToken = await validateSubscription(originalTransactionId);
    if (!appAccountToken) throw new Error("No appAccountToken");
    return {
      payload: payload,
      signedTransactionInfo: transactionId,
      appAccountToken: appAccountToken,
    };
  } catch (err) {
    console.log("🚀 ~ decodeSignedPayload ~ err:", err);
    console.error("process notification error");
  }
};

const validateSubscription = async (originalTransactionId) => {
  const info = await client.getTransactionInfo(originalTransactionId);
  const splited = info.signedTransactionInfo.split(".");
  const signedTransactionInfo = JSON.parse(
    Buffer.from(splited[1], "base64").toString("utf-8")
  );
  if (signedTransactionInfo.appAccountToken) {
    return signedTransactionInfo.appAccountToken;
  } else {
    return "";
  }
};

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
const getProductIdForPlan = (planId, platform) => {
  // Map NODE_ENV to productMappings keys
  const nodeEnv = process.env.ENVIRONMENT;
  const env = nodeEnv === "development" ? "dev" : nodeEnv;
  const mappings = PRODUCT_MAPPINGS[env]?.[platform];

  console.log(
    `🔍 getProductIdForPlan("${planId}", "${platform}") - env: ${env}`
  );
  console.log(`🔍 Available mappings:`, mappings);

  if (!mappings) {
    console.log(`❌ No mappings found for env: ${env}, platform: ${platform}`);
    return null;
  }

  // Find the productId that maps to this planId
  for (const [productId, mappedPlanId] of Object.entries(mappings)) {
    console.log(
      `🔍 Checking: "${productId}" → "${mappedPlanId}" vs "${planId}"`
    );
    if (mappedPlanId === planId) {
      console.log(`✅ Found match: "${planId}" → "${productId}"`);
      return productId;
    }
  }

  console.log(`❌ No match found for planId: "${planId}"`);
  return null;
};

const getAvailablePlans = async (req, res) => {
  try {
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
        product_ids: {
          ios: getProductIdForPlan(planId, "ios"),
          android: getProductIdForPlan(planId, "android"),
        },
      }));

    // Sort plans according to hierarchy
    const sortedPlans = allPlans.sort((a, b) => {
      const indexA = planOrder.indexOf(a.id);
      const indexB = planOrder.indexOf(b.id);

      // If plan not in order array, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    });

    res.status(200).json({ plans: sortedPlans });
  } catch (error) {
    console.error("Error getting available plans:", error);
    res.status(500).json({ message: error.message });
  }
};

const paymentsController = {
  verifyReceipts,
  weebhookAndroid,
  weebhookApple,
  updateUserUUID,
  getAvailablePlans,
};
export default paymentsController;

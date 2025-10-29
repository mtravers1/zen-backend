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
  const message = req.body.message;
  const data = JSON.parse(Buffer.fron(message.data, "base64").toString());
  const { eventType, subscription } = data.notification;
  const userId = subscription.userId;

  switch (eventType) {
    case "INITIAL_BUY":
      console.log("Initial Buy", subscription);
      break;
    case "SUBSCRIPTION_CANCELLED":
      console.log("Cancel", subscription);
      break;
    case "SUBSCRIPTION_RENEWED":
      console.log("Renewal", subscription);
      break;
    default:
      console.log("Unknown notification type");
  }
  res.status(200).send("OK");
};

const weebhookApple = async (req, res) => {
  const payload = await decodeSignedPayload(req.body.signedPayload);
  if (!payload) return res.status(200).send("OK");

  const { notificationType } = payload.payload;
  const user = await User.findOne({ id_uuid: payload.appAccountToken });
  if (!user) return res.status(200).send("OK");
  switch (notificationType) {
    case "SUBSCRIBED":
      switch (payload.signedTransactionInfo.productId) {
        case "test1":
          user.account_type = "Personal";
          await user.save();
          break;
        case "test2":
          user.account_type = "Founder";
          await user.save();
          break;
        case "test3":
          user.account_type = "Entrepreneur";
          await user.save();
          break;
        default:
          break;
      }
      break;
    case "CANCEL":
      user.account_type = "Free";
      await user.save();
      break;
    case "DID_RENEW":
      switch (payload.signedTransactionInfo.productId) {
        case "test1":
          user.account_type = "Personal";
          await user.save();
          break;
        case "test2":
          user.account_type = "Founder";
          await user.save();
          break;
        case "test3":
          user.account_type = "Entrepreneur";
          await user.save();
          break;
        default:
          break;
      }
      break;
    default:
      console.log("Unknown notification type");
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

const mockUpgrade = async (req, res) => {
  try {
    const uid = req.user.uid;
    await paymentService.mockUpgrade(uid);
    res.status(200).json({ success: true, message: "User upgraded successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const paymentsController = {
  verifyReceipts,
  weebhookAndroid,
  weebhookApple,
  updateUserUUID,
  getAvailablePlans,
  mockUpgrade,
};
export default paymentsController;

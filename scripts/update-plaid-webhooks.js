import "dotenv/config";
import mongoose from "mongoose";
import AccessToken from "../database/models/AccessToken.js";
import getPlaidClient from "../config/plaid.js";
import { createSafeDecrypt } from "../lib/encryptionHelper.js";
import { getUserDek } from "../database/encryption.js";
import User from "../database/models/User.js";
import connectDB from "../database/database.js";

const NEW_WEBHOOK_URL = process.env.PLAID_WEBHOOK_URL;

const updatePlaidWebhooks = async () => {
  await connectDB();

  const plaidClient = getPlaidClient();
  const accessTokens = await AccessToken.find({});

  console.log(`Found ${accessTokens.length} access tokens to check.`);

  for (const token of accessTokens) {
    try {
      const user = await User.findById(token.userId);
      if (!user) {
        console.error(`User not found for token with itemId: ${token.itemId}`);
        continue;
      }
      const dek = await getUserDek(user.authUid);
      const safeDecrypt = createSafeDecrypt(user.authUid, dek);
      const decryptedToken = await safeDecrypt(token.accessToken, {
        item_id: token.itemId,
        field: "accessToken",
      });

      if (!decryptedToken) {
        console.error(`Failed to decrypt access token for itemId: ${token.itemId}`);
        continue;
      }

      const itemResponse = await plaidClient.itemGet({
        access_token: decryptedToken,
      });

      const currentWebhook = itemResponse.data.item.webhook;
      console.log(`[${token.itemId}] Current webhook: ${currentWebhook}`);

      if (currentWebhook !== NEW_WEBHOOK_URL) {
        console.log(`[${token.itemId}] Webhook is outdated. Updating to ${NEW_WEBHOOK_URL}...`);

        await plaidClient.itemWebhookUpdate({
          access_token: decryptedToken,
          webhook: NEW_WEBHOOK_URL,
        });

        console.log(`[${token.itemId}] Webhook updated successfully.`);
      }
    } catch (error) {
      console.error(`Failed to update webhook for itemId: ${token.itemId}`, error.response?.data || error);
    }
  }

  console.log("Finished checking all webhooks.");
  process.exit(0);
};

updatePlaidWebhooks();

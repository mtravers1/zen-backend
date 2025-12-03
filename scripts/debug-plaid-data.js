import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import AccessToken from '../database/models/AccessToken.js';
import Liability from '../database/models/Liability.js';
import Transaction from '../database/models/Transaction.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import plaidService from '../services/plaid.service.js';
import {
  getUserDek,
  hashValue
} from '../database/encryption.js';
import {
  createSafeEncrypt,
  createSafeDecrypt
} from '../lib/encryptionHelper.js';
import structuredLogger from '../lib/structuredLogger.js';
import crypto from 'crypto';

async function debugPlaidData() {
  await connectDB();

  const firebaseUid = process.argv[2]; // Expecting Firebase UID as the first argument
  if (!firebaseUid) {
    console.error("Usage: node -r dotenv/config scripts/debug-plaid-data.js <firebaseUid>");
    process.exit(1);
  }

  structuredLogger.logSuccess(`Starting debug for user: ${firebaseUid}`);

  try {
    const user = await User.findOne({ authUid: firebaseUid });
    if (!user) {
      structuredLogger.logErrorBlock(new Error("User not found"), { firebaseUid });
      process.exit(1);
    }
    const userId = user._id.toString();
    structuredLogger.logSuccess(`Found user DB ID: ${userId}`);

    const dek = await getUserDek(firebaseUid);
    const safeDecrypt = createSafeDecrypt(firebaseUid, dek);
    const safeEncrypt = createSafeEncrypt(firebaseUid, dek);

    const accessTokenDoc = await AccessToken.findOne({ userId });
    if (!accessTokenDoc) {
      structuredLogger.logErrorBlock(new Error("Access Token not found for user"), { userId });
      process.exit(1);
    }
    structuredLogger.logSuccess(`Found AccessToken doc for itemId: ${accessTokenDoc.itemId}`);

    const decryptedAccessToken = await safeDecrypt(accessTokenDoc.accessToken, {
      user_id: userId,
      item_id: accessTokenDoc.itemId,
      field: "accessToken",
    });
    structuredLogger.logSuccess("AccessToken decrypted successfully.");

    // --- Step 1: Call Plaid directly for Liabilities ---
    console.log("\n--- Calling Plaid for Liabilities ---");
    let plaidLiabilitiesResponse = null;
    try {
      plaidLiabilitiesResponse = await plaidService.getLoanLiabilitiesWithAccessToken(decryptedAccessToken);
      console.log("RAW Plaid Liabilities Response:", JSON.stringify(plaidLiabilitiesResponse, null, 2));
    } catch (error) {
      structuredLogger.logErrorBlock(error, { operation: "plaid_liabilities_get", firebaseUid, itemId: accessTokenDoc.itemId, error_response: error.response?.data });
    }

    // --- Step 2: Call Plaid directly for Investments ---
    console.log("\n--- Calling Plaid for Investments Holdings ---");
    let plaidInvestmentsHoldingsResponse = null;
    try {
      plaidInvestmentsHoldingsResponse = await plaidService.getInvestmentsHoldingsWithAccessToken(decryptedAccessToken);
      console.log("RAW Plaid Investments Holdings Response:", JSON.stringify(plaidInvestmentsHoldingsResponse, null, 2));
    } catch (error) {
      structuredLogger.logErrorBlock(error, { operation: "plaid_investments_holdings_get", firebaseUid, itemId: accessTokenDoc.itemId, error_response: error.response?.data });
    }

    console.log("\n--- Simulating AddAccount Processing for Liabilities ---");
    if (plaidLiabilitiesResponse && plaidLiabilitiesResponse.liabilities) {
      const liabilities = plaidLiabilitiesResponse.liabilities;
      for (const [category, items] of Object.entries(liabilities)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            console.log(`[SIMULATE-LIAB] Processing item from category ${category}:`, item.account_id);

            // This part is simplified; addAccount has `savedAccounts` check which we're skipping here for direct test
            // Assuming a PlaidAccount exists for this item.account_id
            const existingPlaidAccount = await PlaidAccount.findOne({ plaid_account_id: item.account_id });
            if (!existingPlaidAccount) {
              console.log(`[SIMULATE-LIAB] WARNING: PlaidAccount not found for ${item.account_id}. Skipping save simulation.`);
              continue;
            }

            // Simulate encryption and save for a few key fields (adjust as needed)
            try {
              const encryptedAccountNumber = await safeEncrypt(item.account_number);
              const encryptedLoanName = await safeEncrypt(item.loan_name);
              
              const liability = new Liability({
                liabilityType: category,
                accountId: item.account_id,
                accountNumber: encryptedAccountNumber,
                loanName: encryptedLoanName,
                // ... add other fields you expect to save ...
              });
              console.log(`[SIMULATE-LIAB] Attempting to save liability for account: ${item.account_id}`);
              // await liability.save(); // Don't actually save in debug script unless explicitly needed
              console.log(`[SIMULATE-LIAB] Successfully simulated processing for liability: ${item.account_id}`);
            } catch (error) {
              structuredLogger.logErrorBlock(error, { operation: "simulate_liab_save", firebaseUid, accountId: item.account_id, field: "accountNumber" });
            }
          }
        }
      }
    } else {
      console.log("[SIMULATE-LIAB] No liabilities data received from Plaid.");
    }

    console.log("\n--- Simulating AddAccount Processing for Investments ---");
    if (plaidInvestmentsHoldingsResponse && plaidInvestmentsHoldingsResponse.holdings && plaidInvestmentsHoldingsResponse.securities) {
      const holdings = plaidInvestmentsHoldingsResponse.holdings;
      const securities = plaidInvestmentsHoldingsResponse.securities;
      
      // Simple simulation: just check if data exists
      if (holdings.length > 0) {
        console.log(`[SIMULATE-INV] Received ${holdings.length} holdings and ${securities.length} securities. Data is present.`);
        // Further logic could simulate Transaction saves if needed
      } else {
        console.log("[SIMULATE-INV] No investment holdings data received from Plaid.");
      }
    } else {
      console.log("[SIMULATE-INV] No investment holdings data received from Plaid.");
    }


  } catch (error) {
    structuredLogger.logErrorBlock(error, { operation: "debug_plaid_data", firebaseUid, error_message: error.message });
  }

  console.log("\n--- Debug script finished ---");
  process.exit(0);
}

debugPlaidData();

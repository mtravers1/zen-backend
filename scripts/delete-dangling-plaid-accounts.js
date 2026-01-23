
import mongoose from "mongoose";
import connectDB from "../database/database.js";
import AccessToken from "../database/models/AccessToken.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import accountsService from "../services/account.service.js";

const findDanglingPlaidAccounts = async (isDryRun) => {
  try {
    await connectDB();
    console.log("Database connected.");

    const danglingItems = new Set();
    const plaidAccounts = await PlaidAccount.find({});
    console.log(`Found ${plaidAccounts.length} PlaidAccount documents to check.`);

    const accessTokens = await AccessToken.find({});
    const accessTokenMap = new Map(accessTokens.map(token => [token.itemId, token]));

    for (const account of plaidAccounts) {
        const token = accessTokenMap.get(account.itemId);
        if (!token) {
            danglingItems.add(account.itemId);
        } else if (token.isAccessTokenExpired || ['expired', 'corrupted', 'login_required'].includes(token.status)) {
            danglingItems.add(account.itemId);
        }
    }

    console.log("\n--- Dangling Plaid Accounts Report ---");
    if (danglingItems.size > 0) {
      console.log("The following item IDs are present in PlaidAccount documents but are missing from the AccessToken collection:");
      danglingItems.forEach(itemId => console.log(itemId));
    } else {
      console.log("No dangling PlaidAccount documents found.");
      return;
    }
    console.log("-------------------------------------\n");

    if (isDryRun) {
      console.log("--DRY RUN-- No accounts will be deleted. Run with --no-dry-run to delete dangling accounts.");
    }

    for (const itemId of danglingItems) {
        const danglingAccounts = await PlaidAccount.find({ itemId: itemId });
        for (const account of danglingAccounts) {
            const user = await User.findById(account.owner_id);
            if (user) {
                console.log(`Found dangling account with plaid_account_id: ${account.plaid_account_id} for user ${user.authUid}`);
                if (!isDryRun) {
                    console.log(`Deleting account with plaid_account_id: ${account.plaid_account_id}`);
                    await accountsService.deletePlaidAccount(account.plaid_account_id, user.authUid);
                    console.log(`Deleted account with plaid_account_id: ${account.plaid_account_id}`);
                }
            } else {
                console.log(`Could not find user for account with plaid_account_id: ${account.plaid_account_id}`);
            }
        }
    }

  } catch (error) {
    console.error("Error generating dangling accounts report:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

const parseArgs = () => {
  let isDryRun = true; 

  for (const arg of process.argv.slice(2)) {
    if (arg === "--no-dry-run") {
      isDryRun = false;
    }
  }

  return { isDryRun };
};

const { isDryRun } = parseArgs();
findDanglingPlaidAccounts(isDryRun);

import mongoose from "mongoose";
import connectDB from "../database/database.js";
import AccessToken from "../database/models/AccessToken.js";
import PlaidAccount from "../database/models/PlaidAccount.js";

const findDanglingPlaidAccounts = async () => {
  try {
    await connectDB();
    console.log("Database connected.");

    const danglingItems = new Set();
    const plaidAccounts = await PlaidAccount.find({});
    console.log(`Found ${plaidAccounts.length} PlaidAccount documents to check.`);

    for (const account of plaidAccounts) {
      const accessToken = await AccessToken.findOne({ itemId: account.itemId });
      if (!accessToken) {
        danglingItems.add(account.itemId);
      }
    }

    console.log("\n--- Dangling Plaid Accounts Report ---");
    if (danglingItems.size > 0) {
      console.log("The following item IDs are present in PlaidAccount documents but are missing from the AccessToken collection:");
      danglingItems.forEach(itemId => console.log(itemId));
    } else {
      console.log("No dangling PlaidAccount documents found.");
    }
    console.log("-------------------------------------");

  } catch (error) {
    console.error("Error generating dangling accounts report:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

findDanglingPlaidAccounts();

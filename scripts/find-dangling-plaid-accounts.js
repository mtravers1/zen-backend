import mongoose from "mongoose";
import connectDB from "../database/database.js";
import AccessToken from "../database/models/AccessToken.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js"; // Import Transaction model
import Liability from "../database/models/Liability.js";     // Import Liability model

const findAndDeleteDanglingPlaidAccounts = async () => {
  try {
    await connectDB();
    console.log("Database connected.");

    const danglingItemIds = new Set();
    const plaidAccounts = await PlaidAccount.find({});
    console.log(`Found ${plaidAccounts.length} PlaidAccount documents to check.`);

    for (const account of plaidAccounts) {
      const accessToken = await AccessToken.findOne({ itemId: account.itemId });
      if (!accessToken) {
        danglingItemIds.add(account.itemId);
      }
    }

    console.log(`
--- Dangling Plaid Accounts Report ---`);
    if (danglingItemIds.size > 0) {
      console.log("The following item IDs are present in PlaidAccount documents but are missing from the AccessToken collection:");
      for (const itemId of danglingItemIds) {
        console.log(`Processing dangling itemId: ${itemId}`);

        // Find all PlaidAccount documents associated with this dangling itemId
        const accountsToDelete = await PlaidAccount.find({ itemId: itemId });
        const plaidAccountIdsToDelete = accountsToDelete.map(acc => acc.plaid_account_id);
        const accountObjectIdsToDelete = accountsToDelete.map(acc => acc._id);

        if (accountsToDelete.length > 0) {
          console.log(`  Found ${accountsToDelete.length} PlaidAccount documents for itemId ${itemId}.`);

          // Delete associated Transactions
          const transactionDeleteResult = await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIdsToDelete } });
          console.log(`  Deleted ${transactionDeleteResult.deletedCount} Transaction documents for itemId ${itemId}.`);

          // Delete associated Liabilities
          const liabilityDeleteResult = await Liability.deleteMany({ accountId: { $in: plaidAccountIdsToDelete } });
          console.log(`  Deleted ${liabilityDeleteResult.deletedCount} Liability documents for itemId ${itemId}.`);

          // Delete the PlaidAccount documents
          const plaidAccountDeleteResult = await PlaidAccount.deleteMany({ itemId: itemId });
          console.log(`  Deleted ${plaidAccountDeleteResult.deletedCount} PlaidAccount documents for itemId ${itemId}.`);

          // Remove references from users (if any)
          // This assumes `plaidAccounts` in User model stores ObjectIds of PlaidAccount.
          // This operation should be run against all users who might have these accounts linked.
          // For simplicity in this script, we'll do a general pull.
          const userUpdateResult = await mongoose.model('User').updateMany(
            { $or: [{ plaidAccounts: { $in: accountObjectIdsToDelete } }, { 'business.plaidAccountIds': { $in: accountObjectIdsToDelete } }] },
            { $pull: { plaidAccounts: { $in: accountObjectIdsToDelete }, 'business.plaidAccountIds': { $in: accountObjectIdsToDelete } } }
          );
          console.log(`  Updated ${userUpdateResult.modifiedCount} user/business documents to remove references for itemId ${itemId}.`);
        } else {
          console.log(`  No PlaidAccount documents found for itemId ${itemId} (already cleaned up or not present).`);
        }
      }
    } else {
      console.log("No dangling PlaidAccount documents found.");
    }
    console.log("-------------------------------------");

  } catch (error) {
    console.error("Error during dangling accounts cleanup:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

findAndDeleteDanglingPlaidAccounts();

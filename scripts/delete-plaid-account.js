import mongoose from "mongoose";
import connectDB from "../database/database.js";
import accountsService from "../services/accounts.service.js";
import User from "../database/models/User.js";

const deletePlaidAccount = async (accountId, userId, isDryRun) => {
  if (!accountId || !userId) {
    console.error("Account ID and User ID (Firebase UID or Database ID) are required.");
    process.exit(1);
  }

  try {
    await connectDB();
    console.log("Database connected.");

    let user;
    let uid;
    // Check if userId is a mongoose ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      uid = user.authUid;
    } else {
      user = await User.findOne({ authUid: userId });
      uid = userId;
    }

    if (!user) {
      throw new Error(`User not found with ID: ${userId}`);
    }

    if (isDryRun) {
      console.log(`--DRY RUN-- Would delete Plaid account ${accountId} for user with uid ${uid}`);
    } else {
      await accountsService.removeAccountByUid(accountId, uid);
      console.log(`Plaid account ${accountId} for user with uid ${uid} deleted successfully.`);
    }

  } catch (error) {
    console.error("Error deleting Plaid account:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

const accountId = process.argv[2];
const userId = process.argv[3];
const isDryRun = process.argv[4] !== "--no-dry-run";

deletePlaidAccount(accountId, userId, isDryRun);

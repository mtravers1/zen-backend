import mongoose from "mongoose";
import admin from "../lib/firebaseAdmin.js";
import User from "../database/models/User.js";
import connectDB from "../database/database.js";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const cleanupFirebase = async (isDryRun) => {
  console.log("Starting Firebase cleanup of orphaned users...");

  // Get all authUids from MongoDB
  const mongoUsers = await User.find({}, 'authUid').lean();
  const mongoUids = new Set(mongoUsers.map(u => u.authUid));
  console.log(`Found ${mongoUids.size} users in MongoDB.`);

  // Get all users from Firebase Auth
  let firebaseUsers = [];
  let nextPageToken;
  do {
    const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
    firebaseUsers = firebaseUsers.concat(listUsersResult.users);
    nextPageToken = listUsersResult.pageToken;
  } while (nextPageToken);
  console.log(`Found ${firebaseUsers.length} users in Firebase.`);

  // Find orphaned Firebase users
  const orphanedFirebaseUids = firebaseUsers
    .filter(firebaseUser => !mongoUids.has(firebaseUser.uid))
    .map(firebaseUser => firebaseUser.uid);

  if (orphanedFirebaseUids.length === 0) {
    console.log("No orphaned Firebase users found.");
    return;
  }

  console.log(`Found ${orphanedFirebaseUids.length} orphaned Firebase users.`);

  if (isDryRun) {
    console.log("Orphaned Firebase UIDs to be deleted:");
    console.table(orphanedFirebaseUids);
  } else {
    console.log("Deleting orphaned Firebase users...");
    // Firebase admin.auth().deleteUsers() can take an array of UIDs, max 1000 at a time.
    const batchSize = 1000;
    for (let i = 0; i < orphanedFirebaseUids.length; i += batchSize) {
        const batch = orphanedFirebaseUids.slice(i, i + batchSize);
        try {
            const deleteResult = await admin.auth().deleteUsers(batch);
            console.log(`Successfully deleted ${deleteResult.successCount} users.`);
            if (deleteResult.failureCount > 0) {
                console.error(`Failed to delete ${deleteResult.failureCount} users.`);
                deleteResult.errors.forEach(err => {
                    console.error(err.error.toJSON());
                });
            }
        } catch (error) {
            console.error("Error deleting users batch:", error);
        }
    }
    console.log("Finished deleting orphaned Firebase users.");
  }
};

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [--no-dry-run]')
    .option('dry-run', {
      describe: 'Perform a dry run (default) or use --no-dry-run to execute deletion.',
      type: 'boolean',
      default: true,
    })
    .help()
    .argv;

  try {
    await connectDB();
    console.log("Database connected.");
    await cleanupFirebase(argv.dryRun);
  } catch (error) {
    console.error("Error during Firebase cleanup process:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

main();

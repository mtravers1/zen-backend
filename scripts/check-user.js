import admin from "../lib/firebaseAdmin.js";

const uid = process.argv[2];

if (!uid) {
  console.error("Please provide a user ID.");
  process.exit(1);
}

admin
  .auth()
  .getUser(uid)
  .then((userRecord) => {
    console.log(`User found: ${JSON.stringify(userRecord.toJSON())}`);
    process.exit(0);
  })
  .catch((error) => {
    if (error.code === "auth/user-not-found") {
      console.log("User not found.");
    } else {
      console.error("Error getting user:", error);
    }
    process.exit(1);
  });

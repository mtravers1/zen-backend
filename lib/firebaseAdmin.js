import firebaseAdmin from "firebase-admin";

let admin;

// For test environment, return a mock admin object
if (process.env.NODE_ENV === "test") {
  admin = {
    auth: () => ({
      createUser: () => ({ uid: "test-uid" }),
      getUserByEmail: () => ({ uid: "test-uid" }),
      updateUser: () => {},
      deleteUser: () => {},
      createCustomToken: () => "mock-firebase-token",
      verifyIdToken: () => ({ uid: "test-uid", email: "test@example.com" }),
    }),
    apps: [], // Mock apps array for checking if initialized
    credential: {
      cert: () => ({}), // Mock cert function
    },
    initializeApp: () => {}, // Mock initializeApp
  };
} else {
  // In a non-test environment, use the real firebase-admin module
  // Initialization is handled in app.js
  admin = firebaseAdmin;
}

export default admin;

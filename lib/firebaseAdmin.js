const { initializeApp, applicationDefault,  } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin with service account
// TODO: Add your Firebase Admin SDK service account key JSON file path at the env variable GOOGLE_APPLICATION_CREDENTIALS
const firebaseAdmin = initializeApp({
    credential: applicationDefault(),
});

const firebaseAuth = getAuth(firebaseAdmin);


module.exports = {
    firebaseAdmin,
    firebaseAuth,
};
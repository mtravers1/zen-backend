import admin from 'firebase-admin';

admin.initializeApp({
    credential: admin.credential.cert(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
    databaseURL: "https://zentavos.firebaseio.com"
});

export default admin;
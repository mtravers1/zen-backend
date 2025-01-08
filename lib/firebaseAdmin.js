import admin from 'firebase-admin';

console.log('FIREBASE_SERVICE_ACCOUNT_PATH: ', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

admin.initializeApp({
    credential: admin.credential.cert(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
    databaseURL: "https://zentavos.firebaseio.com"
});

export default admin;
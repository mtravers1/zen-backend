import admin from 'firebase-admin';
// import * as serviceAccount from '../ServiceAccountKey.json' with {type: 'json'};

admin.initializeApp({
    credential: admin.credential.cert('../ServiceAccountKey.json'),
    databaseURL: "https://zentavos.firebaseio.com"
});

export default admin;
import { unless } from "express-unless";
import admin from 'firebase-admin';


async function firebaseAuthentication(req, res, next){
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if (!idToken) {
        return res.status(401).send('Unauthorized');
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        console.log(decodedToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.log(error);
        return res.status(401).send('Unauthorized');
    }
};

firebaseAuthentication.unless = unless;

export default firebaseAuthentication;
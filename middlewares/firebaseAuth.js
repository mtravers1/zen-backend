const { unless } = require("express-unless");
const { firebaseAuth } = require('../lib/firebaseAdmin.js');

async function firebaseAuthentication(req, res, next){
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if (!idToken) {
        return res.status(401).send('Unauthorized');
    }

    try {
        const decodedToken = await firebaseAuth.verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).send('Unauthorized');
    }
};

firebaseAuthentication.unless = unless;

module.exports = firebaseAuthentication;
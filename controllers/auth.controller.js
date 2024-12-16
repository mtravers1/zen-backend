const mailer = require('../lib/mailer/mailer.js');

function login (req, res) {
    const login = req.body;

    //TODO: Implement login logic
    res.status(200).send("Success");
}

function recoveryPassword (req, res) {
    const login = req.body;

    //TODO: Implement recovery password logic

    res.status(200).send("Success");
}

module.exports = {
    login,
    recoveryPassword
};
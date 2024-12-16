const VERSION = process.env.VERSION || '1.0.0';

function getAppVersion(req, res) {
    res.status(200).send(VERSION);
}

module.exports = {
    getAppVersion
};
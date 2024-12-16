const { Router } = require('express');
const authController = require('../controllers/auth.controller.js');

const router = Router();


router.route('/login')
    .post(authController.login);

router.route('/recoverypassword')
    .post(authController.recoveryPassword);

module.exports = router;
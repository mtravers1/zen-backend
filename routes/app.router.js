const { Router } = require('express');
const appController = require('../controllers/app.controller.js');

const router = Router();

// GET App Version
router.get('/version', appController.getAppVersion);


module.exports = router;
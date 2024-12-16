const  { Router } = require('express');

const router = Router();

// Load different routes
router.use('/_info', require('./app.router'));
// router.use('/auth', require('./auth.router'));
// router.use('/users', require('./users.router'));
// router.use('/roles', require('./roles.router'));


module.exports = router;
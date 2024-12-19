import { Router } from 'express';
import infoRouter from './app.router.js';
import authRouter from './auth.router.js';

const router = Router();

// Load different routes
router.use('/_info', infoRouter);
router.use('/auth', authRouter);

// router.use('/users', require('./users.router'));
// router.use('/roles', require('./roles.router'));

export default router;
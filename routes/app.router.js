import { Router } from 'express';
import appController from '../controllers/app.controller.js';

const router = Router();

// GET App Version
router.get('/version', appController.getAppVersion);

export default router;
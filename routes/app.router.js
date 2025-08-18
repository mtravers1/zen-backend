import { Router } from 'express';
import appController from '../controllers/app.controller.js';
import { clearFailedDecryptionCacheMiddleware } from '../middlewares/structuredLogging.js';

const router = Router();

// GET App Version
router.get('/version', appController.getAppVersion);

// POST Clear Failed Decryption Cache (Admin only)
router.post('/clear-decryption-cache', clearFailedDecryptionCacheMiddleware);

export default router;
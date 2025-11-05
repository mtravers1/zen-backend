import { Router } from "express";
import subscriptionsController from "../controllers/subscriptions.controller.js";

const router = Router();

router.get("/plans", subscriptionsController.getAvailablePlans);

export default router;

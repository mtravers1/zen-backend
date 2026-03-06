import { Router } from "express";
import { getInsightsSummary, getClientPerformance } from "../controllers/insights.controller.js";

const router = Router();

router.get("/summary", getInsightsSummary);
router.get("/client-performance", getClientPerformance);

export default router;

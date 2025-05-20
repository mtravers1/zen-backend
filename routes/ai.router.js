import { Router } from "express";
import aiController from "../controllers/ai.controller.js";

const router = Router();

router.post("/", aiController.makeRequest);

export default router;

import { Router } from "express";
import aiController from "../controllers/ai.controller.js";

const router = Router();

router.post("/", aiController.makeRequest);
router.get("/stream", aiController.stream);
router.get("/test", aiController.test);

export default router;

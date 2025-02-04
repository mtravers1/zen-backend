import { Router } from "express";
import businessController from "../controllers/businesses.controller.js";

const router = Router();

router.post("/add-business", businessController.addBusiness);

export default router;

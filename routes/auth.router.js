import { Router } from "express";
import authController from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", authController.signUp);
router.post("/signin", authController.signIn);
router.post("/check-email", authController.checkEmail);
router.get("/own", authController.own);

export default router;

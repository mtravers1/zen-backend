import { Router } from "express";
import roleController from "../controllers/role.controller.js";

const router = Router();

router.patch("/users/:userId/role", roleController.updateUserRole);

export default router;
import { Router } from "express";
import userController from "../controllers/user.controller.js";

const router = Router();

/* GET users listing for admin interface */
router.get("/", userController.listUsers);

/* GET user by ID for admin interface */
router.get("/:userId", userController.getUserById);

/* PUT update user method/provider */
router.put("/:userId/method", userController.updateUserMethod);

/* PATCH update user info (firstName, lastName, etc.) */
router.patch("/:userId", userController.updateUserInfo);

/* GET current user session info (for compatibility) */
router.get("/getMyUser", userController.getMyUser);

/* POST check user permission (for compatibility) */
router.post("/checkPermission", userController.checkUserPermission);

export default router;

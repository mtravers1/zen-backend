import { Router } from "express";
import {
  getAdminStats,
  listAllUsers,
  getAdminUserById,
  updateUserRole,
  adminDeleteUser,
  getAdminActivity,
  getSystemHealth,
} from "../controllers/admin.controller.js";

const router = Router();

// System
router.get("/health", getSystemHealth);
router.get("/stats", getAdminStats);

// Users
router.get("/users", listAllUsers);
router.get("/users/:userId", getAdminUserById);
router.patch("/users/:userId/role", updateUserRole);
router.delete("/users/:userId", adminDeleteUser);

// Activity
router.get("/activity", getAdminActivity);

export default router;

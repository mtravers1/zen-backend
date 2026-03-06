import { Router } from "express";
import {
  listThreads, getThreadById, createThread, updateThread,
  listMessages, sendMessage, markMessagesRead, deleteMessage,
  listNotifications, markNotificationRead, markAllNotificationsRead, createNotification,
} from "../controllers/communications.controller.js";

const router = Router();

// ── Threads ────────────────────────────────────────────────────
router.get("/threads", listThreads);
router.get("/threads/:id", getThreadById);
router.post("/threads", createThread);
router.patch("/threads/:id", updateThread);

// ── Messages ───────────────────────────────────────────────────
router.get("/threads/:threadId/messages", listMessages);
router.post("/threads/:threadId/messages", sendMessage);
router.post("/threads/:threadId/read", markMessagesRead);
router.delete("/messages/:id", deleteMessage);

// ── Notifications ──────────────────────────────────────────────
router.get("/notifications", listNotifications);
router.post("/notifications", createNotification);
router.patch("/notifications/:id/read", markNotificationRead);
router.post("/notifications/read-all", markAllNotificationsRead);

export default router;

import { Router } from "express";
import messagesController from "../controllers/messages.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", messagesController.getMessages);
router.get("/:id", messagesController.getMessage);
router.post("/", messagesController.createMessage);
router.patch("/:id", messagesController.updateMessage);
router.delete("/:id", messagesController.deleteMessage);

export default router;

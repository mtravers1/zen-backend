import { Router } from "express";
import contactsController from "../controllers/contacts.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", contactsController.getContacts);
router.get("/:id", contactsController.getContact);
router.post("/", contactsController.createContact);
router.put("/:id", contactsController.updateContact);
router.patch("/:id", contactsController.updateContact);
router.delete("/:id", checkStaffRole("account_manager"), contactsController.deleteContact);

export default router;

import { Router } from "express";
import clientsController from "../controllers/clients.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

// All routes require at least executive_assistant (any staff)
router.use(checkStaffRole("executive_assistant"));

router.get("/", clientsController.getClients);
router.get("/:id", clientsController.getClient);
router.post("/", clientsController.createClient);
router.put("/:id", clientsController.updateClient);
router.patch("/:id", clientsController.updateClient);
router.delete("/:id", checkStaffRole("account_manager"), clientsController.deleteClient);

export default router;

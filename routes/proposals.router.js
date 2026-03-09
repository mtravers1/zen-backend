import { Router } from "express";
import proposalsController from "../controllers/proposals.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", proposalsController.getProposals);
router.get("/:id", proposalsController.getProposal);
router.post("/", proposalsController.createProposal);
router.put("/:id", proposalsController.updateProposal);
router.patch("/:id", proposalsController.updateProposal);
router.delete("/:id", checkStaffRole("account_manager"), proposalsController.deleteProposal);

export default router;

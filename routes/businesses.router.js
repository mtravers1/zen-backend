import { Router } from "express";
import businessController from "../controllers/businesses.controller.js";

const router = Router();

router.post("/", businessController.addBusiness);
router.get("/", businessController.getUserProfiles);
router.post("/assign", businessController.assignsAccountsToProfiles);
router.post("/unlink", businessController.unlinkAccounts);

export default router;

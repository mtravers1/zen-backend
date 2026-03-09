import { Router } from "express";
import offersController from "../controllers/offers.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

// Any authenticated staff can view offers
router.use(checkStaffRole("executive_assistant"));

router.get("/", offersController.getOffers);
router.get("/:id", offersController.getOffer);

// Only managers+ can create/update offers
router.post("/", checkStaffRole("account_manager"), offersController.createOffer);
router.put("/:id", checkStaffRole("account_manager"), offersController.updateOffer);
router.patch("/:id", checkStaffRole("account_manager"), offersController.updateOffer);
router.delete("/:id", checkStaffRole("director"), offersController.deleteOffer);

export default router;

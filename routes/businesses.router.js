import { Router } from "express";
import businessController from "../controllers/businesses.controller.js";

const router = Router();

router.post("/", businessController.addBusiness);
router.post("/create", businessController.addBusiness);
router.get("/", businessController.getUserProfiles);
router.post("/assign", businessController.assignsAccountsToProfiles);
router.post("/unlink", businessController.unlinkAccounts);
router.post("/assign-account", businessController.assignAccountToProfile);
router.put(
  "/profile/update/:profileId",
  businessController.updateBusinessProfile,
);
router.delete("/profile/delete/:profileId", businessController.deleteProfile);

export default router;

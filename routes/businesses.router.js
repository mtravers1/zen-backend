import { Router } from "express";
import businessController from "../controllers/businesses.controller.js";
import { checkPlanLimit } from "../middlewares/planLimitsCheck.js";

import sanitizeRequestBody from "../middlewares/sanitizeRequestBody.js";

const router = Router();

router.post("/", checkPlanLimit('businesses_max'), businessController.addBusiness);
router.post("/create", checkPlanLimit('businesses_max'), businessController.addBusiness);
router.get("/", businessController.getUserProfiles);
router.get("/check-add-business", businessController.checkAddBusiness);
router.post("/assign", businessController.assignsAccountsToProfiles);
router.post("/unlink", businessController.unlinkAccounts);
router.post("/assign-account", businessController.assignAccountToProfile);
router.patch(
  "/profile/update/:profileId",
  sanitizeRequestBody,
  businessController.updateBusinessProfile,
);
router.delete(
  "/profile/delete/:profileId",
  businessController.deleteProfile,
);

export default router;

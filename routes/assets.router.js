import { Router } from "express";
import assetsController from "../controllers/assets.controller.js";

const router = Router();

router.post("/addAsset", assetsController.addAsset);
router.get("/getAssets", assetsController.getAssets);
router.post("/updateAsset", assetsController.updateAsset);
router.post("/deleteAsset", assetsController.deleteAsset);

export default router;

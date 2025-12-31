import { Router } from "express";
import filesController from "../controllers/files.controller.js";

const router = Router();

router.post("/addFile", filesController.addFile);
router.get("/getFiles/:profileId", filesController.getFiles);
router.get("/check-limit", filesController.checkStorageLimit);
router.get("/storage-status", filesController.getStorageStatus);
router.get("/getFolders/:profileId", filesController.getFolders);
router.post("/add-file", filesController.generateFileUrl);
router.get("/:fileId/signed-url", filesController.getSignedUrlForFile);

// TODO: Deprecate this route in favor of GET /:fileId/signed-url
router.get("/:userId/:fileId/signed-url", filesController.getSignedUrlForFile);
router.post("/add-image", filesController.generateImageUrl);
router.post("/delete-file", filesController.deleteFiles);

export default router;

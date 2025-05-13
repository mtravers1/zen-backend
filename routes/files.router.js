import { Router } from "express";
import filesController from "../controllers/files.controller.js";

const router = Router();

router.post("/addFile", filesController.addFile);
router.get("/getFiles", filesController.getFiles);
router.post("/add-file", filesController.generateFileUrl);
router.post("/get-file", filesController.getFileUrl);
router.post("/add-image", filesController.genereteImageUrl);
router.post("/delete-file", filesController.deleteFiles);

export default router;

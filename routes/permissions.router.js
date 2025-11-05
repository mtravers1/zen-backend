import { Router } from "express";
import permissionController from "../controllers/permissions.controller.js";

const router = Router();

router.get("/check", permissionController.checkUserPermission);
router.get("/", (req, res) => {
  return res.status(200).json({
    message:
      "API for cheking permissions, send the corresponding calues to /check with querry values of the permisssionKey and email from the user you want to check",
  });
});

export default router;

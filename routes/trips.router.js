import { Router } from "express";
import tripsController from "../controllers/trips.controller.js";

const router = Router();

// Crear un nuevo trip
router.post("/", tripsController.createTrip);

//get trips
router.get("/", tripsController.getFilteredTrips);
router.get("/lastvehicle", tripsController.getLatVehicleUsed);

///sync endpoints
router.put("/:tripId", tripsController.updateTrip);
router.delete("/:tripId", tripsController.deleteTrip);

export default router;

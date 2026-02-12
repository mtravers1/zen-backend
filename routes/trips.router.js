import { Router } from "express";
import tripsController from "../controllers/trips.controller.js";

const router = Router();

router.get("/check-limit", tripsController.checkTripLimit);

//get trips
router.get("/", tripsController.getFilteredTrips);
router.get("/lastvehicle", tripsController.getLatVehicleUsed);

// According to the spec, this is the primary endpoint for syncing trip data.
// It handles both creating a new trip and appending data to an existing one.
router.put("/:tripId", tripsController.upsertTrip);

router.delete("/:tripId", tripsController.deleteTrip);

export default router;

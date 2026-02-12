import tripService from "../services/trips.service.js";
import permissionsService from "../services/permissions.service.js";

const upsertTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const uid = req.user.uid;

    // Permission check can be done here before upserting
    const canCreateOrUpdateTrip = await permissionsService.canPerformAction(
      uid,
      "create_trip", // Assuming same permission for create and update
    );

    if (!canCreateOrUpdateTrip.success) {
      return res.status(403).send(canCreateOrUpdateTrip);
    }

    const trip = await tripService.upsertTrip(tripId, req.body, uid);
    res.status(200).json(trip);
  } catch (error) {
    console.error("Error upserting trip:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getFilteredTrips = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { trips, totalMiles } = await tripService.fetchFilteredTrips(req.query, uid);
    res.json({ trips, totalMiles });
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({ error: "Error al obtener los viajes" });
  }
};

const getLatVehicleUsed = async (req, res) => {
  try {
    const uid = req.user.uid;
    const trips = await tripService.getLastVehicleIdUsed(uid);
    res.json(trips);
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({ error: "Error al obtener los viajes" });
  }
};

const deleteTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const deleted = await tripService.deleteTrip(tripId);
    if (!deleted) {
      return res.status(404).json({ error: "Trip not found" });
    }
    res.json({ message: "Trip deleted successfully" });
  } catch (error) {
    console.error("Error deleting trip:", error);
    res.status(500).json({ error: "Error al eliminar el viaje" });
  }
};

const checkTripLimit = async (req, res) => {
  try {
    const uid = req.user.uid;

    const canCreateTrip = await permissionsService.canPerformAction(
      uid,
      "create_trip",
    );

    if (canCreateTrip.success) {
      return res.status(200).send({ success: true });
    } else {
      return res.status(403).send(canCreateTrip);
    }
  } catch (error) {
    console.error("Error checking trip limit:", error);
    res.status(500).send({ error: "Internal server error" });
  }
};

const recalculateMileage = async (req, res) => {
  try {
    const { tripId } = req.params;
    const uid = req.user.uid;
    const recalculatedMiles = await tripService.recalculateMileage(tripId, uid);
    res.json({ recalculatedMiles });
  } catch (error) {
    console.error("Error recalculating mileage:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const tripsController = {
  upsertTrip,
  getFilteredTrips,
  deleteTrip,
  getLatVehicleUsed,
  checkTripLimit,
  recalculateMileage,
};

export default tripsController;

import tripService from "../services/trips.service.js";
import permissionsService from "../services/permissions.service.js";

const createTrip = async (req, res) => {
  try {
    const { locations, totalMiles, metadata, userId } = req.body;
    const email = req.user.email;
    const uid = req.user.uid;

    if (!locations || totalMiles < 0 || !metadata) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const canCreateTrip = await permissionsService.canPerformAction(
      uid,
      "create_trip",
    );

    if (!canCreateTrip.success) {
      return res.status(403).send(canCreateTrip);
    }

    const trip = await tripService.saveTrip({
      user: userId,
      locations,
      totalMiles,
      metadata,
      email,
      uid,
    });
    res.status(201).json(trip);
  } catch (error) {
    console.error("Error creating trip:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getFilteredTrips = async (req, res) => {
  try {
    const uid = req.user.uid;
    const trips = await tripService.fetchFilteredTrips(req.query, uid);
    res.json(trips);
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

const updateTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const uid = req.user.uid;
    const updatedTrip = await tripService.updateTrip(tripId, req.body, uid);
    if (!updatedTrip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    res.json(updatedTrip);
  } catch (error) {
    console.error("Error updating trip:", error);
    res.status(500).json({ error: "Error al actualizar el viaje" });
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

const partialUpdateTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const uid = req.user.uid;
    const updatedTrip = await tripService.partialUpdateTrip(tripId, req.body, uid);
    if (!updatedTrip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    res.json(updatedTrip);
  } catch (error) {
    console.error("Error partially updating trip:", error);
    res.status(500).json({ error: "Error updating trip" });
  }
};

const tripsController = {
  createTrip,
  getFilteredTrips,
  updateTrip,
  deleteTrip,
  getLatVehicleUsed,
  checkTripLimit,
  partialUpdateTrip,
};

export default tripsController;

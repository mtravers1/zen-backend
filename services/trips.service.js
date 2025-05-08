import mongoose from "mongoose";
import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";
import Business from "../database/models/Businesses.js";
import Trips from "../database/models/Trips.js";
import User from "../database/models/User.js";

const saveTrip = async ({
  user,
  locations,
  totalMiles,
  metadata,
  email,
  uid,
}) => {
  const dek = await getUserDek(uid);

  const encryptedLocations = await Promise.all(
    locations.map(async (loc) => ({
      latitude: await encryptValue(loc.latitude.toString(), dek),
      longitude: await encryptValue(loc.longitude.toString(), dek),
    }))
  );

  const encryptedMetadata = {
    ...metadata,
    placeName: metadata.placeName
      ? await encryptValue(metadata.placeName, dek)
      : undefined,
    pickupAddress: metadata.pickupAddress
      ? await encryptValue(metadata.pickupAddress, dek)
      : undefined,
    dropoffAddress: metadata.dropoffAddress
      ? await encryptValue(metadata.dropoffAddress, dek)
      : undefined,
  };

  const trip = new Trips({
    user,
    locations: encryptedLocations,
    totalMiles,
    metadata: encryptedMetadata,
  });
  return await trip.save();
};

const fetchFilteredTrips = async (query, uid) => {
  const {
    profileId,
    userId,
    search,
    vehicleId,
    minMiles,
    maxMiles,
    dateRange,
  } = query;

  const user = await User.findOne({
    authUid: uid,
  });

  const dek = await getUserDek(uid);

  const filter = {};

  if (profileId) filter["metadata.profile"] = profileId;
  if (userId) filter.userId = userId;
  if (vehicleId) {
    console.log("CALIdD vehicle", vehicleId);
    const vehicleObjId = mongoose.Types.ObjectId.isValid(vehicleId)
      ? new mongoose.Types.ObjectId(vehicleId)
      : null;

    filter.$or = [
      { "metadata.vehicle": vehicleId },
      ...(vehicleObjId ? [{ "metadata.vehicle": vehicleObjId }] : []),
    ];
  }

  if (minMiles || maxMiles) {
    filter.totalMiles = {};
    if (minMiles) filter.totalMiles.$gte = Number(minMiles);
    if (maxMiles) filter.totalMiles.$lte = Number(maxMiles);
  }

  if (dateRange) {
    const [start, end] = dateRange.split("<");
    const startDate = new Date(start.trim());
    const endDate = new Date(end.trim());

    if (startDate && endDate) {
      filter["metadata.dateTime"] = {
        $gte: startDate.toISOString(),
        $lte: endDate.toISOString(),
      };
    }
  }

  try {
    const shouldPopulateVehicle = mongoose.Types.ObjectId.isValid(vehicleId);
    filter.user = user._id;

    const tripsQuery = Trips.find(filter);
    if (shouldPopulateVehicle) {
      tripsQuery.populate("metadata.vehicle");
    }
    const trips = await tripsQuery.lean();

    const populatedTrips = await Promise.all(
      trips.map(async (trip) => {
        const profileId = trip.metadata?.profile;
        let profileData = null;
        let setting = null;

        if (profileId) {
          profileData = await Business.findById(profileId).lean();
          if (!profileData) {
            profileData = await User.findById(profileId).lean();
            const first = await decryptValue(profileData.name.firstName, dek);
            const middle = profileData.name?.middleName
              ? " " +
                (await decryptValue(profileData.name.middleName, dek)) +
                " "
              : " ";
            const last = await decryptValue(profileData.name.lastName, dek);

            setting = {
              name: first + middle + last,
              _id: profileData._id,
              type: "personal",
            };
          } else {
            const name = await decryptValue(profileData.name, dek);
            setting = {
              name: name,
              _id: profileData._id,
              type: "business",
            };
          }
        }

        // Desencriptar metadata fields
        const decryptedMetadata = {
          ...trip.metadata,
          placeName: trip.metadata.placeName
            ? await decryptValue(trip.metadata.placeName, dek)
            : undefined,
          pickupAddress: trip.metadata.pickupAddress
            ? await decryptValue(trip.metadata.pickupAddress, dek)
            : undefined,
          dropoffAddress: trip.metadata.dropoffAddress
            ? await decryptValue(trip.metadata.dropoffAddress, dek)
            : undefined,
          profileData: setting,
        };

        // Desencriptar coordenadas
        const decryptedLocations = await Promise.all(
          trip.locations.map(async (loc) => ({
            latitude: loc.latitude
              ? parseFloat(await decryptValue(loc.latitude, dek))
              : null,
            longitude: loc.longitude
              ? parseFloat(await decryptValue(loc.longitude, dek))
              : null,
          }))
        );

        return {
          ...trip,
          locations: decryptedLocations,
          metadata: decryptedMetadata,
        };
      })
    );

    const filteredTrips = search
      ? populatedTrips.filter((trip) => {
          const lowerSearch = search.toLowerCase();

          const { placeName, pickupAddress, dropoffAddress } = trip.metadata;
          return (
            (placeName && placeName.toLowerCase().includes(lowerSearch)) ||
            (pickupAddress &&
              pickupAddress.toLowerCase().includes(lowerSearch)) ||
            (dropoffAddress &&
              dropoffAddress.toLowerCase().includes(lowerSearch))
          );
        })
      : populatedTrips;
    return filteredTrips;
  } catch (err) {
    console.error("Error al obtener los viajes filtrados:", err);
    throw err;
  }
};

const getLastVehicleIdUsed = async (uid) => {
  try {
    const user = await User.findOne({ authUid: uid });
    if (!user) throw new Error("Usuario no encontrado");

    // Buscar los trips más recientes del usuario con vehicle válido
    const trips = await Trips.find({
      user: user._id,
      "metadata.vehicle": { $exists: true, $ne: null, $ne: "Other" },
    })
      .sort({ "metadata.dateTime": -1 }) // orden descendente por fecha
      .limit(1) // solo el más reciente
      .lean();

    const lastTrip = trips[0];

    // Verificamos que tenga un vehicle válido
    if (!lastTrip || !lastTrip.metadata?.vehicle) return null;

    const vehicle = lastTrip.metadata.vehicle;
    return typeof vehicle === "string"
      ? vehicle
      : vehicle._id?.toString() || null;
  } catch (err) {
    console.error("Error al obtener el último vehicle ID:", err);
    throw err;
  }
};

const updateTrip = async (tripId, updateData, uid) => {
  const dek = await getUserDek(uid);

  const encryptedData = { ...updateData };

  // Encriptar locations si vienen
  if (updateData.locations) {
    encryptedData.locations = await Promise.all(
      updateData.locations.map(async (loc) => ({
        latitude: await encryptValue(loc.latitude.toString(), dek),
        longitude: await encryptValue(loc.longitude.toString(), dek),
      }))
    );
  }

  // Encriptar metadata si viene
  if (updateData.metadata) {
    const encryptedMetadata = { ...updateData.metadata };

    if (updateData.metadata.placeName) {
      encryptedMetadata.placeName = await encryptValue(
        updateData.metadata.placeName,
        dek
      );
    }

    if (updateData.metadata.pickupAddress) {
      encryptedMetadata.pickupAddress = await encryptValue(
        updateData.metadata.pickupAddress,
        dek
      );
    }

    if (updateData.metadata.dropoffAddress) {
      encryptedMetadata.dropoffAddress = await encryptValue(
        updateData.metadata.dropoffAddress,
        dek
      );
    }

    encryptedData.metadata = encryptedMetadata;
  }

  return Trips.findByIdAndUpdate(tripId, encryptedData, { new: true });
};

const deleteTrip = async (tripId) => {
  const deletedTrip = await Trips.findByIdAndDelete(tripId);
  return deletedTrip;
};

const tripService = {
  saveTrip,
  fetchFilteredTrips,
  updateTrip,
  deleteTrip,
  getLastVehicleIdUsed,
};
export default tripService;

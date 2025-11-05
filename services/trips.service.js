import mongoose from "mongoose";
import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";
import Business from "../database/models/Businesses.js";
import Trips from "../database/models/Trips.js";
import User from "../database/models/User.js";

import {
  createSafeEncrypt,
  createSafeDecrypt,
} from "../lib/encryptionHelper.js";

const saveTrip = async ({
  user,
  locations,
  totalMiles,
  metadata,
  email,
  uid,
}) => {
  const dek = await getUserDek(uid);
  const safeEncrypt = createSafeEncrypt(uid);

  const encryptedLocations = await Promise.all(
    locations.map(async (loc) => ({
      latitude: await safeEncrypt(loc.latitude.toString(), dek, {
        field: "latitude",
      }),
      longitude: await safeEncrypt(loc.longitude.toString(), dek, {
        field: "longitude",
      }),
    })),
  );

  const encryptedMetadata = {
    ...metadata,
    placeName: metadata.placeName
      ? await safeEncrypt(metadata.placeName, dek, { field: "placeName" })
      : undefined,
    pickupAddress: metadata.pickupAddress
      ? await safeEncrypt(metadata.pickupAddress, dek, {
          field: "pickupAddress",
        })
      : undefined,
    dropoffAddress: metadata.dropoffAddress
      ? await safeEncrypt(metadata.dropoffAddress, dek, {
          field: "dropoffAddress",
        })
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
  const safeDecrypt = createSafeDecrypt(uid);

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
            const first = await safeDecrypt(profileData.name.firstName, dek, {
              trip_id: trip._id,
              field: "firstName",
            });
            const middle = profileData.name?.middleName
              ? " " +
                (await safeDecrypt(profileData.name.middleName, dek, {
                  trip_id: trip._id,
                  field: "middleName",
                })) +
                " "
              : " ";
            const last = await safeDecrypt(profileData.name.lastName, dek, {
              trip_id: trip._id,
              field: "lastName",
            });

            setting = {
              name: first + middle + last,
              _id: profileData._id,
              type: "personal",
            };
          } else {
            const name = await safeDecrypt(profileData.name, dek, {
              trip_id: trip._id,
              field: "name",
            });
            setting = {
              name: name,
              _id: profileData._id,
              type: "business",
            };
          }
        }

        // Decrypt metadata fields
        const decryptedMetadata = {
          ...trip.metadata,
          placeName: trip.metadata.placeName
            ? await safeDecrypt(trip.metadata.placeName, dek, {
                trip_id: trip._id,
                field: "placeName",
              })
            : undefined,
          pickupAddress: trip.metadata.pickupAddress
            ? await safeDecrypt(trip.metadata.pickupAddress, dek, {
                trip_id: trip._id,
                field: "pickupAddress",
              })
            : undefined,
          dropoffAddress: trip.metadata.dropoffAddress
            ? await safeDecrypt(trip.metadata.dropoffAddress, dek, {
                trip_id: trip._id,
                field: "dropoffAddress",
              })
            : undefined,
          profileData: setting,
        };

        // Decrypt coordinates
        const decryptedLocations = await Promise.all(
          trip.locations.map(async (loc) => ({
            latitude: loc.latitude
              ? parseFloat(
                  await safeDecrypt(loc.latitude, dek, {
                    trip_id: trip._id,
                    field: "latitude",
                  }),
                )
              : null,
            longitude: loc.longitude
              ? parseFloat(
                  await safeDecrypt(loc.longitude, dek, {
                    trip_id: trip._id,
                    field: "longitude",
                  }),
                )
              : null,
          })),
        );

        return {
          ...trip,
          locations: decryptedLocations,
          metadata: decryptedMetadata,
        };
      }),
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

    // Find the most recent trips of the user with a valid vehicle
    const trips = await Trips.find({
      user: user._id,
      "metadata.vehicle": { $exists: true, $ne: null, $ne: "Other" },
    })
      // Sort descending by date
      .sort({ "metadata.dateTime": -1 })
      // Only the most recent
      .limit(1)
      .lean();

    const lastTrip = trips[0];

    // Check that it has a valid vehicle
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
  const safeEncrypt = createSafeEncrypt(uid);

  const encryptedData = { ...updateData };

  // Encrypt locations if provided
  if (updateData.locations) {
    encryptedData.locations = await Promise.all(
      updateData.locations.map(async (loc) => ({
        latitude: await safeEncrypt(loc.latitude.toString(), dek, {
          trip_id: tripId,
          field: "latitude",
        }),
        longitude: await safeEncrypt(loc.longitude.toString(), dek, {
          trip_id: tripId,
          field: "longitude",
        }),
      })),
    );
  }

  // Encrypt metadata if provided
  if (updateData.metadata) {
    const encryptedMetadata = { ...updateData.metadata };

    if (updateData.metadata.placeName) {
      encryptedMetadata.placeName = await safeEncrypt(
        updateData.metadata.placeName,
        dek,
        { trip_id: tripId, field: "placeName" },
      );
    }

    if (updateData.metadata.pickupAddress) {
      encryptedMetadata.pickupAddress = await safeEncrypt(
        updateData.metadata.pickupAddress,
        dek,
        { trip_id: tripId, field: "pickupAddress" },
      );
    }

    if (updateData.metadata.dropoffAddress) {
      encryptedMetadata.dropoffAddress = await safeEncrypt(
        updateData.metadata.dropoffAddress,
        dek,
        { trip_id: tripId, field: "dropoffAddress" },
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

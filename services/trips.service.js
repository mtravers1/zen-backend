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
import haversine from "../utils/haversine.js";

// Helper function to decrypt and enrich a single trip
const _decryptAndEnrichTrip = async (trip, safeDecrypt) => {
  const encryptedProfileId = trip.metadata?.profile;
  let profileData = null;
  let setting = null;
  let profileId = null;

  if (encryptedProfileId) {
    try {
        profileId = await safeDecrypt(encryptedProfileId, { trip_id: trip._id, field: "profile" });
    } catch (e) {
        console.warn(`Could not decrypt profileId for trip ${trip._id}, assuming it might be plaintext.`);
        profileId = encryptedProfileId; // Assume it's already decrypted or handle as needed
    }

    if (mongoose.Types.ObjectId.isValid(profileId)) {
        profileData = await Business.findById(profileId).lean();
        if (!profileData) {
            profileData = await User.findById(profileId).lean();
            const first = await safeDecrypt(profileData.name.firstName, {
                trip_id: trip._id,
                field: "firstName",
            });
            const middle = profileData.name?.middleName
                ? " " +
                  (await safeDecrypt(profileData.name.middleName, {
                    trip_id: trip._id,
                    field: "middleName",
                  })) +
                  " "
                : " ";
            const last = await safeDecrypt(profileData.name.lastName, {
                trip_id: trip._id,
                field: "lastName",
            });

            setting = {
                name: first + middle + last,
                _id: profileData._id,
                type: "personal",
            };
        } else {
            const name = await safeDecrypt(profileData.name, {
                trip_id: trip._id,
                field: "name",
            });
            setting = {
                name: name,
                _id: profileData._id,
                type: "business",
            };
        }
    } else {
        console.warn(`Invalid ObjectId for profileId after decryption attempt: ${profileId}`);
    }
  }

  // Decrypt metadata fields
  const decryptedMetadata = {
    ...trip.metadata,
    profile: profileId,
    placeName: trip.metadata.placeName
      ? await safeDecrypt(trip.metadata.placeName, {
          trip_id: trip._id,
          field: "placeName",
        })
      : undefined,
    pickupAddress: trip.metadata.pickupAddress
      ? await safeDecrypt(trip.metadata.pickupAddress, {
          trip_id: trip._id,
          field: "pickupAddress",
        })
      : undefined,
    dropoffAddress: trip.metadata.dropoffAddress
      ? await safeDecrypt(trip.metadata.dropoffAddress, {
          trip_id: trip._id,
          field: "dropoffAddress",
        })
      : undefined,
    description: trip.metadata.description
      ? await safeDecrypt(trip.metadata.description, {
          trip_id: trip._id,
          field: "description",
        })
      : undefined,
    purpose: trip.metadata.purpose
      ? await safeDecrypt(trip.metadata.purpose, {
          trip_id: trip._id,
          field: "purpose",
        })
      : undefined,
    other: trip.metadata.other
      ? await safeDecrypt(trip.metadata.other, {
          trip_id: trip._id,
          field: "other",
        })
      : undefined,
    dateTime: trip.metadata.dateTime
      ? new Date(await safeDecrypt(trip.metadata.dateTime, {
          trip_id: trip._id,
          field: "dateTime",
        }))
      : undefined,
    vehicle: trip.metadata.vehicle
      ? await safeDecrypt(trip.metadata.vehicle, {
          trip_id: trip._id,
          field: "vehicle",
        })
      : undefined,
    profileData: setting,
  };

  const decryptedLocations = await Promise.all(
    trip.locations.map(async (loc) => ({
      latitude: loc.latitude
        ? parseFloat(
            await safeDecrypt(loc.latitude, {
              trip_id: trip._id,
              field: "latitude",
            }),
          )
        : null,
      longitude: loc.longitude
        ? parseFloat(
            await safeDecrypt(loc.longitude, {
              trip_id: trip._id,
              field: "longitude",
            }),
          )
        : null,
      timestamp: loc.timestamp
        ? await safeDecrypt(loc.timestamp, {
            trip_id: trip._id,
            field: "timestamp",
          })
        : null,
    })),
  );

  return {
    ...trip,
    locations: decryptedLocations,
    metadata: decryptedMetadata,
  };
};

const upsertTrip = async (clientTripId, tripData, uid) => {
    if (tripData.metadata && tripData.metadata.profileData) {
        delete tripData.metadata.profileData;
    }

    const dek = await getUserDek(uid);
    const safeEncrypt = createSafeEncrypt(uid, dek);
    const safeDecrypt = createSafeDecrypt(uid, dek);

    const existingTrip = await Trips.findOne({ clientTripId }).lean();

    const { totalMiles, mileageManuallyEdited: isManualEdit, ...restOfTripData } = tripData;

    if (existingTrip) {
        // UPDATE (APPEND)
        const updateObject = { $set: {} };

        // Handle locations
        if (restOfTripData.locations) {
            const decryptedLocations = await Promise.all(
                existingTrip.locations.map(async (loc) => ({
                    latitude: parseFloat(await safeDecrypt(loc.latitude, { trip_id: existingTrip._id.toString(), field: "latitude" })),
                    longitude: parseFloat(await safeDecrypt(loc.longitude, { trip_id: existingTrip._id.toString(), field: "longitude" })),
                    timestamp: loc.timestamp ? await safeDecrypt(loc.timestamp, { trip_id: existingTrip._id.toString(), field: 'timestamp' }) : undefined,
                })),
            );

            const existingTimestamps = new Set(decryptedLocations.map(loc => loc.timestamp));
            const newUniqueLocations = restOfTripData.locations.filter(loc => !existingTimestamps.has(loc.timestamp.toString()));
            const newLocations = decryptedLocations.concat(newUniqueLocations);

            updateObject.$set.locations = await Promise.all(
                newLocations.map(async (loc) => ({
                    latitude: await safeEncrypt(loc.latitude.toString(), { trip_id: existingTrip._id.toString(), field: "latitude" }),
                    longitude: await safeEncrypt(loc.longitude.toString(), { trip_id: existingTrip._id.toString(), field: "longitude" }),
                    timestamp: loc.timestamp ? await safeEncrypt(loc.timestamp.toString(), { trip_id: existingTrip._id.toString(), field: "timestamp" }) : undefined,
                })),
            );
            
            if (!isManualEdit) {
                updateObject.$set.totalMiles = haversine.calculateTotalMiles(newLocations);
                updateObject.$set.mileageManuallyEdited = false;
            }
        }
        
        if (isManualEdit && totalMiles !== undefined) {
            updateObject.$set.totalMiles = totalMiles;
            updateObject.$set.mileageManuallyEdited = true;
            updateObject.$set.mileageEditedAt = new Date();
        } else if (isManualEdit === false) { 
            const locationsForCalc = updateObject.$set.locations ? 
                (await Promise.all(updateObject.$set.locations.map(async loc => ({...loc, latitude: await safeDecrypt(loc.latitude, {trip_id: existingTrip._id.toString(), field: 'latitude'}), longitude: await safeDecrypt(loc.longitude, {trip_id: existingTrip._id.toString(), field: 'longitude'}) })))) :
                (await Promise.all(existingTrip.locations.map(async loc => ({...loc, latitude: await safeDecrypt(loc.latitude, {trip_id: existingTrip._id.toString(), field: 'latitude'}), longitude: await safeDecrypt(loc.longitude, {trip_id: existingTrip._id.toString(), field: 'longitude'}) }))));
            updateObject.$set.totalMiles = haversine.calculateTotalMiles(locationsForCalc);
            updateObject.$set.mileageManuallyEdited = false;
        }

        // Handle metadata (merge)
        if (restOfTripData.metadata) {
            const decryptedMetadata = {};
            if (existingTrip.metadata) {
                for (const key in existingTrip.metadata) {
                    if (Object.prototype.hasOwnProperty.call(existingTrip.metadata, key)) {
                        try {
                            decryptedMetadata[key] = await safeDecrypt(existingTrip.metadata[key], { trip_id: existingTrip._id.toString(), field: key });
                        } catch (error) {
                            console.warn(`Could not decrypt metadata.${key}, leaving as is.`);
                            decryptedMetadata[key] = existingTrip.metadata[key];
                        }
                    }
                }
            }

            const mergedMetadata = { ...decryptedMetadata, ...restOfTripData.metadata };

            const encryptedMetadata = {};
            for (const key in mergedMetadata) {
                if (Object.prototype.hasOwnProperty.call(mergedMetadata, key) && mergedMetadata[key] != null) {
                    if (key === "initialMileage" || key === "endMileage") {
                        encryptedMetadata[key] = mergedMetadata[key];
                    } else {
                        encryptedMetadata[key] = await safeEncrypt(mergedMetadata[key].toString(), { trip_id: existingTrip._id.toString(), field: key });
                    }
                }
            }
            updateObject.$set.metadata = encryptedMetadata;
        }

        const updatedDoc = await Trips.findOneAndUpdate({ clientTripId }, updateObject, { new: true }).lean();
        return _decryptAndEnrichTrip(updatedDoc, safeDecrypt);

    } else {
        // CREATE
        const user = await User.findOne({ authUid: uid }).lean();
        if (!user) {
            throw new Error("User not found");
        }

        const newMongoId = new mongoose.Types.ObjectId();
        const newTripIdForEncryption = newMongoId.toString();

        const locations = restOfTripData.locations || [];
        let finalTotalMiles;
        let mileageManuallyEdited = false;
        let mileageEditedAt = null;

        if (isManualEdit && totalMiles !== undefined) {
            finalTotalMiles = totalMiles;
            mileageManuallyEdited = true;
            mileageEditedAt = new Date();
        } else {
            finalTotalMiles = haversine.calculateTotalMiles(locations);
        }

        const encryptedLocations = await Promise.all(
            locations.map(async (loc) => ({
                latitude: await safeEncrypt(loc.latitude.toString(), { trip_id: newTripIdForEncryption, field: "latitude" }),
                longitude: await safeEncrypt(loc.longitude.toString(), { trip_id: newTripIdForEncryption, field: "longitude" }),
                timestamp: loc.timestamp ? await safeEncrypt(loc.timestamp.toString(), { trip_id: newTripIdForEncryption, field: "timestamp" }) : undefined,
            })),
        );

        const encryptedMetadata = {};
        if (restOfTripData.metadata) {
            for (const key in restOfTripData.metadata) {
                if (Object.prototype.hasOwnProperty.call(restOfTripData.metadata, key) && restOfTripData.metadata[key] != null) {
                    if (key === "initialMileage" || key === "endMileage") {
                        encryptedMetadata[key] = restOfTripData.metadata[key];
                    } else {
                        encryptedMetadata[key] = await safeEncrypt(restOfTripData.metadata[key].toString(), { trip_id: newTripIdForEncryption, field: `metadata.${key}` });
                    }
                }
            }
        }
        
        const tripToSave = {
            _id: newMongoId,
            clientTripId,
            user: user._id,
            locations: encryptedLocations,
            totalMiles: finalTotalMiles,
            mileageManuallyEdited,
            mileageEditedAt,
            metadata: encryptedMetadata,
        };

        const savedTrip = await Trips.create(tripToSave);
        const leanTrip = savedTrip.toObject();
        return _decryptAndEnrichTrip(leanTrip, safeDecrypt);
    }
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
  const safeDecrypt = createSafeDecrypt(uid, dek);

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
      trips.map(async (trip) => await _decryptAndEnrichTrip(trip, safeDecrypt))
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

    const sumOfTotalMiles = filteredTrips.reduce((sum, trip) => sum + (trip.totalMiles || 0), 0);
    
    return { trips: filteredTrips, totalMiles: sumOfTotalMiles };
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

const deleteTrip = async (idToDelete) => {
  // Check if the provided ID is a valid MongoDB ObjectId
  if (mongoose.Types.ObjectId.isValid(idToDelete)) {
    // If it's a valid ObjectId, it's a legacy trip. Delete by _id.
    return await Trips.findByIdAndDelete(idToDelete);
  } else {
    // Otherwise, assume it's a clientTripId (UUID). Delete by clientTripId.
    return await Trips.findOneAndDelete({ clientTripId: idToDelete });
  }
};

const recalculateMileage = async (tripId, uid) => {
    let trip;
    // Check if tripId could be a valid ObjectId for backward compatibility
    if (mongoose.Types.ObjectId.isValid(tripId)) {
        trip = await Trips.findOne({
            $or: [{ _id: tripId }, { clientTripId: tripId }],
        }).lean();
    } else {
        // If not a valid ObjectId, it can only be a clientTripId
        trip = await Trips.findOne({ clientTripId: tripId }).lean();
    }

    if (!trip) {
        throw new Error("Trip not found");
    }

    const dek = await getUserDek(uid);
    const safeDecrypt = createSafeDecrypt(uid, dek);

    const decryptedLocations = await Promise.all(
        trip.locations.map(async (loc) => ({
            latitude: parseFloat(await safeDecrypt(loc.latitude, { trip_id: trip._id.toString(), field: "latitude" })),
            longitude: parseFloat(await safeDecrypt(loc.longitude, { trip_id: trip._id.toString(), field: "longitude" })),
            timestamp: loc.timestamp ? await safeDecrypt(loc.timestamp, { trip_id: trip._id.toString(), field: 'timestamp' }) : undefined,
        })),
    );

    const recalculatedMiles = haversine.calculateTotalMiles(decryptedLocations);

    return { recalculatedMiles };
};

const tripService = {
  upsertTrip,
  fetchFilteredTrips,
  deleteTrip,
  getLastVehicleIdUsed,
  recalculateMileage,
};
export default tripService;
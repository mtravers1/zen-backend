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

const saveTrip = async ({
  user,
  locations,
  totalMiles,
  metadata,
  email,
  uid,
}) => {
  const calculatedTotalMiles = haversine.calculateTotalMiles(locations);

  const dek = await getUserDek(uid);
  const safeEncrypt = createSafeEncrypt(uid, dek);

  const encryptedLocations = await Promise.all(
    locations.map(async (loc) => ({
      latitude: await safeEncrypt(loc.latitude.toString(), {
        field: "latitude",
      }),
      longitude: await safeEncrypt(loc.longitude.toString(), {
        field: "longitude",
      }),
      timestamp: loc.timestamp ? await safeEncrypt(loc.timestamp.toString(), {
        field: "timestamp",
      }) : undefined,
    })),
  );

  const encryptedMetadata = {
    ...metadata,
    placeName: metadata.placeName
      ? await safeEncrypt(metadata.placeName, { field: "placeName" })
      : undefined,
    pickupAddress: metadata.pickupAddress
      ? await safeEncrypt(metadata.pickupAddress, {
          field: "pickupAddress",
        })
      : undefined,
    dropoffAddress: metadata.dropoffAddress
      ? await safeEncrypt(metadata.dropoffAddress, {
          field: "dropoffAddress",
        })
      : undefined,
    description: metadata.description
      ? await safeEncrypt(metadata.description, { field: "description" })
      : undefined,
    purpose: metadata.purpose
      ? await safeEncrypt(metadata.purpose, { field: "purpose" })
      : undefined,
    other: metadata.other
      ? await safeEncrypt(metadata.other, { field: "other" })
      : undefined,
    dateTime: metadata.dateTime
      ? await safeEncrypt(metadata.dateTime, { field: "dateTime" })
      : undefined,
    vehicle: metadata.vehicle
      ? await safeEncrypt(
          typeof metadata.vehicle === "object" && metadata.vehicle._id
            ? metadata.vehicle._id
            : metadata.vehicle,
          { field: "vehicle" },
        )
      : undefined,
    profile: metadata.profile
      ? await safeEncrypt(metadata.profile, { field: "profile" })
      : undefined,
  };

  const trip = new Trips({
    user,
    locations: encryptedLocations,
    totalMiles: calculatedTotalMiles,
    metadata: encryptedMetadata,
    mileageEditedAt: null,
    mileageManuallyEdited: false,
  });

  try {
    return await trip.save();
  } catch (error) {
    console.error("Error saving trip to database:", error);
    throw error;
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
      trips.map(async (trip) => {
        const encryptedProfileId = trip.metadata?.profile;
        let profileData = null;
        let setting = null;

        if (encryptedProfileId) {
          const profileId = await safeDecrypt(encryptedProfileId, { trip_id: trip._id, field: "profile" });
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
        }

        // Decrypt metadata fields
        const decryptedMetadata = {
          ...trip.metadata,
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

const updateTrip = async (tripId, updateData, uid) => {
  const dek = await getUserDek(uid);
  const safeEncrypt = createSafeEncrypt(uid, dek);

  const encryptedData = { ...updateData };

  // Encrypt locations if provided
  if (updateData.locations) {
    encryptedData.locations = await Promise.all(
      updateData.locations.map(async (loc) => ({
        latitude: await safeEncrypt(loc.latitude.toString(), {
          trip_id: tripId,
          field: "latitude",
        }),
        longitude: await safeEncrypt(loc.longitude.toString(), {
          trip_id: tripId,
          field: "longitude",
        }),
        timestamp: loc.timestamp ? await safeEncrypt(loc.timestamp.toString(), {
          trip_id: tripId,
          field: "timestamp",
        }) : undefined,
      })),
    );
    encryptedData.totalMiles = haversine.calculateTotalMiles(updateData.locations);
    encryptedData.mileageEditedAt = null;
    encryptedData.mileageManuallyEdited = false;
  } else if (updateData.totalMiles !== undefined) {
    // Manual update of totalMiles
    encryptedData.totalMiles = updateData.totalMiles;
    encryptedData.mileageEditedAt = new Date();
    encryptedData.mileageManuallyEdited = true;
  }

  // Encrypt metadata if provided
  if (updateData.metadata) {
    const encryptedMetadata = { ...updateData.metadata };

    if (updateData.metadata.placeName) {
      encryptedMetadata.placeName = await safeEncrypt(
        updateData.metadata.placeName,
        { trip_id: tripId, field: "placeName" },
      );
    }

    if (updateData.metadata.pickupAddress) {
      encryptedMetadata.pickupAddress = await safeEncrypt(
        updateData.metadata.pickupAddress,
        { trip_id: tripId, field: "pickupAddress" },
      );
    }

    if (updateData.metadata.dropoffAddress) {
      encryptedMetadata.dropoffAddress = await safeEncrypt(
        updateData.metadata.dropoffAddress,
        { trip_id: tripId, field: "dropoffAddress" },
      );
    }

    if (updateData.metadata.description) {
      encryptedMetadata.description = await safeEncrypt(
        updateData.metadata.description,
        { trip_id: tripId, field: "description" },
      );
    }

    if (updateData.metadata.purpose) {
      encryptedMetadata.purpose = await safeEncrypt(
        updateData.metadata.purpose,
        { trip_id: tripId, field: "purpose" },
      );
    }

    if (updateData.metadata.other) {
      encryptedMetadata.other = await safeEncrypt(
        updateData.metadata.other,
        { trip_id: tripId, field: "other" },
      );
    }

    if (updateData.metadata.dateTime) {
      encryptedMetadata.dateTime = await safeEncrypt(
        updateData.metadata.dateTime.toString(),
        { trip_id: tripId, field: "dateTime" },
      );
    }

    if (updateData.metadata.vehicle) {
      encryptedMetadata.vehicle = await safeEncrypt(
        typeof updateData.metadata.vehicle === "object" &&
        updateData.metadata.vehicle._id
          ? updateData.metadata.vehicle._id
          : updateData.metadata.vehicle,
        { trip_id: tripId, field: "vehicle" },
      );
    }

    if (updateData.metadata.profile) {
      encryptedMetadata.profile = await safeEncrypt(
        updateData.metadata.profile,
        { trip_id: tripId, field: "profile" },
      );
    }

    encryptedData.metadata = encryptedMetadata;
  }

  return Trips.findByIdAndUpdate(tripId, encryptedData, { new: true });
};

const partialUpdateTrip = async (tripId, updateData, uid) => {
  const existingTrip = await Trips.findById(tripId).lean();
  if (!existingTrip) {
    return null;
  }

  const dek = await getUserDek(uid);
  const safeEncrypt = createSafeEncrypt(uid, dek);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  const encryptedData = {};
  const updateObject = { $set: {} };

  // Handle locations
  if (updateData.locations) {
    const decryptedLocations = await Promise.all(
      existingTrip.locations.map(async (loc) => ({
        latitude: parseFloat(
          await safeDecrypt(loc.latitude, {
            trip_id: tripId,
            field: "latitude",
          }),
        ),
        longitude: parseFloat(
          await safeDecrypt(loc.longitude, {
            trip_id: tripId,
            field: "longitude",
          }),
        ),
        timestamp: loc.timestamp ? await safeDecrypt(loc.timestamp, { trip_id: tripId, field: 'timestamp' }) : undefined,
      })),
    );

    const newLocations = decryptedLocations.concat(updateData.locations);
    updateObject.$set.locations = await Promise.all(
      newLocations.map(async (loc) => ({
        latitude: await safeEncrypt(loc.latitude.toString(), {
          trip_id: tripId,
          field: "latitude",
        }),
        longitude: await safeEncrypt(loc.longitude.toString(), {
          trip_id: tripId,
          field: "longitude",
        }),
        timestamp: loc.timestamp ? await safeEncrypt(loc.timestamp.toString(), {
          trip_id: tripId,
          field: "timestamp",
        }) : undefined,
      })),
    );

    updateObject.$set.totalMiles = haversine.calculateTotalMiles(newLocations);
    updateObject.$set.mileageEditedAt = null;
    updateObject.$set.mileageManuallyEdited = false;
  } else if (updateData.totalMiles !== undefined) {
    updateObject.$set.totalMiles = updateData.totalMiles;
    updateObject.$set.mileageEditedAt = new Date();
    updateObject.$set.mileageManuallyEdited = true;
  }

  if (updateData.metadata) {
    const decryptedMetadata = {};
    if (existingTrip.metadata) {
      for (const key in existingTrip.metadata) {
        if (Object.prototype.hasOwnProperty.call(existingTrip.metadata, key)) {
          try {
            const decryptedValue = await safeDecrypt(
              existingTrip.metadata[key],
              {
                trip_id: tripId,
                field: key,
              },
            );
            decryptedMetadata[key] = decryptedValue;
          } catch (error) {
            console.warn(`Could not decrypt metadata.${key}, leaving as is.`);
            decryptedMetadata[key] = existingTrip.metadata[key];
          }
        }
      }
    }

    const mergedMetadata = { ...decryptedMetadata, ...updateData.metadata };

    const encryptedMetadata = {};
    for (const key in mergedMetadata) {
      if (
        Object.prototype.hasOwnProperty.call(mergedMetadata, key) &&
        mergedMetadata[key] != null
      ) {
        encryptedMetadata[key] = await safeEncrypt(
          mergedMetadata[key].toString(),
          { trip_id: tripId, field: key },
        );
      }
    }
    updateObject.$set.metadata = encryptedMetadata;
  }

  return Trips.findByIdAndUpdate(tripId, updateObject, { new: true });
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
  partialUpdateTrip,
};
export default tripService;

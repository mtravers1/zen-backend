import Trips from '../../database/models/Trips.js';
import structuredLogger from '../../lib/structuredLogger.js';

async function migrateTrips(user, encryptIfPlaintext, documentId, isDryRun) {
  const trips = await Trips.find({ user: user._id });
  for (const trip of trips) {
    try {
      if (!trip.metadata || !trip.metadata.profile) {
        console.warn('Skipping trip with missing metadata or profile', { tripId: trip._id });
        continue;
      }
      // Encrypt locations
      if (trip.locations) {
        for (const location of trip.locations) {
          if (location.latitude) {
            location.latitude = await encryptIfPlaintext(location.latitude, { field: 'trip.locations.latitude' }, trip._id);
          }
          if (location.longitude) {
            location.longitude = await encryptIfPlaintext(location.longitude, { field: 'trip.locations.longitude' }, trip._id);
          }
        }
      }

      if (trip.metadata) {
        const metadata = trip.metadata;
        const newMetadata = {
          ...metadata.toObject(),
          placeName: metadata.placeName ? await encryptIfPlaintext(metadata.placeName, { field: 'trip.metadata.placeName' }, trip._id) : metadata.placeName,
          pickupAddress: metadata.pickupAddress ? await encryptIfPlaintext(metadata.pickupAddress, { field: 'trip.metadata.pickupAddress' }, trip._id) : metadata.pickupAddress,
          dropoffAddress: metadata.dropoffAddress ? await encryptIfPlaintext(metadata.dropoffAddress, { field: 'trip.metadata.dropoffAddress' }, trip._id) : metadata.dropoffAddress,
          description: metadata.description ? await encryptIfPlaintext(metadata.description, { field: 'trip.metadata.description' }, trip._id) : metadata.description,
          purpose: metadata.purpose ? await encryptIfPlaintext(metadata.purpose, { field: 'trip.metadata.purpose' }, trip._id) : metadata.purpose,
          other: metadata.other ? await encryptIfPlaintext(metadata.other, { field: 'trip.metadata.other' }, trip._id) : metadata.other,
          dateTime: metadata.dateTime ? await encryptIfPlaintext(metadata.dateTime.toString(), { field: 'trip.metadata.dateTime' }, trip._id) : metadata.dateTime,
          vehicle: metadata.vehicle ? await encryptIfPlaintext(metadata.vehicle, { field: 'trip.metadata.vehicle' }, trip._id) : metadata.vehicle,
          profile: metadata.profile ? await encryptIfPlaintext(metadata.profile, { field: 'trip.metadata.profile' }, trip._id) : metadata.profile,
        };
        trip.metadata = newMetadata;
      }

      if (!isDryRun) {
        await trip.save();
      }
      structuredLogger.logSuccess('Trip migrated successfully', { tripId: trip._id });
    } catch (error) {
      structuredLogger.logErrorBlock(error, { tripId: trip._id, error: error.message });
    }
  }
}

export default migrateTrips;
import Trip from '../../database/models/Trips.js';
import structuredLogger from '../../lib/structuredLogger.js';

async function migrateTrips(user, encryptIfPlaintext, documentId) {
  const trips = await Trip.find({ user: user._id });
  for (const trip of trips) {
    try {
      if (trip.locations) {
        for (const location of trip.locations) {
          location.latitude = await encryptIfPlaintext(location.latitude, { field: 'trip.locations.latitude' }, documentId);
          location.longitude = await encryptIfPlaintext(location.longitude, { field: 'trip.locations.longitude' }, documentId);
        }
      }
      if (trip.metadata) {
        trip.metadata.purpose = await encryptIfPlaintext(trip.metadata.purpose, { field: 'trip.metadata.purpose' }, documentId);
        trip.metadata.description = await encryptIfPlaintext(trip.metadata.description, { field: 'trip.metadata.description' }, documentId);
        trip.metadata.placeName = await encryptIfPlaintext(trip.metadata.placeName, { field: 'trip.metadata.placeName' }, documentId);
        trip.metadata.pickupAddress = await encryptIfPlaintext(trip.metadata.pickupAddress, { field: 'trip.metadata.pickupAddress' }, documentId);
        trip.metadata.dropoffAddress = await encryptIfPlaintext(trip.metadata.dropoffAddress, { field: 'trip.metadata.dropoffAddress' }, documentId);
        trip.metadata.initialMileage = await encryptIfPlaintext(trip.metadata.initialMileage, { field: 'trip.metadata.initialMileage' }, documentId);
        trip.metadata.endMileage = await encryptIfPlaintext(trip.metadata.endMileage, { field: 'trip.metadata.endMileage' }, documentId);
        trip.metadata.other = await encryptIfPlaintext(trip.metadata.other, { field: 'trip.metadata.other' }, documentId);
      }

      await trip.save();
      structuredLogger.logSuccess('Trip migrated successfully', { tripId: trip._id });
    } catch (error) {
      structuredLogger.logErrorBlock(error, { tripId: trip._id, error: error.message });
    }
  }
}

export default migrateTrips;

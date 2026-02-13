
import mongoose from 'mongoose';
import connectDB from '../database/database.js';
import Trips from '../database/models/Trips.js';
import User from '../database/models/User.js';
import { getUserDek } from '../database/encryption.js';
import { createSafeDecrypt } from '../lib/encryptionHelper.js';
import structuredLogger from '../lib/structuredLogger.js';

async function dumpTripData() {
  const tripId = (process.argv.find(arg => arg.startsWith('--tripId=')) || '').split('=')[1];

  if (!tripId) {
    console.error('Please provide --tripId');
    process.exit(1);
  }

  try {
    await connectDB();

    const trip = await Trips.findById(tripId).lean();

    if (!trip) {
      console.error('Trip not found.');
      process.exit(1);
    }

    const user = await User.findById(trip.user);

    if (!user) {
      console.error('User not found for this trip.');
      process.exit(1);
    }

    const dek = await getUserDek(user.authUid);
    const safeDecrypt = createSafeDecrypt(user.authUid, dek);

    const decryptedLocations = await Promise.all(
      trip.locations.map(async (loc) => ({
        latitude: parseFloat(await safeDecrypt(loc.latitude, { trip_id: trip._id, field: 'latitude' })),
        longitude: parseFloat(await safeDecrypt(loc.longitude, { trip_id: trip._id, field: 'longitude' })),
      }))
    );

    const output = {
      tripId: trip._id,
      userId: trip.user,
      totalMiles: trip.totalMiles,
      locations: decryptedLocations,
    };

    console.log(JSON.stringify(output, null, 2));

    structuredLogger.logSuccess(`Finished. Found trip ${trip._id}.`);
    process.exit(0);
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

dumpTripData();

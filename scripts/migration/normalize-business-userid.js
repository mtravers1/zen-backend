import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../../database/database.js';
import Business from '../../database/models/Businesses.js';

dotenv.config();

async function normalizeBusinessUserId() {
  let hasError = false;
  try {
    console.log('Connecting to the database...');
    await connectDB();
    console.log('Database connected.');

    console.log('Starting migration for Business.userId...');
    const businesses = await Business.find({});
    let modifiedCount = 0;

    for (const business of businesses) {
      let needsUpdate = false;
      let newUserId = [];

      if (business.userId) {
        // Ensure userId is always an array for consistency with schema
        const currentUserId = Array.isArray(business.userId) ? business.userId : [business.userId];

        for (const id of currentUserId) {
          if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
            newUserId.push(new mongoose.Types.ObjectId(id));
            needsUpdate = true;
          } else if (id instanceof mongoose.Types.ObjectId) {
            newUserId.push(id);
          } else {
            console.warn(`Skipping invalid userId type or value for business ${business._id}: ${id}`);
          }
        }
      } else {
          console.warn(`Business ${business._id} has no userId. Setting to empty array.`);
          needsUpdate = true;
      }

      if (needsUpdate) {
        // Only update if the newUserId array is different or if it was null/undefined
        if (!business.userId || newUserId.length !== (Array.isArray(business.userId) ? business.userId.length : 1) || JSON.stringify(newUserId) !== JSON.stringify(business.userId)) {
            business.userId = newUserId;
            await business.save();
            modifiedCount++;
            console.log(`Updated userId for business: ${business._id}`);
        }
      }
    }

    console.log(`
--- Business.userId Normalization Summary ---
Total businesses processed: ${businesses.length}
Businesses with userId modified: ${modifiedCount}
-----------------------------------------------
`);

  } catch (error) {
    console.error('An error occurred during migration:', error);
    hasError = true;
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
    if (hasError) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

normalizeBusinessUserId();

import mongoose from 'mongoose';
import Business from '../../database/models/Businesses.js';
import User from '../../database/models/User.js';
import PlaidAccount from '../../database/models/PlaidAccount.js';
import db from '../../database/database.js';

const backfillProfileId = async () => {
  try {
    console.log('Connecting to the database...');
    await db.connect();
    console.log('Database connected.');

    const accountsToUpdate = await PlaidAccount.find({ profileId: { $exists: false } });
    console.log(`Found ${accountsToUpdate.length} accounts to update.`);

    for (const account of accountsToUpdate) {
      // Find the user who owns the account
      const user = await User.findOne({ _id: account.owner_id });
      if (!user) {
        console.log(`Could not find user for account ${account._id}`);
        continue;
      }

      // Check if the account is in the user's personal accounts
      if (user.plaidAccounts.includes(account._id)) {
        account.profileId = user._id;
        await account.save();
        console.log(`Updated account ${account._id} with user profile id ${user._id}`);
        continue;
      }

      // If not a personal account, find the business profile it belongs to
      const business = await Business.findOne({ plaidAccountIds: account._id });
      if (business) {
        account.profileId = business._id;
        await account.save();
        console.log(`Updated account ${account._id} with business profile id ${business._id}`);
      } else {
        console.log(`Could not find profile for account ${account._id}`);
      }
    }

    console.log('Backfill complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  }
};

backfillProfileId();

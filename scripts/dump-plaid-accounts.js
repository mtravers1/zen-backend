import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import structuredLogger from '../lib/structuredLogger.js';

async function dumpPlaidAccounts() {
  const userId = (process.argv.find(arg => arg.startsWith('--user-id=')) || '').split('=')[1];
  const firebaseUid = (process.argv.find(arg => arg.startsWith('--firebase-uid=')) || '').split('=')[1];

  await connectDB();

  let plaidAccounts;
  if (userId) {
    plaidAccounts = await PlaidAccount.find({ owner_id: userId });
  } else if (firebaseUid) {
    const user = await User.findOne({ authUid: firebaseUid });
    if (user) {
      plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
    } else {
      plaidAccounts = [];
    }
  } else {
    plaidAccounts = await PlaidAccount.find({});
  }

  console.log(JSON.stringify(plaidAccounts, null, 2));

  structuredLogger.logSuccess(`Finished. Found ${plaidAccounts.length} Plaid accounts.`);
  process.exit(0);
}

dumpPlaidAccounts();
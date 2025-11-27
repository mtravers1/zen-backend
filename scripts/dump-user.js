import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import structuredLogger from '../lib/structuredLogger.js';
import Business from '../database/models/Businesses.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import Liability from '../database/models/Liability.js';
import AccessToken from '../database/models/AccessToken.js';

async function dumpUser() {
  const userId = (process.argv.find(arg => arg.startsWith('--user-id=')) || '').split('=')[1];
  const firebaseUid = (process.argv.find(arg => arg.startsWith('--firebase-uid=')) || '').split('=')[1];
  const dumpTransactions = process.argv.includes('--transactions');

  await connectDB();

  let user;
  if (userId) {
    user = await User.findById(userId);
  } else if (firebaseUid) {
    user = await User.findOne({ authUid: firebaseUid });
  } else {
    console.error('Please provide either --user-id or --firebase-uid');
    process.exit(1);
  }

  if (!user) {
    console.error('User not found.');
    process.exit(1);
  }

  const output = { user };

  const businesses = await Business.find({ userId: user._id });
  output.businesses = businesses;

  if (dumpTransactions) {
    const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
    const plaidAccountIds = plaidAccounts.map(account => account.plaid_account_id);
    const transactions = await Transaction.find({ plaidAccountId: { $in: plaidAccountIds } });
    const liabilities = await Liability.find({ accountId: { $in: plaidAccountIds } });
    const accessTokens = await AccessToken.find({ userId: user._id });

    output.plaidAccounts = plaidAccounts;
    output.transactions = transactions;
    output.liabilities = liabilities;
    output.accessTokens = accessTokens;
  }

  console.log(JSON.stringify(output, null, 2));

  structuredLogger.logSuccess(`Finished. Found user ${user._id}.`);
  process.exit(0);
}

dumpUser();
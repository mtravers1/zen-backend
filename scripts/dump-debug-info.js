
import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import Business from '../database/models/Businesses.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import structuredLogger from '../lib/structuredLogger.js';

async function dumpDebugInfo() {
  const firebaseUid = (process.argv.find(arg => arg.startsWith('--firebase-uid=')) || '').split('=')[1];

  if (!firebaseUid) {
    console.error('Please provide --firebase-uid');
    process.exit(1);
  }

  try {
    await connectDB();

    const user = await User.findOne({ authUid: firebaseUid });

    if (!user) {
      console.error('User not found.');
      process.exit(1);
    }

    const businesses = await Business.find({ userId: user._id }).populate('plaidAccountIds');

    const output = {
      user: {
        _id: user._id,
        authUid: user.authUid,
        personalPlaidAccounts: [],
      },
      businesses: [],
    };

    if (businesses.length > 0) {
      for (const business of businesses) {
        const businessOutput = {
          _id: business._id,
          name: business.name,
          plaidAccounts: [],
        };

        for (const account of business.plaidAccountIds) {
          const transaction = await Transaction.findOne({
            plaidAccountId: account.plaid_account_id,
            'merchant.logo': { $ne: null },
          });

          const accountOutput = {
            _id: account._id,
            plaid_account_id: account.plaid_account_id,
            account_name: account.account_name,
            transaction_with_logo: transaction,
          };
          businessOutput.plaidAccounts.push(accountOutput);
        }
        output.businesses.push(businessOutput);
      }
    } else {
      const userWithPlaid = await User.findById(user._id).populate('plaidAccounts');
      for (const account of userWithPlaid.plaidAccounts) {
        const transaction = await Transaction.findOne({
          plaidAccountId: account.plaid_account_id,
          'merchant.logo': { $ne: null },
        });

        const accountOutput = {
          _id: account._id,
          plaid_account_id: account.plaid_account_id,
          account_name: account.account_name,
          transaction_with_logo: transaction,
        };
        output.user.personalPlaidAccounts.push(accountOutput);
      }
    }

    console.log(JSON.stringify(output, null, 2));

    structuredLogger.logSuccess(`Finished. Found user ${user._id}.`);
    process.exit(0);
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

dumpDebugInfo();

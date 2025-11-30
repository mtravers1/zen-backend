
import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import Business from '../database/models/Businesses.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import Liability from '../database/models/Liability.js';
import AccessToken from '../database/models/AccessToken.js';
import { getUserDek, decryptValue } from '../database/encryption.js';
import structuredLogger from '../lib/structuredLogger.js';

async function debugDecryption() {
  const userId = (process.argv.find(arg => arg.startsWith('--user-id=')) || '').split('=')[1];
  const firebaseUid = (process.argv.find(arg => arg.startsWith('--firebase-uid=')) || '').split('=')[1];

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

  console.log(`Starting decryption debug for user ${user._id} (Firebase UID: ${user.authUid})`);

  const deks = await getUserDek(user.authUid);
  if (!deks || deks.length === 0) {
    console.error('Could not retrieve DEK for user.');
    process.exit(1);
  }

  const errorLog = [];

  async function safeDecrypt(value, field, docId) {
    if (!value) return null;
    try {
      const decryptedValue = await decryptValue(value, deks);
      return decryptedValue;
    } catch (error) {
      errorLog.push({
        documentId: docId,
        field,
        encryptedValue: value,
        error: error.message,
      });
      return null;
    }
  }

  const businesses = await Business.find({ userId: user._id });
  for (const business of businesses) {
    await safeDecrypt(business.name, 'name', business._id);
  }

  const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
  for (const account of plaidAccounts) {
    await safeDecrypt(account.account_name, 'account_name', account._id);
  }

  const plaidAccountIds = plaidAccounts.map(account => account.plaid_account_id);
  const transactions = await Transaction.find({ plaidAccountId: { $in: plaidAccountIds } });
  for (const transaction of transactions) {
    await safeDecrypt(transaction.amount, 'amount', transaction._id);
    await safeDecrypt(transaction.description, 'description', transaction._id);
    await safeDecrypt(transaction.name, 'name', transaction._id);
    await safeDecrypt(transaction.notes, 'notes', transaction._id);
    await safeDecrypt(transaction.tags, 'tags', transaction._id);
    await safeDecrypt(transaction.fees, 'fees', transaction._id);
    await safeDecrypt(transaction.price, 'price', transaction._id);
    await safeDecrypt(transaction.quantity, 'quantity', transaction._id);
    await safeDecrypt(transaction.type, 'type', transaction._id);
    await safeDecrypt(transaction.subtype, 'subtype', transaction._id);
    await safeDecrypt(transaction.securityId, 'securityId', transaction._id);
    if (transaction.merchant) {
      await safeDecrypt(transaction.merchant.merchantName, 'merchant.merchantName', transaction._id);
      await safeDecrypt(transaction.merchant.name, 'merchant.name', transaction._id);
    }
  }

  const liabilities = await Liability.find({ accountId: { $in: plaidAccountIds } });
    for (const liability of liabilities) {

    }


  if (errorLog.length > 0) {
    console.error('Decryption errors found:');
    console.log(JSON.stringify(errorLog, null, 2));
  } else {
    console.log('No decryption errors found.');
  }

  console.log('Decryption debug finished.');
  process.exit(0);
}

debugDecryption();

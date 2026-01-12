import mongoose from 'mongoose';
import Transaction from '../database/models/Transaction.js';
import structuredLogger from '../lib/structuredLogger.js';

const findAndDeleteDuplicateTransactions = async () => {
  const isDryRun = !process.argv.includes('--no-dry-run');
  const plaidAccountIdArg = process.argv.find(arg => arg.startsWith('--plaidAccountId='));
  const plaidAccountId = plaidAccountIdArg ? plaidAccountIdArg.split('=')[1] : null;

  if (isDryRun) {
    structuredLogger.logInfo('Running in DRY-RUN mode. No data will be deleted.');
  } else {
    structuredLogger.logWarning('Running in LIVE mode. Duplicate transactions will be deleted.');
  }

  try {
    structuredLogger.logInfo('Connecting to the database...');
    const mongoDB = process.env.MONGODB_URI;
    const user = process.env.MONGODB_USER;
    const pass = process.env.MONGODB_PASS;
    const dbName = process.env.MONGODB_DB;

    if (!mongoDB || !user || !pass || !dbName) {
      throw new Error("Missing required MONGODB environment variables");
    }

    await mongoose.connect(mongoDB, {
      user,
      pass,
      dbName,
    });
    structuredLogger.logInfo('Database connected.');

    const pipeline = [];
    if (plaidAccountId) {
      pipeline.push({
        $match: {
          plaidAccountId: plaidAccountId,
        },
      });
      structuredLogger.logInfo(`Finding duplicate transactions for plaidAccountId: ${plaidAccountId}...`);
    } else {
      structuredLogger.logInfo('Finding duplicate transactions for the entire database...');
    }

    pipeline.push(
      {
        $group: {
          _id: { plaidTransactionId: "$plaidTransactionId" },
          count: { $sum: 1 },
          docs: { $push: "$_id" },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    );

    const duplicates = await Transaction.aggregate(pipeline);

    if (duplicates.length === 0) {
      structuredLogger.logInfo('No duplicate transactions found.');
      return;
    }

    structuredLogger.logInfo(`Found ${duplicates.length} sets of duplicate transactions.`);

    const idsToDelete = [];
    for (const duplicate of duplicates) {
      // Sort by _id to keep the oldest one
      duplicate.docs.sort();
      const toDelete = duplicate.docs.slice(1);
      idsToDelete.push(...toDelete);
    }

    if (isDryRun) {
      structuredLogger.logInfo('The following transaction _ids would be deleted:');
      console.log(JSON.stringify(idsToDelete.map(id => id.toString()), null, 2));
    } else {
      if (idsToDelete.length > 0) {
        structuredLogger.logInfo(`Deleting ${idsToDelete.length} duplicate transactions...`);
        const deleteResult = await Transaction.deleteMany({ _id: { $in: idsToDelete } });
        structuredLogger.logSuccess(`Successfully deleted ${deleteResult.deletedCount} transactions.`);
      } else {
        structuredLogger.logInfo('No duplicate transactions to delete.');
      }
    }

  } catch (error) {
    console.error('An error occurred during the script execution:', error);
  } finally {
    await mongoose.disconnect();
    structuredLogger.logInfo('Database disconnected.');
  }
};

findAndDeleteDuplicateTransactions();

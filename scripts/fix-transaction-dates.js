import mongoose from 'mongoose';
import Transaction from '../database/models/Transaction.js';
import connectDB from '../database/database.js';

const BATCH_SIZE = 500;

const fixTransactionDates = async () => {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Database connected.');

  let fixedCount = 0;
  let processedCount = 0;

  try {
    console.log('Starting transaction date migration...');
    const totalTransactions = await Transaction.countDocuments();
    console.log(`Found ${totalTransactions} total transactions to check.`);

    let lastId = null;

    while (true) {
      const query = lastId ? { _id: { $gt: lastId } } : {};
      const transactions = await Transaction.find(query)
        .sort({ _id: 1 })
        .limit(BATCH_SIZE);

      if (transactions.length === 0) {
        break; // No more transactions to process
      }
      
      const bulkOps = [];

      for (const trans of transactions) {
        if (trans.transactionDate) {
          const date = new Date(trans.transactionDate);
          // Check if the time is exactly midnight UTC
          if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
            // Adjust to noon UTC
            const newDate = new Date(date.getTime());
            newDate.setUTCHours(12);

            bulkOps.push({
              updateOne: {
                filter: { _id: trans._id },
                update: { $set: { transactionDate: newDate } },
              },
            });
            fixedCount++;
          }
        }
      }

      if (bulkOps.length > 0) {
        console.log(`Found ${bulkOps.length} transactions to fix in this batch...`);
        await Transaction.bulkWrite(bulkOps);
        console.log(`Updated ${bulkOps.length} transactions.`);
      }

      processedCount += transactions.length;
      lastId = transactions[transactions.length - 1]._id;
      console.log(`Processed ${processedCount} / ${totalTransactions} transactions...`);
    }

    console.log(`Migration complete. Fixed a total of ${fixedCount} transactions.`);
  } catch (error) {
    console.error('An error occurred during the migration:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
    process.exit(0);
  }
};

fixTransactionDates();

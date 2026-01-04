// debug-webhook.js
import { webhookHandler } from './services/webhook.service.js';
import { connectDB, disconnectDB } from './database/database.js';

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

const runSimulation = async (mockEvent) => {
  try {
    if (!mockEvent.item_id || mockEvent.item_id.includes('your_item_id')) {
      console.warn(`
--- SKIPPING simulation for ${mockEvent.webhook_type}: Please replace the placeholder item_id. ---
`);
      return;
    }
    console.log(`
--- Simulating ${mockEvent.webhook_type} / ${mockEvent.webhook_code} for item: ${mockEvent.item_id} ---
`);
    const result = await webhookHandler(mockEvent, null, null);
    console.log(`--- Simulation Complete for ${mockEvent.webhook_type}:`, result, '---
');
  } catch (error) {
    console.error(`--- Simulation FAILED for ${mockEvent.webhook_type}:`, error, '---
');
  }
};

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not found in .env file. Please set it.");
    return;
  }

  await connectDB();
  console.log("Database connected.");

  // Test Case 1: Liabilities Update
  const liabilitiesEvent = {
    webhook_type: 'LIABILITIES',
    webhook_code: 'DEFAULT_UPDATE',
    item_id: 'your_liabilities_item_id', // <<< REPLACE with an item that has liability products
  };
  await runSimulation(liabilitiesEvent);

  // Test Case 2: Depository Transactions Update
  const transactionsEvent = {
    webhook_type: 'TRANSACTIONS',
    webhook_code: 'DEFAULT_UPDATE',
    item_id: 'your_depository_item_id', // <<< REPLACE with an item that has transaction products
  };
  await runSimulation(transactionsEvent);
  
  await disconnectDB();
  console.log("Database disconnected.");
}

main();
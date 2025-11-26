import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import structuredLogger from '../lib/structuredLogger.js';

async function dumpUser() {
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

  console.log(JSON.stringify(user, null, 2));

  structuredLogger.logSuccess(`Finished. Found user ${user._id}.`);
  process.exit(0);
}

dumpUser();

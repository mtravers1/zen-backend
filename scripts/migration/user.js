import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';

async function migrateUsers(user, encryptIfPlaintext) {
  try {
    // Encrypt User fields
    if (user.name) {
      user.name.prefix = await encryptIfPlaintext(user.name.prefix, { field: 'user.name.prefix' });
      user.name.firstName = await encryptIfPlaintext(user.name.firstName, { field: 'user.name.firstName' });
      user.name.middleName = await encryptIfPlaintext(user.name.middleName, { field: 'user.name.middleName' });
      user.name.lastName = await encryptIfPlaintext(user.name.lastName, { field: 'user.name.lastName' });
      user.name.suffix = await encryptIfPlaintext(user.name.suffix, { field: 'user.name.suffix' });
    }
    // ... (apply encryptIfPlaintext to other user fields)

    await user.save();
    structuredLogger.logInfo('User migrated successfully', { userId: user._id });
  } catch (error) {
    structuredLogger.logError('Error migrating user', { userId: user._id, error: error.message });
  }
}

export default migrateUsers;

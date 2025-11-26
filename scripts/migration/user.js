import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';

async function migrateUsers(user, encryptIfPlaintext, documentId) {
  try {
    // Encrypt User fields
    if (user.name) {
      user.name.prefix = await encryptIfPlaintext(user.name.prefix, { field: 'user.name.prefix' }, documentId);
      user.name.firstName = await encryptIfPlaintext(user.name.firstName, { field: 'user.name.firstName' }, documentId);
      user.name.middleName = await encryptIfPlaintext(user.name.middleName, { field: 'user.name.middleName' }, documentId);
      user.name.lastName = await encryptIfPlaintext(user.name.lastName, { field: 'user.name.lastName' }, documentId);
      user.name.suffix = await encryptIfPlaintext(user.name.suffix, { field: 'user.name.suffix' }, documentId);
    }
    if (user.email) {
      for (const email of user.email) {
        email.email = await encryptIfPlaintext(email.email, { field: 'user.email.email' }, documentId);
      }
    }
    if (user.phones) {
      for (const phone of user.phones) {
        phone.phone = await encryptIfPlaintext(phone.phone, { field: 'user.phones.phone' }, documentId);
      }
    }
    if (user.dateOfBirth) {
      user.dateOfBirth = await encryptIfPlaintext(user.dateOfBirth, { field: 'user.dateOfBirth' }, documentId);
    }
    if (user.annualIncome) {
      user.annualIncome = await encryptIfPlaintext(user.annualIncome, { field: 'user.annualIncome' }, documentId);
    }
    if (user.maritalStatus) {
      user.encryptedMaritalStatus = await encryptIfPlaintext(user.maritalStatus, { field: 'user.maritalStatus' }, documentId);
      user.maritalStatus = undefined;
    }
    if (user.occupation) {
      user.occupation = await encryptIfPlaintext(user.occupation, { field: 'user.occupation' }, documentId);
    }
    if (user.dependents) {
      user.dependents = await encryptIfPlaintext(user.dependents, { field: 'user.dependents' }, documentId);
    }
    if (user.address) {
      for (const address of user.address) {
        address.street = await encryptIfPlaintext(address.street, { field: 'user.address.street' }, documentId);
        address.city = await encryptIfPlaintext(address.city, { field: 'user.address.city' }, documentId);
        address.state = await encryptIfPlaintext(address.state, { field: 'user.address.state' }, documentId);
        address.postalCode = await encryptIfPlaintext(address.postalCode, { field: 'user.address.postalCode' }, documentId);
        address.country = await encryptIfPlaintext(address.country, { field: 'user.address.country' }, documentId);
      }
    }

    await user.save();
    structuredLogger.logSuccess('User migrated successfully', { userId: user._id });
  } catch (error) {
    structuredLogger.logErrorBlock(error, { userId: user._id, error: error.message });
  }
}

export default migrateUsers;

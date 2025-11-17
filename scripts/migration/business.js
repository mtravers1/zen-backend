import Business from '../../database/models/Businesses.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migrateBusinesses(user, encryptIfPlaintext) {
  const businesses = await Business.find({ userId: user._id });
  for (const business of businesses) {
    try {
      // Encrypt Business fields
      if (business.name) {
        business.name = await encryptIfPlaintext(business.name, { field: 'business.name' });
      }
      if (business.legalName) {
        business.legalName = await encryptIfPlaintext(business.legalName, { field: 'business.legalName' });
      }
      if (business.businessDesc) {
        business.businessDesc = await encryptIfPlaintext(business.businessDesc, { field: 'business.businessDesc' });
      }
      if (business.businessDescription) {
        business.businessDescription = await encryptIfPlaintext(business.businessDescription, { field: 'business.businessDescription' });
      }
      if (business.addresses) {
        for (const address of business.addresses) {
          address.street = await encryptIfPlaintext(address.street, { field: 'business.addresses.street' });
          address.city = await encryptIfPlaintext(address.city, { field: 'business.addresses.city' });
          address.state = await encryptIfPlaintext(address.state, { field: 'business.addresses.state' });
          address.postalCode = await encryptIfPlaintext(address.postalCode, { field: 'business.addresses.postalCode' });
          address.country = await encryptIfPlaintext(address.country, { field: 'business.addresses.country' });
        }
      }
      if (business.website) {
        business.website = await encryptIfPlaintext(business.website, { field: 'business.website' });
      }
      if (business.phoneNumbers) {
        for (const phoneNumber of business.phoneNumbers) {
          phoneNumber.phone = await encryptIfPlaintext(phoneNumber.phone, { field: 'business.phoneNumbers.phone' });
        }
      }
      if (business.industryDesc) {
        business.industryDesc = await encryptIfPlaintext(business.industryDesc, { field: 'business.industryDesc' });
      }
      if (business.subsidiaries) {
        business.subsidiaries = await Promise.all(business.subsidiaries.map(s => encryptIfPlaintext(s, { field: 'business.subsidiaries' })));
      }
      if (business.businessLocations) {
        for (const location of business.businessLocations) {
          location.street = await encryptIfPlaintext(location.street, { field: 'business.businessLocations.street' });
          location.city = await encryptIfPlaintext(location.city, { field: 'business.businessLocations.city' });
          location.state = await encryptIfPlaintext(location.state, { field: 'business.businessLocations.state' });
          location.postalCode = await encryptIfPlaintext(location.postalCode, { field: 'business.businessLocations.postalCode' });
          location.country = await encryptIfPlaintext(location.country, { field: 'business.businessLocations.country' });
        }
      }
      if (business.accountingInfo) {
        business.accountingInfo = await encryptIfPlaintext(business.accountingInfo, { field: 'business.accountingInfo' });
      }
      if (business.taxInformation) {
        business.taxInformation = await encryptIfPlaintext(business.taxInformation, { field: 'business.taxInformation' });
      }
      if (business.payrollDetails) {
        business.payrollDetails = await encryptIfPlaintext(business.payrollDetails, { field: 'business.payrollDetails' });
      }
      if (business.formationDate) {
        business.formationDate = await encryptIfPlaintext(business.formationDate, { field: 'business.formationDate' });
      }
      if (business.businessHours) {
        business.businessHours = await Promise.all(business.businessHours.map(h => encryptIfPlaintext(h, { field: 'business.businessHours' })));
      }
      if (business.ownership) {
        // Assuming ownership contains PII that needs to be encrypted
        // This is a complex object, so you might need to encrypt specific fields within it
      }
      if (business.businessOwners) {
        business.businessOwners = await Promise.all(business.businessOwners.map(o => encryptIfPlaintext(o, { field: 'business.businessOwners' })));
      }
      if (business.businessOwnersDetails) {
        for (const owner of business.businessOwnersDetails) {
          owner.name = await encryptIfPlaintext(owner.name, { field: 'business.businessOwnersDetails.name' });
          owner.email = await encryptIfPlaintext(owner.email, { field: 'business.businessOwnersDetails.email' });
          owner.position = await encryptIfPlaintext(owner.position, { field: 'business.businessOwnersDetails.position' });
        }
      }

      await business.save();
      structuredLogger.logInfo('Business migrated successfully', { businessId: business._id });
    } catch (error) {
      structuredLogger.logError('Error migrating business', { businessId: business._id, error: error.message });
    }
  }
}

export default migrateBusinesses;

import Business from '../../database/models/Businesses.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migrateBusinesses(user, encryptIfPlaintext, documentId) {
  const businesses = await Business.find({ userId: user._id });
  for (const business of businesses) {
    try {
      // Encrypt Business fields
      if (business.name) {
        business.name = await encryptIfPlaintext(business.name, { field: 'business.name' }, documentId);
      }
      if (business.legalName) {
        business.legalName = await encryptIfPlaintext(business.legalName, { field: 'business.legalName' }, documentId);
      }
      if (business.businessDesc) {
        business.businessDesc = await encryptIfPlaintext(business.businessDesc, { field: 'business.businessDesc' }, documentId);
      }
      if (business.businessDescription) {
        business.businessDescription = await encryptIfPlaintext(business.businessDescription, { field: 'business.businessDescription' }, documentId);
      }
      if (business.addresses) {
        for (const address of business.addresses) {
          address.street = await encryptIfPlaintext(address.street, { field: 'business.addresses.street' }, documentId);
          address.city = await encryptIfPlaintext(address.city, { field: 'business.addresses.city' }, documentId);
          address.state = await encryptIfPlaintext(address.state, { field: 'business.addresses.state' }, documentId);
          address.postalCode = await encryptIfPlaintext(address.postalCode, { field: 'business.addresses.postalCode' }, documentId);
          address.country = await encryptIfPlaintext(address.country, { field: 'business.addresses.country' }, documentId);
        }
      }
      if (business.website) {
        business.website = await encryptIfPlaintext(business.website, { field: 'business.website' }, documentId);
      }
      if (business.phoneNumbers) {
        for (const phoneNumber of business.phoneNumbers) {
          phoneNumber.phone = await encryptIfPlaintext(phoneNumber.phone, { field: 'business.phoneNumbers.phone' }, documentId);
        }
      }
      if (business.industryDesc) {
        business.industryDesc = await encryptIfPlaintext(business.industryDesc, { field: 'business.industryDesc' }, documentId);
      }
      if (business.subsidiaries) {
        for (let i = 0; i < business.subsidiaries.length; i++) {
          business.subsidiaries[i] = await encryptIfPlaintext(business.subsidiaries[i], { field: `business.subsidiaries.${i}` }, documentId);
        }
      }
      if (business.businessLocations) {
        for (const location of business.businessLocations) {
          location.street = await encryptIfPlaintext(location.street, { field: 'business.businessLocations.street' }, documentId);
          location.city = await encryptIfPlaintext(location.city, { field: 'business.businessLocations.city' }, documentId);
          location.state = await encryptIfPlaintext(location.state, { field: 'business.businessLocations.state' }, documentId);
          location.postalCode = await encryptIfPlaintext(location.postalCode, { field: 'business.businessLocations.postalCode' }, documentId);
          location.country = await encryptIfPlaintext(location.country, { field: 'business.businessLocations.country' }, documentId);
        }
      }
      if (business.accountingInfo) {
        business.accountingInfo = await encryptIfPlaintext(business.accountingInfo, { field: 'business.accountingInfo' }, documentId);
      }
      if (business.taxInformation) {
        business.taxInformation = await encryptIfPlaintext(business.taxInformation, { field: 'business.taxInformation' }, documentId);
      }
      if (business.payrollDetails) {
        business.payrollDetails = await encryptIfPlaintext(business.payrollDetails, { field: 'business.payrollDetails' }, documentId);
      }
      if (business.formationDate) {
        business.formationDate = await encryptIfPlaintext(business.formationDate, { field: 'business.formationDate' }, documentId);
      }
      if (business.businessHours) {
        for (let i = 0; i < business.businessHours.length; i++) {
          business.businessHours[i] = await encryptIfPlaintext(business.businessHours[i], { field: `business.businessHours.${i}` }, documentId);
        }
      }
      if (business.ownership) {
        // Assuming ownership contains PII that needs to be encrypted
        // This is a complex object, so you might need to encrypt specific fields within it
      }
      if (business.businessOwners) {
        for (let i = 0; i < business.businessOwners.length; i++) {
          business.businessOwners[i] = await encryptIfPlaintext(business.businessOwners[i], { field: `business.businessOwners.${i}` }, documentId);
        }
      }
      if (business.businessOwnersDetails) {
        for (const owner of business.businessOwnersDetails) {
          owner.name = await encryptIfPlaintext(owner.name, { field: 'business.businessOwnersDetails.name' }, documentId);
          owner.email = await encryptIfPlaintext(owner.email, { field: 'business.businessOwnersDetails.email' }, documentId);
          owner.position = await encryptIfPlaintext(owner.position, { field: 'business.businessOwnersDetails.position' }, documentId);
        }
      }

      await business.save();
      structuredLogger.logSuccess('Business migrated successfully', { businessId: business._id });
    } catch (error) {
      structuredLogger.logErrorBlock(error, { businessId: business._id, error: error.message });
    }
  }
}

export default migrateBusinesses;

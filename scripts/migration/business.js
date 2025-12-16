import Business from '../../database/models/Businesses.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migrateBusinesses(user, encryptIfPlaintext, documentId, isDryRun) {
  const businesses = await Business.find({ userId: user._id });
  for (const business of businesses) {
    try {
      // Encrypt Business fields
      if (business.name) {
        business.name = await encryptIfPlaintext(business.name, { field: 'business.name' }, business._id);
      }
      if (business.legalName) {
        business.legalName = await encryptIfPlaintext(business.legalName, { field: 'business.legalName' }, business._id);
      }
      if (business.businessDesc) {
        business.businessDesc = await encryptIfPlaintext(business.businessDesc, { field: 'business.businessDesc' }, business._id);
      }
      if (business.businessDescription) {
        business.businessDescription = await encryptIfPlaintext(business.businessDescription, { field: 'business.businessDescription' }, business._id);
      }
      if (business.addresses) {
        for (const address of business.addresses) {
          address.street = await encryptIfPlaintext(address.street, { field: 'business.addresses.street' }, business._id);
          address.city = await encryptIfPlaintext(address.city, { field: 'business.addresses.city' }, business._id);
          address.state = await encryptIfPlaintext(address.state, { field: 'business.addresses.state' }, business._id);
          address.postalCode = await encryptIfPlaintext(address.postalCode, { field: 'business.addresses.postalCode' }, business._id);
          address.country = await encryptIfPlaintext(address.country, { field: 'business.addresses.country' }, business._id);
        }
      }
      if (business.website) {
        business.website = await encryptIfPlaintext(business.website, { field: 'business.website' }, business._id);
      }
      if (business.phoneNumbers) {
        for (const phoneNumber of business.phoneNumbers) {
          phoneNumber.phone = await encryptIfPlaintext(phoneNumber.phone, { field: 'business.phoneNumbers.phone' }, business._id);
        }
      }
      if (business.industryDesc) {
        business.industryDesc = await encryptIfPlaintext(business.industryDesc, { field: 'business.industryDesc' }, business._id);
      }
      if (business.subsidiaries) {
        for (let i = 0; i < business.subsidiaries.length; i++) {
          business.subsidiaries[i] = await encryptIfPlaintext(business.subsidiaries[i], { field: `business.subsidiaries.${i}` }, business._id);
        }
      }
      if (business.businessLocations) {
        for (const location of business.businessLocations) {
          location.street = await encryptIfPlaintext(location.street, { field: 'business.businessLocations.street' }, business._id);
          location.city = await encryptIfPlaintext(location.city, { field: 'business.businessLocations.city' }, business._id);
          location.state = await encryptIfPlaintext(location.state, { field: 'business.businessLocations.state' }, business._id);
          location.postalCode = await encryptIfPlaintext(location.postalCode, { field: 'business.businessLocations.postalCode' }, business._id);
          location.country = await encryptIfPlaintext(location.country, { field: 'business.businessLocations.country' }, business._id);
        }
      }
      if (business.accountingInfo) {
        business.accountingInfo = await encryptIfPlaintext(business.accountingInfo, { field: 'business.accountingInfo' }, business._id);
      }
      if (business.taxInformation) {
        business.taxInformation = await encryptIfPlaintext(business.taxInformation, { field: 'business.taxInformation' }, business._id);
      }
      if (business.payrollDetails) {
        business.payrollDetails = await encryptIfPlaintext(business.payrollDetails, { field: 'business.payrollDetails' }, business._id);
      }
      if (business.businessHours) {
        for (let i = 0; i < business.businessHours.length; i++) {
          business.businessHours[i] = await encryptIfPlaintext(business.businessHours[i], { field: `business.businessHours.${i}` }, business._id);
        }
      }
      if (business.ownership && typeof business.ownership === 'object' && business.ownership.percentage !== undefined) {
        business.ownership.percentage = await encryptIfPlaintext(String(business.ownership.percentage), { field: 'business.ownership.percentage' }, business._id);
      }
      if (business.businessOwners) {
        for (let i = 0; i < business.businessOwners.length; i++) {
          business.businessOwners[i] = await encryptIfPlaintext(business.businessOwners[i], { field: `business.businessOwners.${i}` }, business._id);
        }
      }
      if (business.businessOwnersDetails) {
        for (const owner of business.businessOwnersDetails) {
          owner.name = await encryptIfPlaintext(owner.name, { field: 'business.businessOwnersDetails.name' }, business._id);
          owner.email = await encryptIfPlaintext(owner.email, { field: 'business.businessOwnersDetails.email' }, business._id);
          owner.position = await encryptIfPlaintext(owner.position, { field: 'business.businessOwnersDetails.position' }, business._id);
        }
      }

      if (!isDryRun) {
        await business.save();
      }
      structuredLogger.logSuccess('Business migrated successfully', { businessId: business._id });
    } catch (error) {
      structuredLogger.logErrorBlock(error, { businessId: business._id, error: error.message });
    }
  }
}

export default migrateBusinesses;

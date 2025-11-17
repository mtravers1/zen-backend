import User from "../database/models/User.js";
import Business from "../database/models/Businesses.js";
import { businessColors } from "../constants/colors.js";
import Transaction from "../database/models/Transaction.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import accountsService from "./accounts.service.js";

import {
  encryptValue,
  getUserDek,
  decryptValue,
} from "../database/encryption.js";

import {
  createSafeEncrypt,
  createSafeDecrypt,
} from "../lib/encryptionHelper.js";

const addBusinesses = async (businessList, email, uid) => {
  const user = await User.findOne({ authUid: uid });

  if (!user) {
    throw new Error("User not found");
  }
  const dek = await getUserDek(uid);
  const safeEncrypt = createSafeEncrypt(uid, dek);

  const userId = user._id.toString();

  const usedColors = new Set();
  for (const businessData of businessList) {
    if (businessData.name === "") continue;
    const ownership = {
      percentage: businessData.ownership,
    };

    let color = null;

    if (businessData.photo) {
      //TODO: cuando guardemos fotos, extraer el color de la foto y guardarlo
    } else {
      const availableColors = businessColors.filter((c) => !usedColors.has(c));

      if (availableColors.length > 0) {
        color =
          availableColors[Math.floor(Math.random() * availableColors.length)];
        usedColors.add(color);
      } else {
        color =
          businessColors[Math.floor(Math.random() * businessColors.length)];
      }
    }

    const encryptedName = await safeEncrypt(businessData.name, {
      field: "name",
    });
    const encryptedIndustryDesc = await safeEncrypt(businessData.industry, {
      field: "industry",
    });

    const encryptedBusinessLogo = await safeEncrypt(
      businessData.businessLogo,
      { field: "businessLogo" },
    );

    const encryptedBusinessOwners = await Promise.all(
      businessData.businessOwners.map(async (owner) => {
        if (owner.name === "") return null;
        return await safeEncrypt(owner.name, {
          field: "businessOwnerName",
        });
      })
    );

    const encryptedBusinessLocations = businessData.businessLocations
      ? await Promise.all(
          businessData.businessLocations.map(async (address) => {
            return {
              name: address.name,
              street: address.street ? await safeEncrypt(address.street, { field: "address.street" }) : null,
              city: address.city ? await safeEncrypt(address.city, { field: "address.city" }) : null,
              state: address.state ? await safeEncrypt(address.state, { field: "address.state" }) : null,
              postalCode: address.postalCode ? await safeEncrypt(address.postalCode, { field: "address.postalCode" }) : null,
              country: address.country ? await safeEncrypt(address.country, { field: "address.country" }) : null,
              addressLine1: address.addressLine1 ? await safeEncrypt(address.addressLine1, { field: "address.addressLine1" }) : null,
              addressLine2: address.addressLine2 ? await safeEncrypt(address.addressLine2, { field: "address.addressLine2" }) : null,
              type: address.type,
            };
          })
        )
      : [];

    const encryptedPhoneNumbers = businessData.phoneNumbers
      ? await Promise.all(
          businessData.phoneNumbers.map(async (phone) => {
            return {
              phone: phone.phone ? await safeEncrypt(phone.phone, { field: "phone.phone" }) : null,
              phoneType: phone.phoneType,
            };
          })
        )
      : [];
    const encryptedEntityType = businessData.entityType ? await safeEncrypt(businessData.entityType, {
        field: 'entityType',
    }) : null;
    const encryptedSubsidiaries = businessData.subsidiaries ? await safeEncrypt(businessData.subsidiaries, {
        field: 'subsidiaries',
    }) : null;
    const encryptedBusinessDescription = businessData.businessDescription ? await safeEncrypt(
        businessData.businessDescription,
        { field: 'businessDescription' }
    ) : null;
    const encryptedWebsite = businessData.website ? await safeEncrypt(businessData.website, {
        field: 'website',
    }) : null;
    const encryptedFormationDate = businessData.formationDate ? await safeEncrypt(businessData.formationDate, {
        field: 'formationDate',
    }) : null;
    const encryptedTaxInformation = businessData.taxInformation ? await safeEncrypt(businessData.taxInformation, {
        field: 'taxInformation',
    }) : null;
    const encryptedLegalName = businessData.legalName ? await safeEncrypt(businessData.legalName, {
        field: 'legalName',
    }) : null;
    const encryptedBusinessType = businessData.businessType ? await safeEncrypt(businessData.businessType, {
        field: 'businessType',
    }) : null;

    const encryptedBusinessTaxType = businessData.businessTaxType ? await safeEncrypt(businessData.businessTaxType, {
        field: 'businessTaxType',
    }) : null;

    const encryptedBusinessCode = businessData.businessCode ? await safeEncrypt(businessData.businessCode, {
        field: 'businessCode',
    }) : null;

    const encryptedOwnership = businessData.ownership ? {
      percentage: await safeEncrypt(String(businessData.ownership), {
        field: 'ownership.percentage',
      })
    } : null;

    const encryptedBusinessOwnersDetails = businessData.businessOwnersDetails
      ? await Promise.all(
          businessData.businessOwnersDetails.map(async (owner) => {
            return {
              name: await safeEncrypt(owner.name, { field: "owner.name" }),
              email: owner.email
                ? await safeEncrypt(owner.email, { field: "owner.email" })
                : null,
              percentOwned: owner.percentOwned,
              position: owner.position,
            };
          })
        )
      : [];

    const newBusiness = new Business({
      userId: userId,
      name: encryptedName,
      industryDesc: encryptedIndustryDesc,
      ownership: encryptedOwnership,
      businessLogo: encryptedBusinessLogo,
      numAccounts: businessData.accounts,
      color: color,
      businessOwners: encryptedBusinessOwners.filter(owner => owner !== null),
      businessLocations: encryptedBusinessLocations,
      phoneNumbers: encryptedPhoneNumbers,
      entityType: encryptedEntityType,
      subsidiaries: encryptedSubsidiaries,
      businessDescription: encryptedBusinessDescription,
      website: encryptedWebsite,
      formationDate: encryptedFormationDate,
      taxInformation: encryptedTaxInformation,
      legalName: encryptedLegalName,
      businessType: encryptedBusinessType,
      businessTaxType: encryptedBusinessTaxType,
      businessCode: encryptedBusinessCode,
      businessOwnersDetails: encryptedBusinessOwnersDetails,
    });

    await newBusiness.save();
  }

  return { message: "Businesses added successfully" };
};

const getUserProfiles = async (email, uid) => {
  console.log(
    `[getUserProfiles] Starting profile retrieval for email: ${email}, uid: ${uid}`,
  );

  try {
    const user = await User.findOne({
      authUid: uid,
    }).lean();

    if (!user) {
      console.error(`[getUserProfiles] User not found for uid: ${uid}`);
      throw new Error("User not found");
    }

    console.log(`[getUserProfiles] User found: ${user._id}`);

    const profiles = [];
    const dek = await getUserDek(uid);
    const safeDecrypt = createSafeDecrypt(uid, dek);

    console.log(`[getUserProfiles] DEK obtained:`, {
      hasDek: !!dek,
      dekType: typeof dek,
      dekLength: dek ? dek.length : 0,
    });

    // Decrypt user name fields with error handling
    const decryptedFirstName = user.name.firstName
      ? await safeDecrypt(user.name.firstName, {
          user_id: user._id,
          field: "firstName",
        })
      : null;
    const decryptedLastName = user.name.lastName
      ? await safeDecrypt(user.name.lastName, {
          user_id: user._id,
          field: "lastName",
        })
      : null;
    const decryptedMiddleName = user.name.middleName
      ? await safeDecrypt(user.name.middleName, {
          user_id: user._id,
          field: "middleName",
        })
      : null;
    const decryptedSuffix = user.name.suffix
      ? await safeDecrypt(user.name.suffix, {
          user_id: user._id,
          field: "suffix",
        })
      : null;
    const decryptedPrefix = user.name.prefix
      ? await safeDecrypt(user.name.prefix, {
          user_id: user._id,
          field: "prefix",
        })
      : null;

    const decryptedPhotoUrl = user.profilePhotoUrl
      ? await safeDecrypt(user.profilePhotoUrl, {
          user_id: user._id,
          field: "profilePhotoUrl",
        })
      : null;

    let name;
    if (!decryptedFirstName && !decryptedLastName) {
      name = email;
      console.log(`[getUserProfiles] Using email as name: ${name}`);
    } else {
      name = decryptedFirstName + " " + decryptedLastName;
      console.log(`[getUserProfiles] Using decrypted name: ${name}`);
    }

    const decryptedEmail = [];
    for (const emailData of user.email) {
      const email = await safeDecrypt(emailData.email, {
        user_id: user._id,
        field: "email",
      });
      decryptedEmail.push({ email, emailType: emailData.emailType, isPrimary: emailData.isPrimary });
    }

    const decryptedPhones = [];
    for (const phoneData of user.phones) {
      const phone = await safeDecrypt(phoneData.phone, {
        user_id: user._id,
        field: "phone",
      });
      decryptedPhones.push({ phoneNumber: phone, phoneType: phoneData.phoneType });
    }

    const personalProfile = {
      id: user._id,
      name,
      nameParts: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
        prefix: decryptedPrefix,
        suffix: decryptedSuffix,
      },
      photo: decryptedPhotoUrl,
      plaidAccounts: user.plaidAccounts,
      isPersonal: true,
      color: null,
      personal_emails: decryptedEmail, //<- No need to encrypt
      personal_phones: decryptedPhones, //<- No need to encrypt
    };

    profiles.push(personalProfile);
    const userId = user._id.toString();

    const businesses = await Business.find({ userId }).lean();

    if (!businesses.length) {
      return profiles;
    }

    for (const business of businesses) {
      console.log(`[getUserProfiles] Processing business: ${business._id}`);

      const decryptedName = await safeDecrypt(business.name, {
        business_id: business._id,
        field: "name",
      });
      const decryptedIndustry = await safeDecrypt(business.industryDesc, {
        business_id: business._id,
        field: "industryDesc",
      });
      const decryptedBusinessLogo = await safeDecrypt(
        business.businessLogo,
        { business_id: business._id, field: "businessLogo" },
      );

      let decryptedBusinessOwnersDetails = [];
      if (business.businessOwnersDetails) {
        for (const owner of business.businessOwnersDetails) {
          const decryptedOwnerName = owner.name ? await safeDecrypt(owner.name, { business_id: business._id, field: "owner.name" }) : null;
          const decryptedOwnerEmail = owner.email ? await safeDecrypt(owner.email, { business_id: business._id, field: "owner.email" }) : null;
          decryptedBusinessOwnersDetails.push({
            name: decryptedOwnerName,
            email: decryptedOwnerEmail,
            percentOwned: owner.percentOwned,
            position: owner.position,
          });
        }
      }

      const decryptedBusinessOwners = [];
      if (business.businessOwners) {
        for (const owner of business.businessOwners) {
          const decryptedOwner = await safeDecrypt(owner, {
            business_id: business._id,
            field: "businessOwnerName",
          });
          decryptedBusinessOwners.push(decryptedOwner);
        }
      }

      const decryptedBusinessAddresses = [];
      if (business.businessLocations) {
        for (const address of business.businessLocations) {
          const decryptedStreet = address.street ? await safeDecrypt(address.street, { business_id: business._id, field: "address.street" }) : null;
          const decryptedCity = address.city ? await safeDecrypt(address.city, { business_id: business._id, field: "address.city" }) : null;
          const decryptedState = address.state ? await safeDecrypt(address.state, { business_id: business._id, field: "address.state" }) : null;
          const decryptedPostalCode = address.postalCode ? await safeDecrypt(address.postalCode, { business_id: business._id, field: "address.postalCode" }) : null;
          const decryptedCountry = address.country ? await safeDecrypt(address.country, { business_id: business._id, field: "address.country" }) : null;
          const decryptedAddressLine1 = address.addressLine1 ? await safeDecrypt(address.addressLine1, { business_id: business._id, field: "address.addressLine1" }) : null;
          const decryptedAddressLine2 = address.addressLine2 ? await safeDecrypt(address.addressLine2, { business_id: business._id, field: "address.addressLine2" }) : null;
          decryptedBusinessAddresses.push({
            name: address.name,
            street: decryptedStreet,
            city: decryptedCity,
            state: decryptedState,
            postalCode: decryptedPostalCode,
            country: decryptedCountry,
            addressLine1: decryptedAddressLine1,
            addressLine2: decryptedAddressLine2,
            type: address.type,
          });
        }
      }

      const decryptedBusinessPhoneNumbers = [];
      if (business.phoneNumbers) {
        for (const phone of business.phoneNumbers) {
          const decryptedPhone = phone.phone ? await safeDecrypt(phone.phone, { business_id: business._id, field: "phone.phone" }) : null;
          decryptedBusinessPhoneNumbers.push({
            phone: decryptedPhone,
            phoneType: phone.phoneType,
          });
        }
      }
      const decryptedEntityType = business.entityType
        ? await safeDecrypt(business.entityType, {
            business_id: business._id,
            field: "entityType",
          })
        : null;
      const decryptedSubsidiaries = [];
      if (business.subsidiaries) {
        for (const subsidiary of business.subsidiaries) {
          const decryptedSubsidiary = await safeDecrypt(subsidiary, {
            business_id: business._id,
            field: "subsidiaries",
          });
          decryptedSubsidiaries.push(decryptedSubsidiary);
        }
      }
      const decryptedBusinessDesc = business.businessDescription
        ? await safeDecrypt(business.businessDescription, {
            business_id: business._id,
            field: "businessDescription",
          })
        : null;
      const decryptedWebsite = business.website
        ? await safeDecrypt(business.website, {
            business_id: business._id,
            field: "website",
          })
        : null;
      const decryptedFormationDate = business.formationDate
        ? await safeDecrypt(business.formationDate, {
            business_id: business._id,
            field: "formationDate",
          })
        : null;
      const decryptedTaxInformation = business.taxInformation
        ? await safeDecrypt(business.taxInformation, {
            business_id: business._id,
            field: "taxInformation",
          })
        : null;
      const decryptedLegalName = business.legalName
        ? await safeDecrypt(business.legalName, {
            business_id: business._id,
            field: "legalName",
          })
        : null;
      const decryptedOwnershipPercentage = business.ownership && business.ownership.percentage
        ? await safeDecrypt(business.ownership.percentage, {
            business_id: business._id,
            field: "ownership.percentage",
          })
        : null;


      const decryptedBusinessType = business.businessType
        ? await safeDecrypt(business.businessType, {
            business_id: business._id,
            field: "businessType",
          })
        : null;

      const decryptedBusinessCode = business.businessCode
        ? await safeDecrypt(business.businessCode, {
            business_id: business._id,
            field: "businessCode",
          })
        : null;

      const businessProfile = {
        id: business._id,
        name: decryptedName,
        photo: decryptedBusinessLogo,
        plaidAccounts: business.plaidAccountIds,
        isPersonal: false,
        color: business.color,
        businessOwnersDetails: decryptedBusinessOwnersDetails,
        businessOwners: decryptedBusinessOwners,
        businessAddresses: decryptedBusinessAddresses,
        businessPhoneNumbers: decryptedBusinessPhoneNumbers,
        subsidiaries: decryptedSubsidiaries,
        businessDescription: decryptedBusinessDesc,
        website: decryptedWebsite,
        formationDate: decryptedFormationDate,
        taxInformation: decryptedTaxInformation,
        legalBusinessName: decryptedLegalName,
        ownership: business.ownership ? {
          percentage: decryptedOwnershipPercentage,
          _id: business.ownership._id,
        } : null,
        entityType: decryptedEntityType,
        businessType: decryptedBusinessType,
        businessTaxCode: decryptedBusinessCode,
        businessEntityType: decryptedEntityType,
      };
      profiles.push(businessProfile);
    }

    const businessAccounts = businesses.flatMap((b) => b.plaidAccountIds || []);
    const uniqueBusinessAccountIds = new Set(
      businessAccounts.map((id) => id.toString()),
    );

    personalProfile.plaidAccounts = (user.plaidAccounts || []).filter(
      (acc) => !uniqueBusinessAccountIds.has(acc.toString()),
    );

    for (const profile of profiles) {
      const photoPath = profile.isPersonal
        ? `profilePhotos/${email}.jpg`
        : `profilePhotos/${profile.name}.jpg`;

      let photo;
      if (!profile.photo) {
        photo = await accountsService.generateSignedUrl(photoPath);
      }
      profile.photo = photo ? photo : profile.photo;
    }

    for (const profile of profiles) {
      const photoPath = profile.isPersonal
        ? `profilePhotos/${email}.jpg`
        : `profilePhotos/${profile.name}.jpg`;

      let photo;
      if (!profile.photo) {
        photo = await accountsService.generateSignedUrl(photoPath);
      }
      profile.photo = photo ? photo : profile.photo;
    }

    return profiles;
  } catch (error) {
    console.error(`[getUserProfiles] Error during profile retrieval:`, error);
    throw new Error(error.message || "Failed to retrieve user profiles");
  }
};

const assignsAccountsToProfiles = async (data, email, uid) => {
  const profiles = await getUserProfiles(email, uid);
  for (const [key, value] of Object.entries(data)) {
    const profile = profiles.find((p) => String(p.id) === value);
    if (!profile) {
      throw new Error("Profile not found");
    }

    if (profile.isPersonal) {
      continue;
    }

    const business = await Business.findById(profile.id);
    if (!business) {
      throw new Error("Business not found");
    }

    if (!business.plaidAccountIds) {
      business.plaidAccountIds = [];
    }

    // Check if key is a valid ObjectId (24 character hex string)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(key);

    let accountObjectId;

    if (isValidObjectId) {
      // If it's a valid ObjectId, use it directly
      accountObjectId = key;
    } else {
      // If it's not a valid ObjectId, assume it's a Plaid account ID and find the document
      try {
        const plaidAccount = await PlaidAccount.findOne({
          plaid_account_id: key,
        });
        if (!plaidAccount) {
          throw new Error(`Plaid account not found for ID: ${key}`);
        }
        accountObjectId = plaidAccount._id;
      } catch (error) {
        console.error(`Error finding Plaid account for ID: ${key}`, error);
        throw new Error(`Invalid Plaid account ID: ${key}`);
      }
    }

    if (!business.plaidAccountIds.includes(accountObjectId)) {
      business.plaidAccountIds.push(accountObjectId);
    }

    await business.save();
  }

  return { message: "Accounts assigned successfully" };
};

const unlinkAccounts = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  const businesses = await Business.find({ userId: user._id });

  for (const account of data) {
    const plaidAccount = await PlaidAccount.findById(account.id);
    const plaidAccountId = plaidAccount.plaid_account_id;

    await Transaction.deleteMany({
      plaidAccountId: plaidAccountId,
    });
    await User.updateOne(
      { _id: user._id },
      { $pull: { plaidAccounts: account.id } },
    );

    for (const business of businesses) {
      if (business.plaidAccountIds.includes(account.id)) {
        business.plaidAccountIds = business.plaidAccountIds.filter(
          (id) => id !== account.id,
        );
        await business.save();
      }
    }

    await PlaidAccount.deleteOne({ _id: account.id });
  }
  return { message: "Accounts unlinked successfully" };
};

const assignAccountToProfile = async (email, profileId, accountIds, uid) => {
  const profiles = await getUserProfiles(email, uid);
  const profile = profiles.find((p) => String(p.id) === profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }
  if (profile.isPersonal) {
    return { message: "Account assigned successfully" };
  }

  const business = await Business.findById(profile.id);
  if (!business) {
    throw new Error("Business not found");
  }

  if (!business.plaidAccountIds) {
    business.plaidAccountIds = [];
  }

  for (const accountId of accountIds) {
    try {
      const plaidAccount = await PlaidAccount.findOne({
        plaid_account_id: accountId,
      });
      if (!plaidAccount) {
        throw new Error("Plaid account not found");
      }
      if (!business.plaidAccountIds.includes(plaidAccount._id)) {
        business.plaidAccountIds.push(plaidAccount._id);
      }
    } catch (error) {
      console.error(`Invalid ObjectId: ${accountId}`, error);
    }
  }

  await business.save();
  return { message: "Account assigned successfully" };
};

const updateBusinessProfile = async (profileId, formData, email, uid) => {
  console.log(`[updateBusinessProfile] Starting profile update for profileId: ${profileId}`);
  console.log(`[updateBusinessProfile] Received formData:`, formData);

  const dek = await getUserDek(uid);
  const safeEncrypt = createSafeEncrypt(uid, dek);
  try {
    if (!profileId) {
      console.error("[updateBusinessProfile] Error: No profileId provided.");
      throw new Error("No profile selected to update.");
    }

    if (formData.isPersonal) {
      const encryptedProfilePhotoUrl = await safeEncrypt(
        formData.profilePhotoUrl,
        { profile_id: profileId, field: "profilePhotoUrl" },
      );

      const encryptedFirstName = await safeEncrypt(formData.nameParts.firstName, {
        profile_id: profileId,
        field: "firstName",
      });
      const encryptedLastName = await safeEncrypt(formData.nameParts.lastName, {
        profile_id: profileId,
        field: "lastName",
      });
      const encryptedMiddleName = formData.nameParts.middleName ? await safeEncrypt(formData.nameParts.middleName, { profile_id: profileId, field: "middleName" }) : null;
      const encryptedPrefix = formData.nameParts.prefix ? await safeEncrypt(formData.nameParts.prefix, { profile_id: profileId, field: "prefix" }) : null;
      const encryptedSuffix = formData.nameParts.suffix ? await safeEncrypt(formData.nameParts.suffix, { profile_id: profileId, field: "suffix" }) : null;

      const encryptedEmails = await Promise.all(
        formData.email.map(async (emailData) => ({
          email: await safeEncrypt(emailData.email, { profile_id: profileId, field: "email" }),
          emailType: emailData.emailType,
          isPrimary: emailData.isPrimary,
        }))
      );

      const encryptedPhones = await Promise.all(
        formData.phones.map(async (phoneData) => ({
          phone: await safeEncrypt(phoneData.phoneNumber, { profile_id: profileId, field: "phone" }),
          phoneType: phoneData.phoneType,
        }))
      );

      const updatedPersonalProfile = await User.findByIdAndUpdate(
        profileId,
        {
          name: {
            firstName: encryptedFirstName,
            lastName: encryptedLastName,
            middleName: encryptedMiddleName,
            prefix: encryptedPrefix,
            suffix: encryptedSuffix,
          },
          email: encryptedEmails,
          phones: encryptedPhones,
          profilePhotoUrl: encryptedProfilePhotoUrl, //TODO:validate upload in other process
        },
        { new: true },
      );
      return {
        message: "Personal profile updated successfully.",
        updatedPersonalProfile,
      };
    }

    const encryptedBusinessOwnersDetails = formData.businessOwnersDetails
      ? await Promise.all(
          formData.businessOwnersDetails.map(async (owner) => {
            return {
              name: await safeEncrypt(owner.name, { profile_id: profileId, field: "owner.name" }),
              email: owner.email
                ? await safeEncrypt(owner.email, { profile_id: profileId, field: "owner.email" })
                : null,
              percentOwned: owner.percentOwned,
              position: owner.position,
            };
          })
        )
      : [];

    //const encryptedTaxInformation = await safeEncrypt(formData.taxId, dek);//TODO: not implemented yet

    const encryptedBusinessLogo = await safeEncrypt(
      formData.businessLogo,
      { profile_id: profileId, field: "businessLogo" },
    );

    const encryptedEntityType = await safeEncrypt(formData.entityType, {
      profile_id: profileId,
      field: "entityType",
    });
    const encryptedBusinessTaxType = await safeEncrypt(
      formData.businessTaxType,
      { profile_id: profileId, field: "businessTaxType" },
    );

    const encryptedBusinessType = formData.businessType ? await safeEncrypt(formData.businessType, {
        profile_id: profileId,
        field: 'businessType',
    }) : null;
    const encryptedLegalName = await safeEncrypt(
      formData.legalName,
      { profile_id: profileId, field: "legalName" },
    );
    const encryptedIndustryDesc = await safeEncrypt(
      formData.industryDesc,
      { profile_id: profileId, field: "industryDesc" },
    );

    const encryptedBusinessDescription = formData.businessDescription ? await safeEncrypt(
        formData.businessDescription,
        { profile_id: profileId, field: 'businessDescription' }
    ) : null;

    const encryptedWebsite = formData.website ? await safeEncrypt(formData.website, {
        profile_id: profileId,
        field: 'website',
    }) : null;

    const encryptedBusinessLocations = formData.businessAddresses
      ? await Promise.all(
          formData.businessAddresses.map(async (address) => {
            return {
              name: address.name,
              street: address.street ? await safeEncrypt(address.street, { profile_id: profileId, field: "address.street" }) : null,
              city: address.city ? await safeEncrypt(address.city, { profile_id: profileId, field: "address.city" }) : null,
              state: address.state ? await safeEncrypt(address.state, { profile_id: profileId, field: "address.state" }) : null,
              postalCode: address.postalCode ? await safeEncrypt(address.postalCode, { profile_id: profileId, field: "address.postalCode" }) : null,
              country: address.country ? await safeEncrypt(address.country, { profile_id: profileId, field: "address.country" }) : null,
              addressLine1: address.addressLine1 ? await safeEncrypt(address.addressLine1, { profile_id: profileId, field: "address.addressLine1" }) : null,
              addressLine2: address.addressLine2 ? await safeEncrypt(address.addressLine2, { profile_id: profileId, field: "address.addressLine2" }) : null,
              type: address.type,
            };
          })
        )
      : [];

    const encryptedPhoneNumbers = formData.businessPhones
      ? await Promise.all(
          formData.businessPhones.map(async (phone) => {
            return {
              phone: phone.phone ? await safeEncrypt(phone.phone, { profile_id: profileId, field: "phone.phone" }) : null,
              phoneType: phone.phoneType,
            };
          })
        )
      : [];

    const encryptedFormationDate = formData.formationDate ? await safeEncrypt(formData.formationDate, {
        profile_id: profileId,
        field: 'formationDate',
    }) : null;

    const encryptedBusinessCode = formData.businessTaxCode ? await safeEncrypt(formData.businessTaxCode, {
        profile_id: profileId,
        field: 'businessTaxCode',
    }) : null;

    const encryptedSubsidiaries = formData.subsidiaries
      ? await Promise.all(
          formData.subsidiaries.map(async (subsidiary) => {
            return await safeEncrypt(subsidiary.name, { profile_id: profileId, field: "subsidiary.name" });
          })
        )
      : [];

    const encryptedBusinessOwners = formData.businessOwners
      ? await Promise.all(
          formData.businessOwners.map(async (owner) => {
            return await safeEncrypt(owner, { profile_id: profileId, field: "businessOwner" });
          })
        )
      : [];

    const encryptedOwnershipPercentage = formData.ownership && formData.ownership.percentage ? await safeEncrypt(String(formData.ownership.percentage), {
        profile_id: profileId,
        field: 'ownership.percentage',
    }) : null;

    const encryptedTaxInformation = formData.taxInformation ? await safeEncrypt(formData.taxInformation, {
        profile_id: profileId,
        field: 'taxInformation',
    }) : null;

    const updatedProfile = await Business.findByIdAndUpdate(
      profileId,
      {
        phoneNumbers: encryptedPhoneNumbers,
        legalName: encryptedLegalName,

        businessLocations: encryptedBusinessLocations,
        formationDate: encryptedFormationDate,
        businessDescription: encryptedBusinessDescription,
        businessCode: encryptedBusinessCode,
        entityType: encryptedEntityType,
        industryDesc: encryptedIndustryDesc,
        businessType: encryptedBusinessType,
        businessTaxType: encryptedBusinessTaxType,
        subsidiaries: encryptedSubsidiaries,
        businessOwners: encryptedBusinessOwners,
        businessOwnersDetails: encryptedBusinessOwnersDetails,
        'ownership.percentage': encryptedOwnershipPercentage,
        taxInformation: encryptedTaxInformation,
        website: encryptedWebsite,
        businessLogo: encryptedBusinessLogo,
      },
      { new: true },
    );

    if (!updatedProfile) {
      throw new Error("Business profile not found or update failed.");
    }

    console.log("Business information updated successfully:", updatedProfile);
    return {
      message: "Business information updated successfully.",
      updatedProfile,
    };
  } catch (error) {
    console.error("Error updating profile:", error);
    throw new Error(error.message || "Failed to update business information");
  }
};

const deleteProfile = async (profileId, uid) => {
  const dek = await getUserDek(uid);
  try {
    if (!profileId) {
      throw new Error("No profile selected to delete.");
    }
    const deletedProfile = await Business.findByIdAndDelete(profileId);
    if (!deletedProfile) {
      throw new Error("Profile not found or delete failed.");
    }
    return { message: "Profile deleted successfully.", deletedProfile };
  } catch (error) {
    console.error("Error deleting profile:", error);
    throw new Error(error.message || "Failed to delete profile");
  }
};

const businessService = {
  addBusinesses,
  getUserProfiles,
  assignsAccountsToProfiles,
  unlinkAccounts,
  assignAccountToProfile,
  updateBusinessProfile,
  deleteProfile,
};

export default businessService;

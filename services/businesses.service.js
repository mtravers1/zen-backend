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

    const businessOwners = [];
    for (const owner of businessData.businessOwners) {
      if (owner.name === "") continue;
      businessOwners.push(owner.name);
    }

    const encryptedName = await safeEncrypt(businessData.name, {
      field: "name",
    });
    const encryptedIndustry = await safeEncrypt(businessData.industry, {
      field: "industry",
    });

    const encryptedBusinessLogo = await safeEncrypt(
      businessData.businessLogo,
      { field: "businessLogo" },
    );

    const newBusiness = new Business({
      userId: userId,
      name: encryptedName,
      industryDesc: encryptedIndustry,
      ownership: ownership,
      businessLogo: encryptedBusinessLogo,
      numAccounts: businessData.accounts,
      color: color,
      businessOwners: businessOwners,
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
    const decryptedFirstName = await safeDecrypt(user.name.firstName, {
      user_id: user._id,
      field: "firstName",
    });
    const decryptedLastName = await safeDecrypt(user.name.lastName, {
      user_id: user._id,
      field: "lastName",
    });
    const decryptedMiddleName = await safeDecrypt(user.name.middleName, {
      user_id: user._id,
      field: "middleName",
    });
    const decryptedSuffix = await safeDecrypt(user.name.suffix, {
      user_id: user._id,
      field: "suffix",
    });
    const decryptedPrefix = await safeDecrypt(user.name.prefix, {
      user_id: user._id,
      field: "prefix",
    });

    const decryptedPhotoUrl = await safeDecrypt(user.profilePhotoUrl, {
      user_id: user._id,
      field: "profilePhotoUrl",
    });

    let name;
    if (!decryptedFirstName && !decryptedLastName) {
      name = email;
      console.log(`[getUserProfiles] Using email as name: ${name}`);
    } else {
      name = decryptedFirstName + " " + decryptedLastName;
      console.log(`[getUserProfiles] Using decrypted name: ${name}`);
    }

    const decryptedEmail = await Promise.all(
      user.email.map((emailData) =>
        Promise.all([
          safeDecrypt(emailData.email, {
            user_id: user._id,
            field: "email",
          }),
          emailData.emailType,
          emailData.isPrimary,
        ]).then(([email, emailType, isPrimary]) => ({
          email,
          emailType,
          isPrimary,
        })),
      ),
    );

    const decryptedPhones = await Promise.all(
      user.phones.map((phoneData) =>
        Promise.all([
          safeDecrypt(phoneData.phone, {
            user_id: user._id,
            field: "phone",
          }),
          phoneData.phoneType,
        ]).then(([phone, phoneType]) => ({
          phoneNumber: phone,
          phoneType,
        })),
      ),
    );

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
        decryptedBusinessOwnersDetails = await Promise.all(
          business.businessOwnersDetails.map(async (owner) => {
            return {
              name: owner.name,
              email: await safeDecrypt(owner.email, {
                business_id: business._id,
                field: "owner.email",
              }),
              percentOwned: owner.percentOwned,
              position: owner.position,
            };
          }),
        );
      }

      const decryptedBusinessOwners = business.businessOwners
        ? await safeDecrypt(business.businessOwners, {
            business_id: business._id,
            field: "businessOwners",
          })
        : [];
      const decryptdBusinessAddresses = business.businessLocations
        ? await safeDecrypt(business.businessLocations, {
            business_id: business._id,
            field: "businessLocations",
          })
        : [];
      const decryptdBusinessPhoneNumbers = business.phoneNumbers
        ? await safeDecrypt(business.phoneNumbers, {
            business_id: business._id,
            field: "phoneNumbers",
          })
        : [];
      const descyptEntityType = business.entityType
        ? await safeDecrypt(business.entityType, {
            business_id: business._id,
            field: "entityType",
          })
        : null;
      const descryptsubsidiaries = business.subsidiaries
        ? await safeDecrypt(business.subsidiaries, {
            business_id: business._id,
            field: "subsidiaries",
          })
        : [];
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
      const formationDate = business.formationDate
        ? await safeDecrypt(business.formationDate, {
            business_id: business._id,
            field: "formationDate",
          })
        : null;
      const taxInformation = business.taxInformation
        ? await safeDecrypt(business.taxInformation, {
            business_id: business._id,
            field: "taxInformation",
          })
        : null;
      const legalName = business.legalName
        ? await safeDecrypt(business.legalName, {
            business_id: business._id,
            field: "legalName",
          })
        : null;
      const ownership = business.ownership
        ? await safeDecrypt(business.ownership, {
            business_id: business._id,
            field: "ownership",
          })
        : null;
      const entityType = business.industryDesc
        ? await safeDecrypt(business.industryDesc, {
            business_id: business._id,
            field: "industryDesc",
          })
        : null;
      const businessType = business.businessType
        ? await safeDecrypt(business.businessType, {
            business_id: business._id,
            field: "businessType",
          })
        : null;
      const entityTaxType = business.entityType
        ? await safeDecrypt(business.entityType, {
            business_id: business._id,
            field: "entityType",
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
        businessAddresses: decryptdBusinessAddresses,
        businessPhoneNumbers: decryptdBusinessPhoneNumbers,
        subsidiaries: descryptsubsidiaries,
        businessDescription: decryptedBusinessDesc,
        website: decryptedWebsite,
        formationDate: formationDate,
        taxInformation: taxInformation,
        legalBusinessName: legalName,
        ownership: ownership?.percentage || null,
        entityType: entityType,
        businessType: businessType,
        businessTaxCode: entityTaxType,
        businessEntityType: entityType,
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
  const dek = await getUserDek(uid);
  const safeEncrypt = createSafeEncrypt(uid, dek);
  try {
    if (!profileId) {
      throw new Error("No profile selected to update.");
    }

    if (formData.isPersonal) {
      const encryptedProfilePhotoUrl = await safeEncrypt(
        formData.profilePhotoUrl,
        { profile_id: profileId, field: "profilePhotoUrl" },
      );

      const updatedPersonalProfile = await User.findByIdAndUpdate(
        profileId,
        {
          name: formData.nameParts,
          email: formData.email,
          phones: formData.phones,
          profilePhotoUrl: encryptedProfilePhotoUrl, //TODO:validate upload in other process
        },
        { new: true },
      );
      return {
        message: "Personal profile updated successfully.",
        updatedPersonalProfile,
      };
    }

    const businessOwnersDetails = formData.businessOwnersDetails.map(
      (owner) => {
        return {
          name: owner.name,
          email: owner.email, //<- No need to encrypt
          percentOwned: owner.percentOwned,
          position: owner.position,
        };
      },
    );

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
    const encryptedLegalName = await safeEncrypt(
      formData.legalBusinessName,
      { profile_id: profileId, field: "legalBusinessName" },
    );

    const updatedProfile = await Business.findByIdAndUpdate(
      profileId,
      {
        phoneNumbers: formData.businessPhones,
        legalName: encryptedLegalName,

        businessLocations: formData.businessAddresses,
        formationDate: formData.formationDate,
        businessDescription: formData.businessDescription,
        businessCode: formData.businessTaxCode,
        entityType: encryptedBusinessTaxType,
        industryDesc: encryptedEntityType,
        businessType: formData.businessType,
        subsidiaries: formData.subsidiaries.map(
          (subsidiary) => subsidiary.name,
        ),
        businessOwners: formData.businessOwners,
        businessOwnersDetails: businessOwnersDetails,
        ownership: { percentage: formData.ownership?.percentage || 0 },
        //taxInformation: encryptedTaxInformation, //TODO: not implemented yet
        website: formData.website,
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

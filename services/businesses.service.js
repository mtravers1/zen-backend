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

const addBusinesses = async (businessList, email, uid) => {
  const user = await User.findOne({ authUid: uid });

  if (!user) {
    throw new Error("User not found");
  }

  const dek = await getUserDek(uid);

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

    const encryptedName = await encryptValue(businessData.name, dek);
    const encryptedIndustry = await encryptValue(businessData.industry, dek);

    const encryptedBusinessLogo = await encryptValue(
      businessData.businessLogo,
      dek,
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

    console.log(`[getUserProfiles] DEK obtained:`, {
      hasDek: !!dek,
      dekType: typeof dek,
      dekLength: dek ? dek.length : 0,
    });

    // Decrypt user name fields with error handling
    let decryptedFirstName,
      decryptedLastName,
      decryptedMiddleName,
      decryptedSuffix,
      decryptedPrefix;

    try {
      decryptedFirstName = await decryptValue(user.name.firstName, dek);
      console.log(
        `[getUserProfiles] First name decrypted: ${decryptedFirstName ? "success" : "failed"}`,
      );
    } catch (error) {
      console.error(`[getUserProfiles] Error decrypting first name:`, error);
      decryptedFirstName = null;
    }

    try {
      decryptedLastName = await decryptValue(user.name.lastName, dek);
      console.log(
        `[getUserProfiles] Last name decrypted: ${decryptedLastName ? "success" : "failed"}`,
      );
    } catch (error) {
      console.error(`[getUserProfiles] Error decrypting last name:`, error);
      decryptedLastName = null;
    }

    try {
      decryptedMiddleName = await decryptValue(user.name.middleName, dek);
      console.log(
        `[getUserProfiles] Middle name decrypted: ${decryptedMiddleName ? "success" : "failed"}`,
      );
    } catch (error) {
      console.error(`[getUserProfiles] Error decrypting middle name:`, error);
      decryptedMiddleName = null;
    }

    try {
      decryptedSuffix = await decryptValue(user.name.suffix, dek);
      console.log(
        `[getUserProfiles] Suffix decrypted: ${decryptedSuffix ? "success" : "failed"}`,
      );
    } catch (error) {
      console.error(`[getUserProfiles] Error decrypting suffix:`, error);
      decryptedSuffix = null;
    }

    try {
      decryptedPrefix = await decryptValue(user.name.prefix, dek);
      console.log(
        `[getUserProfiles] Prefix decrypted: ${decryptedPrefix ? "success" : "failed"}`,
      );
    } catch (error) {
      console.error(`[getUserProfiles] Error decrypting prefix:`, error);
      decryptedPrefix = null;
    }

    let decryptedPhotoUrl;
    try {
      decryptedPhotoUrl = await decryptValue(user.profilePhotoUrl, dek);
      console.log(
        `[getUserProfiles] Photo URL decrypted: ${decryptedPhotoUrl ? "success" : "failed"}`,
      );
    } catch (error) {
      console.error(`[getUserProfiles] Error decrypting photo URL:`, error);
      decryptedPhotoUrl = null;
    }

    let name;

    // Check if decryption actually worked (decrypted value should be different from encrypted)
    const firstNameDecrypted =
      decryptedFirstName && decryptedFirstName !== user.name.firstName;
    const lastNameDecrypted =
      decryptedLastName && decryptedLastName !== user.name.lastName;

    if (!firstNameDecrypted && !lastNameDecrypted) {
      name = email;
    } else {
      // Use successfully decrypted values
      const firstName = firstNameDecrypted ? decryptedFirstName : "User";
      const lastName = lastNameDecrypted ? decryptedLastName : "";
      name = `${firstName} ${lastName}`.trim();
    }

    const decryptedEmail = await Promise.all(
      user.email.map((emailData) =>
        Promise.all([
          decryptValue(emailData.email, dek),
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
          decryptValue(phoneData.phone, dek),
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

      let decryptedName, decryptedIndustry, decryptedBusinessLogo;

      try {
        decryptedName = await decryptValue(business.name, dek);
        console.log(
          `[getUserProfiles] Business name decrypted: ${decryptedName ? "success" : "failed"}`,
        );
      } catch (error) {
        console.error(
          `[getUserProfiles] Error decrypting business name:`,
          error,
        );
        decryptedName = "Unknown Business";
      }

      try {
        decryptedIndustry = await decryptValue(business.industryDesc, dek);
        console.log(
          `[getUserProfiles] Business industry decrypted: ${decryptedIndustry ? "success" : "failed"}`,
        );
      } catch (error) {
        console.error(
          `[getUserProfiles] Error decrypting business industry:`,
          error,
        );
        decryptedIndustry = null;
      }

      try {
        decryptedBusinessLogo = await decryptValue(business.businessLogo, dek);
        console.log(
          `[getUserProfiles] Business logo decrypted: ${decryptedBusinessLogo ? "success" : "failed"}`,
        );
      } catch (error) {
        console.error(
          `[getUserProfiles] Error decrypting business logo:`,
          error,
        );
        decryptedBusinessLogo = null;
      }

      let decryptedBusinessOwnersDetails = [];
      if (business.businessOwnersDetails) {
        decryptedBusinessOwnersDetails = await Promise.all(
          business.businessOwnersDetails.map(async (owner) => {
            return {
              name: owner.name,
              email: await decryptValue(owner.email, dek),
              percentOwned: owner.percentOwned,
              position: owner.position,
            };
          }),
        );
      }

      const decryptedBusinessOwners = business.businessOwners
        ? await decryptValue(business.businessOwners, dek)
        : [];
      const decryptdBusinessAddresses = business.businessLocations
        ? await decryptValue(business.businessLocations, dek)
        : [];
      const decryptdBusinessPhoneNumbers = business.phoneNumbers
        ? await decryptValue(business.phoneNumbers, dek)
        : [];
      const descyptEntityType = business.entityType
        ? await decryptValue(business.entityType, dek)
        : null;
      const descryptsubsidiaries = business.subsidiaries
        ? await decryptValue(business.subsidiaries, dek)
        : [];
      const decryptedBusinessDesc = business.businessDescription
        ? await decryptValue(business.businessDescription, dek)
        : null;
      const decryptedWebsite = business.website
        ? await decryptValue(business.website, dek)
        : null;
      const formationDate = business.formationDate
        ? await decryptValue(business.formationDate, dek)
        : null;
      const taxInformation = business.taxInformation
        ? await decryptValue(business.taxInformation, dek)
        : null;
      const legalName = business.legalName
        ? await decryptValue(business.legalName, dek)
        : null;
      const ownership = business.ownership
        ? await decryptValue(business.ownership, dek)
        : null;
      const entityType = business.industryDesc
        ? await decryptValue(business.industryDesc, dek)
        : null;
      const businessType = business.businessType
        ? await decryptValue(business.businessType, dek)
        : null;
      const entityTaxType = business.entityType
        ? await decryptValue(business.entityType, dek)
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
  try {
    if (!profileId) {
      throw new Error("No profile selected to update.");
    }

    if (formData.isPersonal) {
      const encryptedProfilePhotoUrl = await encryptValue(
        formData.profilePhotoUrl,
        dek,
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

    //const encryptedTaxInformation = await encryptValue(formData.taxId, dek);//TODO: not implemented yet

    const encryptedBusinessLogo = await encryptValue(
      formData.businessLogo,
      dek,
    );

    const encryptedEntityType = await encryptValue(formData.entityType, dek);
    const encryptedBusinessTaxType = await encryptValue(
      formData.businessTaxType,
      dek,
    );
    const encryptedLegalName = await encryptValue(
      formData.legalBusinessName,
      dek,
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

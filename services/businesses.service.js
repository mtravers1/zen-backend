import User from "../database/models/User.js";
import Business from "../database/models/Businesses.js";
import { businessColors } from "../constants/colors.js";
import Transaction from "../database/models/Transaction.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import accountsService from "./accounts.service.js";

const addBusinesses = async (businessList, email) => {
  const user = await User.findOne({ "email.email": email.toLowerCase() });

  if (!user) {
    throw new Error("User not found");
  }

  const userId = user._id.toString();

  const usedColors = new Set();

  for (const businessData of businessList) {
    if (businessData.name === "") continue;
    const ownership = {
      ownership: businessData.ownership,
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

    const newBusiness = new Business({
      userId: userId,
      name: businessData.name,
      industryDesc: businessData.industry,
      ownership: ownership,
      businessLogo: businessData.businessLogo,
      numAccounts: businessData.accounts,
      color: color,
      businessOwners: businessOwners,
    });

    await newBusiness.save();
  }

  return { message: "Businesses added successfully" };
};

const getUserProfiles = async (email) => {
  const user = await User.findOne({ "email.email": email.toLowerCase() });

  if (!user) {
    throw new Error("User not found");
  }

  const profiles = [];

  const personalProfile = {
    id: user._id,
    name: user.name.firstName + " " + user.name.lastName,
    nameParts: {
      firstName: user.name.firstName,
      lastName: user.name.lastName,
      middleName: user.name.middleName,
      prefix: user.name.prefix,
      suffix: user.name.suffix,
    },
    photo: user.profilePhotoUrl,
    plaidAccounts: user.plaidAccounts,
    isPersonal: true,
    color: null,
  };

  profiles.push(personalProfile);

  const userId = user._id.toString();

  const businesses = await Business.find({ userId });

  if (!businesses.length) {
    return profiles;
  }

  for (const business of businesses) {
    const businessProfile = {
      id: business._id,
      name: business.name,
      photo: business.businessLogo,
      plaidAccounts: business.plaidAccountIds,
      isPersonal: false,
      color: business.color,
    };
    profiles.push(businessProfile);

    for (const account of business.plaidAccountIds) {
      const index = personalProfile.plaidAccounts.indexOf(account);
      if (index > -1) {
        personalProfile.plaidAccounts.splice(index, 1);
      }
    }
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
};

const assignsAccountsToProfiles = async (data, email) => {
  const profiles = await getUserProfiles(email);
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

    if (!business.plaidAccountIds.includes(key)) {
      business.plaidAccountIds.push(key);
    }

    await business.save();
  }

  return { message: "Accounts assigned successfully" };
};

const unlinkAccounts = async (data, email) => {
  const user = await User.findOne({ "email.email": email.toLowerCase() });
  const businesses = await Business.find({ userId: user._id });

  for (const account of data) {
    const plaidAccount = await PlaidAccount.findById(account.id);
    const plaidAccountId = plaidAccount.plaid_account_id;

    await Transaction.deleteMany({
      plaidAccountId: plaidAccountId,
    });
    await User.updateOne(
      { _id: user._id },
      { $pull: { plaidAccounts: account.id } }
    );

    for (const business of businesses) {
      if (business.plaidAccountIds.includes(account.id)) {
        business.plaidAccountIds = business.plaidAccountIds.filter(
          (id) => id !== account.id
        );
        await business.save();
      }
    }

    await PlaidAccount.deleteOne({ _id: account.id });
  }
  return { message: "Accounts unlinked successfully" };
};

const assignAccountToProfile = async (email, profileId, accountIds) => {
  const profiles = await getUserProfiles(email);
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
      console.log(accountId);
      const plaidAccount = await PlaidAccount.findOne({
        plaid_account_id: accountId,
      });
      console.log(plaidAccount);
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

const businessService = {
  addBusinesses,
  getUserProfiles,
  assignsAccountsToProfiles,
  unlinkAccounts,
  assignAccountToProfile,
};

export default businessService;

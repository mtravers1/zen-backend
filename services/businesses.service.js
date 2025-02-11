import User from "../database/models/User.js";
import Business from "../database/models/Businesses.js";
import { businessColors } from "../constants/colors.js";

const addBusinesses = async (businessList, email) => {
  const user = await User.findOne({ "email.email": email });

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
  const user = await User.findOne({ "email.email": email });

  if (!user) {
    throw new Error("User not found");
  }

  const profiles = [];

  const personalProfile = {
    id: user._id,
    name: user.name.firstName + " " + user.name.lastName,
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

  return profiles;
};

const assignsAccountsToProfiles = async (data, email) => {
  const profiles = await getUserProfiles(email);
  console.log(data);
  for (const profile of profiles) {
    if (profile.isPersonal) {
      continue;
    }
    const business = await Business.findById(profile.id);

    if (!business) {
      throw new Error("Business not found");
    }

    business.plaidAccountIds = data[profile.id];
    await business.save();
  }

  return { message: "Accounts assigned successfully" };
};

const businessService = {
  addBusinesses,
  getUserProfiles,
  assignsAccountsToProfiles,
};

export default businessService;

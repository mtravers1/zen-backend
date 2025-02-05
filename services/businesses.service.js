import User from "../database/models/User.js";
import Business from "../database/models/Businesses.js";

const addBusinesses = async (businessList, email) => {
  const user = await User.findOne({ "email.email": email });

  if (!user) {
    throw new Error("User not found");
  }

  console.log(user);

  const userId = user._id.toString();

  console.log(userId);

  for (const businessData of businessList) {
    const ownership = {
      ownership: businessData.ownership,
    };
    const newBusiness = new Business({
      userId: userId,
      name: businessData.name,
      industryDesc: businessData.industry,
      ownership: ownership,
      businessLogo: businessData.businessLogo,
      numAccounts: businessData.accounts,
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
    name: user.name.firstName,
    photo: user.profilePhotoUrl,
    plaidAccounts: user.plaidAccounts,
    isPersonal: true,
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

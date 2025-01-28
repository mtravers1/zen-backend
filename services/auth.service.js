import User from "../database/models/User.js";

const own = async (email) => {
  const user = await User.findOne({
    "email.email": email,
  }).select("-password");
  return user;
};

const signUp = async (data) => {
  try {
    const existingUser = await User.findOne({
      "email.email": data.email,
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    const emailSchema = {
      email: data.email,
      //TODO: add email type to the schema
      emailType: "personal",
      isPrimary: true,
    };

    const nameSchema = {
      firstName: data.firstName,
      lastName: data.lastName,
      prefix: data.prefix,
      suffix: data.suffix,
      middleName: data.middleName,
    };

    const phoneNumbersSchema = {
      phone: data.phone,
    };

    const addressSchema = {
      street: data.address1,
      city: data.city,
      state: data.state,
      postalCode: data.zip,
      country: data.country,
    };

    const user = new User({
      email: [emailSchema],
      phones: [phoneNumbersSchema],
      role: data.role,
      authUid: data.authUid,
      profilePhotoUrl: data.photoUrl,
      numAccounts: data.numAccounts,
      name: nameSchema,
      maritalStatus: data.maritalStatus,
      address: [addressSchema],
      dateOfBirth: Date.parse(data.dob),
      occupation: data.occupation,
      annualIncome: data.annualIncome,
      ssn: data.ssn,
    });

    await user.save();

    return user;
  } catch (error) {
    console.log("error in signup", error);

    throw new Error(error);
  }
};

const signIn = async (email) => {
  try {
    const user = await User.findOne({
      "email.email": email,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const retrievedUser = {
      id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profilePhotoUrl: user.profilePhotoUrl,
      name: user.name,
    };

    return retrievedUser;
  } catch (error) {
    console.log("error in signin", error);
    throw new Error(error);
  }
};

const checkEmail = async (email, method) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

const authService = {
  signUp,
  signIn,
  checkEmail,
  own,
};

export default authService;

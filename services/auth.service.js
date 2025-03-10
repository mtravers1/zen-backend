import User from "../database/models/User.js";
import admin from "../lib/firebaseAdmin.js";

const own = async (email) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
  }).select("-password");
  return user;
};

const signUp = async (data) => {
  try {
    const existingUser = await User.findOne({
      "email.email": data.email.toLowerCase(),
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    const emailSchema = {
      email: data.email.toLowerCase(),
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
      dateOfBirth: data.dob ? Date.parse(data.dob) : data.dob,
      occupation: data.occupation,
      annualIncome: data.annualIncome,
      ssn: data.ssn,
    });

    await user.save();

    const newUser = await User.findOne({
      authUid: data.authUid,
    });

    const retrievedUser = {
      id: newUser._id,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      profilePhotoUrl: newUser.profilePhotoUrl,
      name: newUser.name,
    };

    return retrievedUser;
  } catch (error) {
    console.log("error in signup", error);

    throw new Error(error);
  }
};

const signIn = async (email) => {
  try {
    const user = await User.findOne({
      "email.email": email.toLowerCase(),
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
    "email.email": email.toLowerCase(),
  });
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

const checkEmailFirebase = async (email) => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    return user;
  } catch (error) {
    throw new Error("User not found");
  }
};

const changeUserPassword = async (email, newPassword) => {
  try {
    const user = await admin.auth().getUserByEmail(email);

    await admin.auth().updateUser(user.uid, {
      password: newPassword,
    });

    console.log(`Password updated successfully for user: ${email}`);
  } catch (error) {
    console.error("Error updating password:", error);
  }
};

const authService = {
  signUp,
  signIn,
  checkEmail,
  own,
  changeUserPassword,
  checkEmailFirebase,
};

export default authService;

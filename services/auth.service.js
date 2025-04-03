import User from "../database/models/User.js";
import { kmsDecrypt, kmsEncrypt } from "../lib/encrypt.js";
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

    const encryptedFirstName = await kmsEncrypt({
      value: data.firstName,
    });

    const encryptedLastName = await kmsEncrypt({
      value: data.lastName,
    });

    const encryptedMiddleName = await kmsEncrypt({
      value: data.middleName,
    });

    const nameSchema = {
      firstName: encryptedFirstName,
      lastName: encryptedLastName,
      prefix: data.prefix,
      suffix: data.suffix,
      middleName: encryptedMiddleName,
    };

    const encryptedPhone = await kmsEncrypt({
      value: data.phone,
    });

    const phoneNumbersSchema = {
      phone: encryptedPhone,
    };

    const addressSchema = {
      street: data.address1,
      city: data.city,
      state: data.state,
      postalCode: data.zip,
      country: data.country,
    };

    const encryptedPhotoUrl = await kmsEncrypt({
      value: data.photoUrl,
    });

    const encryptedAnnualIncome = await kmsEncrypt({
      value: data.annualIncome,
    });

    const encryptedSSn = await kmsEncrypt({
      value: data.ssn,
    });

    const user = new User({
      email: [emailSchema],
      phones: [phoneNumbersSchema],
      role: data.role,
      authUid: data.authUid,
      profilePhotoUrl: encryptedPhotoUrl,
      numAccounts: data.numAccounts,
      name: nameSchema,
      maritalStatus: data.maritalStatus,
      address: [addressSchema],
      dateOfBirth: data.dob ? Date.parse(data.dob) : data.dob,
      occupation: data.occupation,
      annualIncome: encryptedAnnualIncome,
      ssn: encryptedSSn,
    });

    await user.save();

    const newUser = await User.findOne({
      authUid: data.authUid,
    });

    const decryptedFirstName = await kmsDecrypt({
      value: newUser.name.firstName,
    });
    const decryptedLastName = await kmsDecrypt({
      value: newUser.name.lastName,
    });
    const decryptedMiddleName = await kmsDecrypt({
      value: newUser.name.middleName,
    });
    const decryptedPhone = await kmsDecrypt({
      value: newUser.phones[0].phone,
    });
    const decryptedPhotoUrl = await kmsDecrypt({
      value: newUser.profilePhotoUrl,
    });

    const retrievedUser = {
      id: newUser._id,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
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

    const decryptedFirstName = await kmsDecrypt({
      value: user.name.firstName,
    });
    const decryptedLastName = await kmsDecrypt({
      value: user.name.lastName,
    });
    const decryptedMiddleName = await kmsDecrypt({
      value: user.name.middleName,
    });
    const decryptedPhone = await kmsDecrypt({
      value: user.phones[0].phone,
    });
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await kmsDecrypt({
        value: user.profilePhotoUrl,
      });
    }

    const retrievedUser = {
      id: user._id,
      email: user.email,
      phone: decryptedPhone,
      role: user.role,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
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

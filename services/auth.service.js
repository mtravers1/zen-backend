import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";
import User from "../database/models/User.js";
import admin from "../lib/firebaseAdmin.js";

const own = async (uid) => {
  const user = await User.findOne({
    authUid: uid,
  }).select("-password");
  return user;
};

const signUp = async (data) => {
  try {
    // const existingUser = await checkEmailFirebase(data.email);
    // console.log("existingUser", existingUser);

    // if (existingUser) {
    //   throw new Error("User already exists");
    // }

    const emailSchema = {
      email: data.email.toLowerCase(),
      //TODO: add email type to the schema
      emailType: "personal",
      isPrimary: true,
    };

    const uid = data.authUid;

    const dek = await getUserDek(uid);

    const encryptedFirstName = await encryptValue(data.firstName, dek);

    const encryptedLastName = await encryptValue(data.lastName, dek);

    const encryptedMiddleName = await encryptValue(data.middleName, dek);

    const nameSchema = {
      firstName: encryptedFirstName,
      lastName: encryptedLastName,
      prefix: data.prefix,
      suffix: data.suffix,
      middleName: encryptedMiddleName,
    };

    const encryptedPhone = await encryptValue(data.phone, dek);

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

    const encryptedPhotoUrl = await encryptValue(data.profilePhotoUrl, dek);

    const encryptedAnnualIncome = await encryptValue(data.annualIncome, dek);

    const encryptedSSn = await encryptValue(data.ssn, dek);

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

    const decryptedFirstName = await decryptValue(newUser.name.firstName, dek);
    const decryptedLastName = await decryptValue(newUser.name.lastName, dek);
    const decryptedMiddleName = await decryptValue(
      newUser.name.middleName,
      dek
    );
    const decryptedPhone = await decryptValue(newUser.phones[0].phone, dek);
    const decryptedPhotoUrl = await decryptValue(newUser.profilePhotoUrl, dek);

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

const signIn = async (uid) => {
  try {
    const user = await User.findOne({
      authUid: uid,
    }).select("-password");
    if (!user) {
      throw new Error("User not found");
    }

    const uid = user.authUid;
    const dek = await getUserDek(uid);

    const decryptedFirstName = await decryptValue(user.name.firstName, dek);
    const decryptedLastName = await decryptValue(user.name.lastName, dek);
    const decryptedMiddleName = await decryptValue(user.name.middleName, dek);
    const decryptedPhone = await decryptValue(user.phones[0].phone, dek);
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await decryptValue(user.profilePhotoUrl, dek);
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

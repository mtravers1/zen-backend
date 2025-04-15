import {
  decryptValue,
  encryptValue,
  getUserDek,
  hashEmail,
} from "../database/encryption.js";
import User from "../database/models/User.js";
import admin from "../lib/firebaseAdmin.js";

const own = async (uid) => {
  const userResponse = await User.findOne({
    authUid: uid,
  }).select("-password");

  const dek = await getUserDek(uid);
  const emails = await Promise.all(
    userResponse.email.map(async (email) => {
      return {
        email: await decryptValue(email.email, dek),
        emailType: email.emailType,
        isPrimary: email.isPrimary,
      };
    })
  );

  const decryptedFirstName = await decryptValue(
    userResponse.name.firstName,
    dek
  );
  const decryptedLastName = await decryptValue(userResponse.name.lastName, dek);
  const decryptedMiddleName = await decryptValue(
    userResponse.name.middleName,
    dek
  );
  const decryptedPhone = await decryptValue(userResponse.phones[0].phone, dek);
  let decryptedPhotoUrl;
  if (userResponse.profilePhotoUrl) {
    decryptedPhotoUrl = await decryptValue(userResponse.profilePhotoUrl, dek);
  }

  const retrievedUser = {
    _id: userResponse._id,
    email: emails,
    phone: decryptedPhone,
    role: userResponse.role,
    profilePhotoUrl: decryptedPhotoUrl,
    name: {
      firstName: decryptedFirstName,
      lastName: decryptedLastName,
      middleName: decryptedMiddleName,
    },
  };

  return retrievedUser;
};

const signUp = async (data) => {
  try {
    let existingUser = null;

    try {
      existingUser = await checkEmail(data.email);
    } catch (err) {
      if (err.message !== "User not found") {
        throw err;
      }
    }

    // if (existingUser) {
    //   throw new Error("User already exists");
    // }

    const uid = data.authUid;
    const existingUid = await User.findOne({
      authUid: uid,
    });
    if (existingUid) {
      throw new Error("User already exists");
    }

    const dek = await getUserDek(uid);
    console.log("data", data);

    const encryptedEmail = await encryptValue(
      data.email.trim().toLowerCase(),
      dek
    );

    console.log("encryptedEmail", encryptedEmail);

    const emailSchema = {
      email: encryptedEmail,
      //TODO: add email type to the schema
      emailType: "personal",
      isPrimary: true,
    };

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
      emailHash: hashEmail(data.email),
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
    console.log("uid", uid);
    const user = await User.findOne({
      authUid: uid,
    }).select("-password");
    if (!user) {
      throw new Error("User not found");
    }
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
  const emailHash = hashEmail(email);
  const user = await User.findOne({
    emailHash,
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

import {
  decryptValue,
  encryptValue,
  getUserDek,
  hashEmail,
} from "../database/encryption.js";
import User from "../database/models/User.js";
import admin from "../lib/firebaseAdmin.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js";
import Liability from "../database/models/Liability.js";
import Assets from "../database/models/Assets.js";
import Business from "../database/models/Businesses.js";
// import Trips from "../database/models/Trips.js";
import AccessToken from "../database/models/AccessToken.js";
import VerificationCode from "../database/models/VerificationCode.js";
import plaidService from "./plaid.service.js";
import structuredLogger from "../lib/structuredLogger.js";

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
  const decryptedPhone = userResponse.phones && userResponse.phones.length > 0 
    ? await decryptValue(userResponse.phones[0].phone, dek)
    : null;
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
    account_type: userResponse.account_type,
    id_uuid: userResponse.id_uuid
  };

  return retrievedUser;
};

const signUp = async (data) => {
  try {
    // Validate required fields
    if (!data.email || !data.firstName || !data.lastName || !data.authUid) {
      throw new Error("Missing required fields: email, firstName, lastName, and authUid are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new Error("Invalid email format");
    }

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

    // Generate encryption keys first
    console.log("Generating encryption keys for new user:", uid);
    const dek = await getUserDek(uid);
    console.log("Generated DEK for new user:", { uid, hasDek: !!dek });

    // Now encrypt all the sensitive data
    const encryptedEmail = await encryptValue(
      data.email.trim().toLowerCase(),
      dek
    );

    console.log("encryptedEmail", encryptedEmail);

    const emailSchema = {
      email: encryptedEmail,
      emailType: "personal",
      isPrimary: true,
    };

    const encryptedFirstName = await encryptValue(data.firstName || "", dek);
    const encryptedLastName = await encryptValue(data.lastName || "", dek);
    const encryptedMiddleName = await encryptValue(data.middleName || "", dek);

    const nameSchema = {
      firstName: encryptedFirstName,
      lastName: encryptedLastName,
      prefix: data.prefix || null,
      suffix: data.suffix || null,
      middleName: encryptedMiddleName,
    };

    const encryptedPhone = data.phone ? await encryptValue(data.phone, dek) : null;

    const phoneNumbersSchema = {
      phone: encryptedPhone,
    };

    // Only include phone if provided
    const phoneArray = data.phone ? [phoneNumbersSchema] : [];

    const addressSchema = {
      street: data.address1 || null,
      city: data.city || null,
      state: data.state || null,
      postalCode: data.zip || null,
      country: data.country || null,
    };

    // Only include address if at least one field is provided
    const addressArray = (data.address1 || data.city || data.state || data.zip || data.country) 
      ? [addressSchema] 
      : [];

    const encryptedPhotoUrl = data.profilePhotoUrl ? await encryptValue(data.profilePhotoUrl, dek) : null;
    const encryptedAnnualIncome = data.annualIncome ? await encryptValue(data.annualIncome, dek) : null;
    const encryptedSSn = data.ssn ? await encryptValue(data.ssn, dek) : null;

    // Create the user with encrypted data
    const user = new User({
      email: [emailSchema],
      phones: phoneArray,
      role: data.role || "individual",
      authUid: data.authUid,
      profilePhotoUrl: encryptedPhotoUrl,
      numAccounts: data.numAccounts || 0,
      name: nameSchema,
      maritalStatus: data.maritalStatus || "single",
      address: addressArray,
      dateOfBirth: data.dob ? Date.parse(data.dob) : null,
      occupation: data.occupation || null,
      annualIncome: encryptedAnnualIncome,
      encryptedSSN: encryptedSSn,
      emailHash: hashEmail(data.email),
    });

    await user.save();
    console.log("Successfully created new user with encrypted data");

    const newUser = await User.findOne({
      authUid: data.authUid,
    });

    // Now decrypt the data for the response
    const decryptedFirstName = await decryptValue(newUser.name.firstName, dek);
    const decryptedLastName = await decryptValue(newUser.name.lastName, dek);
    const decryptedMiddleName = await decryptValue(newUser.name.middleName, dek);
    const decryptedPhone = newUser.phones && newUser.phones.length > 0 
      ? await decryptValue(newUser.phones[0].phone, dek)
      : null;
    const decryptedPhotoUrl = newUser.profilePhotoUrl ? await decryptValue(newUser.profilePhotoUrl, dek) : null;

    const retrievedUser = {
      id: newUser._id,
      email: [{
        email: data.email.trim().toLowerCase(), // Return original email for response
        emailType: "personal",
        isPrimary: true,
      }],
      phone: decryptedPhone,
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
    
    // Log specific error types for debugging
    if (error.name === 'ValidationError') {
      console.error("MongoDB Validation Error:", error.message);
      console.error("Validation Details:", error.errors);
    } else if (error.message.includes('ENCRYPTION')) {
      console.error("Encryption Error:", error.message);
    } else if (error.message.includes('User not found')) {
      console.error("User Lookup Error:", error.message);
    }

    // Re-throw the error with more context
    throw new Error(`Signup failed: ${error.message}`);
  }
};

const signIn = async (uid) => {
  try {
    structuredLogger.logOperationStart('auth_service_signin', { user_id: uid });
    console.log("uid", uid);

    const user = await User.findOne({
      authUid: uid,
    }).select("-password");

    if (!user) {
      const error = new Error("User not found");
      structuredLogger.logErrorBlock(error, {
        operation: 'auth_service_signin',
        user_id: uid,
        error_classification: 'user_not_found'
      });
      throw error;
    }

    structuredLogger.logOperationStart('auth_service_decrypt_user_data', { user_id: uid });
    const dek = await getUserDek(uid);

    const decryptedFirstName = await decryptValue(user.name.firstName, dek);
    const decryptedLastName = await decryptValue(user.name.lastName, dek);
    const decryptedMiddleName = await decryptValue(user.name.middleName, dek);
    const decryptedPhone = user.phones && user.phones.length > 0 
      ? await decryptValue(user.phones[0].phone, dek)
      : null;
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await decryptValue(user.profilePhotoUrl, dek);
    }

    const emails = await Promise.all(
      user.email.map(async (email) => {
        return {
          email: await decryptValue(email.email, dek),
          emailType: email.emailType,
          isPrimary: email.isPrimary,
        };
      })
    );

    const retrievedUser = {
      id: user._id,
      email: emails,
      phone: decryptedPhone,
      role: user.role,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
    };

    structuredLogger.logSuccess('auth_service_signin', { user_id: uid });
    return retrievedUser;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_service_signin',
      user_id: uid,
      error_classification: error.message === "User not found" ? 'user_not_found' : 'decryption_error'
    });
    console.log("error in signin", error);
    throw new Error(error);
  }
};

// New method to handle sign-in with auto-creation for new users
const signInOrCreate = async (uid, userData = null) => {
  try {
    structuredLogger.logOperationStart('auth_service_signin_or_create', { user_id: uid });
    console.log("uid", uid);
    console.log("userData", userData);

    let user = await User.findOne({
      authUid: uid,
    }).select("-password");

    console.log("User lookup result:", { found: !!user, uid });

    if (!user) {
      // User doesn't exist, create a basic user profile
      console.log("User not found, creating new user with data:", userData);
      
      if (!userData) {
        const error = new Error("User not found and no user data provided for creation");
        structuredLogger.logErrorBlock(error, {
          operation: 'auth_service_signin_or_create',
          user_id: uid,
          error_classification: 'missing_user_data'
        });
        throw error;
      }

      structuredLogger.logOperationStart('auth_service_create_basic_user', { user_id: uid });
      
      // Create a basic user with minimal data
      const dek = await getUserDek(uid);
      
      const encryptedEmail = await encryptValue(
        userData.email.trim().toLowerCase(),
        dek
      );

      const emailSchema = {
        email: encryptedEmail,
        emailType: "personal",
        isPrimary: true,
      };

      // For new users, we might only have email, so create minimal profile
      const nameSchema = {
        firstName: userData.firstName ? await encryptValue(userData.firstName, dek) : await encryptValue("New", dek),
        lastName: userData.lastName ? await encryptValue(userData.lastName, dek) : await encryptValue("User", dek),
        prefix: userData.prefix || null,
        suffix: userData.suffix || null,
        middleName: userData.middleName ? await encryptValue(userData.middleName, dek) : null,
      };

      const phoneNumbersSchema = {
        phone: userData.phone ? await encryptValue(userData.phone, dek) : null,
      };

      const phoneArray = userData.phone ? [phoneNumbersSchema] : [];

      const addressSchema = {
        street: userData.address1 || null,
        city: userData.city || null,
        state: userData.state || null,
        postalCode: userData.zip || null,
        country: userData.country || null,
      };

      const addressArray = (userData.address1 || userData.city || userData.state || userData.zip || userData.country) 
        ? [addressSchema] 
        : [];

      user = new User({
        email: [emailSchema],
        phones: phoneArray,
        role: "individual", // Use valid enum value
        authUid: uid,
        profilePhotoUrl: "",
        numAccounts: 0,
        name: nameSchema,
        maritalStatus: "single", // Use valid enum value
        address: addressArray,
        dateOfBirth: null,
        occupation: null,
        annualIncome: null,
        encryptedSSN: null, // Use correct field name
        emailHash: hashEmail(userData.email),
      });

      await user.save();
      structuredLogger.logSuccess('auth_service_create_basic_user', { user_id: uid });
    }

    // Now proceed with normal sign-in flow
    structuredLogger.logOperationStart('auth_service_decrypt_user_data', { user_id: uid });
    const dek = await getUserDek(uid);

    const decryptedFirstName = await decryptValue(user.name.firstName, dek);
    const decryptedLastName = await decryptValue(user.name.lastName, dek);
    const decryptedMiddleName = await decryptValue(user.name.middleName, dek);
    const decryptedPhone = user.phones && user.phones.length > 0 
      ? await decryptValue(user.phones[0].phone, dek)
      : null;
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await decryptValue(user.profilePhotoUrl, dek);
    }

    const emails = await Promise.all(
      user.email.map(async (email) => {
        return {
          email: await decryptValue(email.email, dek),
          emailType: email.emailType,
          isPrimary: email.isPrimary,
        };
      })
    );

    const retrievedUser = {
      id: user._id,
      email: emails,
      phone: decryptedPhone,
      role: user.role,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
    };

    structuredLogger.logSuccess('auth_service_signin_or_create', { user_id: uid });
    return retrievedUser;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_service_signin_or_create',
      user_id: uid,
      error_classification: error.message === "User not found" ? 'user_not_found' : 'decryption_error'
    });
    console.log("error in signin_or_create", error);
    throw new Error(error);
  }
};

const checkEmail = async (email, method) => {
  try {
    structuredLogger.logOperationStart('auth_service_check_email', {
      email: email,
      method: method
    });

    const emailHash = hashEmail(email);
    const user = await User.findOne({
      emailHash,
    });

    if (!user) {
      const error = new Error("User not found");
      structuredLogger.logErrorBlock(error, {
        operation: 'auth_service_check_email',
        email: email,
        method: method,
        error_classification: 'user_not_found'
      });
      throw error;
    }

    structuredLogger.logSuccess('auth_service_check_email', { email: email });
    return user;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_service_check_email',
      email: email,
      method: method,
      error_classification: error.message === "User not found" ? 'user_not_found' : 'database_error'
    });
    throw error;
  }
};

const checkEmailFirebase = async (email) => {
  try {
    structuredLogger.logOperationStart('auth_service_check_email_firebase', { email: email });

    const user = await admin.auth().getUserByEmail(email);

    structuredLogger.logSuccess('auth_service_check_email_firebase', { email: email });
    return user;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_service_check_email_firebase',
      email: email,
      error_classification: 'firebase_error'
    });
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

const deleteUser = async (uid) => {
  try {
    //get user
    const user = await User.findOne({
      authUid: uid,
    });
    if (!user) {
      throw new Error("User not found");
    }
    //get dek
    const dek = await getUserDek(uid);
    //get accounts and save ids
    const accounts = await PlaidAccount.find({
      owner_id: user._id,
    });
    const accountIds = accounts.map((account) => account.plaid_account_id);

    await PlaidAccount.deleteMany({
      owner_id: user._id,
    });

    //get transactions and delete them
    for (const accountId of accountIds) {
      await Transaction.deleteMany({
        plaidAccountId: accountId,
      });

      //get liabilities and delete them
      await Liability.deleteMany({
        accountId: accountId,
      });
    }
    //get assets and delete them

    await Assets.deleteMany({ userId: user._id });

    //get businesses and delete them

    await Business.deleteMany({
      userId: user._id,
    });
    //get trips and delete them
    //TODO uncomment this when trips are implemented
    // await Trips.deleteMany({
    //   user: user._id,
    // });
    //get accesstokens, decrypt and delete them and invalidate them
    const accessToken = await AccessToken.find({
      userId: user._id,
    });
    for (const token of accessToken) {
      const decryptedAccessToken = await decryptValue(token.accessToken, dek);
      await plaidService.invalidateAccessToken(decryptedAccessToken);
    }
    await AccessToken.deleteMany({
      userId: user._id,
    });

    //delete dek
    //TODO: delete dek from bucket

    //delete user from firebase
    await admin.auth().deleteUser(uid);
    //delete user from db
    await User.deleteOne({
      authUid: uid,
    });

    return { message: "User deleted successfully" };
  } catch (error) {
    throw new Error(error);
  }
};

const createVerificationCode = async (email) => {
  try {
    console.log(`[DEBUG] Creating verification code for email: ${email}`);
    
    // Test database connection first
    console.log(`[DEBUG] Testing database connection...`);
    const testQuery = await VerificationCode.findOne({});
    console.log(`[DEBUG] Database connection test result:`, testQuery ? 'Connected' : 'No data but connected');
    
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[DEBUG] Generated code: ${code}`);
    
    // Set expiration to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    console.log(`[DEBUG] Code expires at: ${expiresAt}`);
    
    // Delete any existing codes for this email
    console.log(`[DEBUG] Deleting existing codes...`);
    const deletedCount = await VerificationCode.deleteMany({ email });
    console.log(`[DEBUG] Deleted ${deletedCount.deletedCount} existing codes for ${email}`);
    
    // Create new verification code
    console.log(`[DEBUG] Creating VerificationCode model instance...`);
    const verificationCode = new VerificationCode({
      email,
      code,
      expiresAt
    });
    console.log(`[DEBUG] Model instance created:`, verificationCode);
    
    console.log(`[DEBUG] Saving verification code to database...`);
    const savedCode = await verificationCode.save();
    console.log(`[DEBUG] Verification code saved successfully with ID: ${savedCode._id}`);
    
    return code;
  } catch (error) {
    console.error('[ERROR] Error in createVerificationCode:', error);
    console.error('[ERROR] Error stack:', error.stack);
    structuredLogger.logErrorBlock(error, {
      operation: 'create_verification_code',
      email: email,
      error_classification: 'database_error'
    });
    throw new Error('Failed to create verification code');
  }
};

const verifyCode = async (email, code) => {
  try {
    console.log(`[DEBUG] Verifying code for email: ${email}, code: ${code}`);
    
    // Find the verification code
    const verificationCode = await VerificationCode.findOne({
      email,
      code,
      expiresAt: { $gt: new Date() },
      used: false
    });
    
    console.log(`[DEBUG] Database query: { email: "${email}", code: "${code}", expiresAt: { $gt: new Date() }, used: false }`);
    
    console.log(`[DEBUG] Found verification code:`, verificationCode ? {
      id: verificationCode._id,
      email: verificationCode.email,
      code: verificationCode.code,
      expiresAt: verificationCode.expiresAt,
      used: verificationCode.used,
      createdAt: verificationCode.createdAt
    } : 'null');
    
    if (!verificationCode) {
      console.log(`[DEBUG] No valid verification code found for email: ${email}, code: ${code}`);
      
      // Let's also check what codes exist for this email
      const allCodes = await VerificationCode.find({ email });
      console.log(`[DEBUG] All codes for email ${email}:`, allCodes.map(c => ({
        code: c.code,
        expiresAt: c.expiresAt,
        used: c.used,
        createdAt: c.createdAt
      })));
      
      return { valid: false, message: 'Invalid or expired verification code' };
    }
    
    console.log(`[DEBUG] Marking code as used...`);
    // Mark the code as used
    verificationCode.used = true;
    await verificationCode.save();
    
    console.log(`[DEBUG] Code verified successfully`);
    return { valid: true, message: 'Verification code validated successfully' };
  } catch (error) {
    console.error('[ERROR] Error in verifyCode:', error);
    structuredLogger.logErrorBlock(error, {
      operation: 'verify_verification_code',
      email: email,
      error_classification: 'database_error'
    });
    throw new Error('Failed to verify code');
  }
};

const authService = {
  signUp,
  signIn,
  signInOrCreate,
  checkEmail,
  own,
  changeUserPassword,
  checkEmailFirebase,
  deleteUser,
  createVerificationCode,
  verifyCode,
};

export default authService;

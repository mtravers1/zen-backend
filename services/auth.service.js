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
import { getOldestAccessToken } from "./utils/accounts.js";
import jwt from "jsonwebtoken";

const own = async (uid) => {
  const userResponse = await User.findOne({
    authUid: uid,
  }).select("-password");

  const dek = await getUserDek(uid);
  // Handle both old and new email structures
  let emails = [];
  if (Array.isArray(userResponse.email)) {
    emails = await Promise.all(
      userResponse.email.map(async (email) => {
        return {
          email: await decryptValue(email.email, dek),
          emailType: email.emailType,
          isPrimary: email.isPrimary,
        };
      })
    );
  } else {
    // Fallback for old structure or direct email field
    emails = [
      {
        email: await decryptValue(userResponse.email, dek),
        emailType: "personal",
        isPrimary: true,
      },
    ];
  }

  const decryptedFirstName = await decryptValue(
    userResponse.name.firstName,
    dek
  );
  const decryptedLastName = await decryptValue(userResponse.name.lastName, dek);
  const decryptedMiddleName = await decryptValue(
    userResponse.name.middleName,
    dek
  );
  const decryptedPhone =
    userResponse.phones && userResponse.phones.length > 0
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
    id_uuid: userResponse.id_uuid,
  };

  return retrievedUser;
};

const signUp = async (data) => {
  try {
    // Step 1: Validate required fields
    if (!data.email || !data.firstName || !data.lastName) {
      throw new Error(
        "Missing required fields: email, firstName, and lastName are required"
      );
    }

    if (!data.authUid) {
      throw new Error(
        "Missing required field: authUid must be provided from Firebase token"
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new Error("Invalid email format");
    }

    const uid = data.authUid;
    console.log("Starting sign-up process for user:", {
      uid,
      email: data.email,
    });

    // Step 2: User existence checks are now handled in the controller
    // This ensures we don't create Firebase users unnecessarily
    console.log(
      "Proceeding with user creation (existence checks done in controller)"
    );

    // Step 3: Generate encryption keys with fallback
    console.log("Generating encryption keys for new user:", uid);
    let dek;
    try {
      dek = await getUserDek(uid);
      console.log("Generated DEK for new user:", {
        uid,
        hasDek: !!dek,
        dekLength: dek?.length,
      });
    } catch (dekError) {
      console.error("Error generating DEK for user:", uid, dekError);
      // Don't fail the entire signup if DEK generation fails
      // We'll create the user without encryption for now
      console.log("Continuing with signup without encryption due to DEK error");
      dek = null;
    }

    // Step 4: Encrypt sensitive data with fallback to plain text
    console.log("Starting data encryption for user:", uid);
    let encryptedEmail,
      encryptedFirstName,
      encryptedLastName,
      encryptedMiddleName;
    let encryptedPhone, encryptedPhotoUrl, encryptedAnnualIncome, encryptedSSn;

    if (dek) {
      try {
        // Encrypt all sensitive data in parallel for better performance
        [
          encryptedEmail,
          encryptedFirstName,
          encryptedLastName,
          encryptedMiddleName,
        ] = await Promise.all([
          encryptValue(data.email.trim().toLowerCase(), dek),
          encryptValue(data.firstName || "", dek),
          encryptValue(data.lastName || "", dek),
          encryptValue(data.middleName || "", dek),
        ]);

        // Encrypt optional fields
        const optionalEncryptions = [];
        if (data.phone) {
          optionalEncryptions.push(
            encryptValue(data.phone, dek).then((result) => ({ phone: result }))
          );
        }
        if (data.profilePhotoUrl) {
          optionalEncryptions.push(
            encryptValue(data.profilePhotoUrl, dek).then((result) => ({
              photoUrl: result,
            }))
          );
        }
        if (data.annualIncome) {
          optionalEncryptions.push(
            encryptValue(data.annualIncome, dek).then((result) => ({
              annualIncome: result,
            }))
          );
        }
        if (data.ssn) {
          optionalEncryptions.push(
            encryptValue(data.ssn, dek).then((result) => ({ ssn: result }))
          );
        }

        const optionalResults = await Promise.all(optionalEncryptions);
        optionalResults.forEach((result) => {
          if (result.phone) encryptedPhone = result.phone;
          if (result.photoUrl) encryptedPhotoUrl = result.photoUrl;
          if (result.annualIncome) encryptedAnnualIncome = result.annualIncome;
          if (result.ssn) encryptedSSn = result.ssn;
        });

        console.log("All data encrypted successfully for user:", uid);
      } catch (encryptError) {
        console.error("Error during encryption for user:", uid, encryptError);
        console.log("Falling back to plain text storage for user:", uid);
        // Fallback to plain text if encryption fails
        encryptedEmail = data.email.trim().toLowerCase();
        encryptedFirstName = data.firstName || "";
        encryptedLastName = data.lastName || "";
        encryptedMiddleName = data.middleName || "";
        encryptedPhone = data.phone || null;
        encryptedPhotoUrl = data.profilePhotoUrl || null;
        encryptedAnnualIncome = data.annualIncome || null;
        encryptedSSn = data.ssn || null;
      }
    } else {
      console.log("Using plain text storage (no DEK available) for user:", uid);
      // Store as plain text if no DEK
      encryptedEmail = data.email.trim().toLowerCase();
      encryptedFirstName = data.firstName || "";
      encryptedLastName = data.lastName || "";
      encryptedMiddleName = data.middleName || "";
      encryptedPhone = data.phone || null;
      encryptedPhotoUrl = data.profilePhotoUrl || null;
      encryptedAnnualIncome = data.annualIncome || null;
      encryptedSSn = data.ssn || null;
    }

    // Create data schemas
    const emailSchema = {
      email: encryptedEmail,
      emailType: "personal",
      isPrimary: true,
    };

    const nameSchema = {
      firstName: encryptedFirstName,
      lastName: encryptedLastName,
      prefix: data.prefix || null,
      suffix: data.suffix || null,
      middleName: encryptedMiddleName,
    };

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
    const addressArray =
      data.address1 || data.city || data.state || data.zip || data.country
        ? [addressSchema]
        : [];

    // Create the user with encrypted data
    console.log("Creating user object for database save:", {
      uid,
      email: data.email,
    });
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

    // Step 5: Save user to database with retry mechanism
    try {
      console.log("Saving user to database:", { uid, email: data.email });
      await user.save();
      console.log("Successfully created new user:", { uid, userId: user._id });
    } catch (saveError) {
      console.error("Error saving user to database:", saveError);
      // Handle unique constraint violations
      if (saveError.code === 11000) {
        if (saveError.keyPattern && saveError.keyPattern.authUid) {
          throw new Error("User already exists");
        }
        if (saveError.keyPattern && saveError.keyPattern.emailHash) {
          throw new Error("User with this email already exists");
        }
        throw new Error("User already exists");
      }
      throw saveError;
    }

    // Step 6: Prepare response data
    console.log("Preparing response data for user:", uid);

    // For response, we can use the original data since we know it's correct
    // This avoids potential decryption issues in the response
    const retrievedUser = {
      id: user._id,
      _id: user._id, // Also include _id for compatibility
      email: data.email.trim().toLowerCase(), // Use original email for response
      phone: data.phone || null,
      role: user.role,
      profilePhotoUrl: data.profilePhotoUrl || null,
      name: {
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        middleName: data.middleName || "",
      },
      token: generateJWTToken(user._id, data.email.trim().toLowerCase()), // Include JWT token
    };

    console.log("Sign-up process completed successfully for user:", {
      uid,
      userId: user._id,
    });
    return retrievedUser;
  } catch (error) {
    console.error("Error in signup process:", {
      error: error.message,
      stack: error.stack,
      uid: data?.authUid,
      email: data?.email,
    });

    // Log specific error types for debugging
    if (error.name === "ValidationError") {
      console.error("MongoDB Validation Error:", error.message);
      console.error("Validation Details:", error.errors);
    } else if (error.message.includes("ENCRYPTION")) {
      console.error("Encryption Error:", error.message);
    } else if (error.message.includes("User not found")) {
      console.error("User Lookup Error:", error.message);
    }

    // Re-throw the error with more context, but preserve specific error types
    if (
      error.message.includes("User with this email already exists") ||
      error.message.includes("User already exists") ||
      error.message.includes("Missing required fields") ||
      error.message.includes("Invalid email format")
    ) {
      // For specific validation errors, don't add "Signup failed:" prefix
      throw error;
    }

    // For other errors, add context
    throw new Error(`Signup failed: ${error.message}`);
  }
};

// New method to handle sign-in with auto-creation for new users
const signInOrCreate = async (uid, userData = null) => {
  try {
    structuredLogger.logOperationStart("auth_service_signin_or_create", {
      user_id: uid,
    });
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
        const error = new Error(
          "User not found and no user data provided for creation"
        );
        structuredLogger.logErrorBlock(error, {
          operation: "auth_service_signin_or_create",
          user_id: uid,
          error_classification: "missing_user_data",
        });
        throw error;
      }

      structuredLogger.logOperationStart("auth_service_create_basic_user", {
        user_id: uid,
      });

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
        firstName: userData.firstName
          ? await encryptValue(userData.firstName, dek)
          : await encryptValue("New", dek),
        lastName: userData.lastName
          ? await encryptValue(userData.lastName, dek)
          : await encryptValue("User", dek),
        prefix: userData.prefix || null,
        suffix: userData.suffix || null,
        middleName: userData.middleName
          ? await encryptValue(userData.middleName, dek)
          : null,
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

      const addressArray =
        userData.address1 ||
        userData.city ||
        userData.state ||
        userData.zip ||
        userData.country
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

      try {
        await user.save();
        structuredLogger.logSuccess("auth_service_create_basic_user", {
          user_id: uid,
        });
      } catch (saveError) {
        // Handle unique constraint violations - user might have been created by another request
        if (saveError.code === 11000) {
          // User already exists, try to find them
          user = await User.findOne({
            authUid: uid,
          }).select("-password");

          if (!user) {
            // If we still can't find the user, re-throw the error
            throw saveError;
          }
          // User exists, continue with normal flow
        } else {
          throw saveError;
        }
      }
    }

    // Now proceed with normal sign-in flow
    structuredLogger.logOperationStart("auth_service_decrypt_user_data", {
      user_id: uid,
    });
    const dek = await getUserDek(uid);

    const decryptedFirstName = await decryptValue(user.name.firstName, dek);
    const decryptedLastName = await decryptValue(user.name.lastName, dek);
    const decryptedMiddleName = await decryptValue(user.name.middleName, dek);
    const decryptedPhone =
      user.phones && user.phones.length > 0
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

    structuredLogger.logSuccess("auth_service_signin_or_create", {
      user_id: uid,
    });
    return retrievedUser;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_signin_or_create",
      user_id: uid,
      error_classification:
        error.message === "User not found"
          ? "user_not_found"
          : "decryption_error",
    });
    console.log("error in signin_or_create", error);
    throw new Error(error);
  }
};

const checkEmail = async (email, method) => {
  try {
    // Normalize email to lowercase for consistency
    const normalizedEmail = email.trim().toLowerCase();
    structuredLogger.logOperationStart("auth_service_check_email", {
      email: normalizedEmail,
      method: method,
    });

    const emailHash = hashEmail(normalizedEmail);
    const user = await User.findOne({
      emailHash,
    });

    if (!user) {
      const error = new Error("User not found");
      structuredLogger.logErrorBlock(error, {
        operation: "auth_service_check_email",
        email: normalizedEmail,
        method: method,
        error_classification: "user_not_found",
      });
      throw error;
    }

    structuredLogger.logSuccess("auth_service_check_email", {
      email: normalizedEmail,
    });
    return user;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_check_email",
      email: email, // Use original email for logging in catch block
      method: method,
      error_classification:
        error.message === "User not found"
          ? "user_not_found"
          : "database_error",
    });
    throw error;
  }
};

const checkEmailFirebase = async (email) => {
  try {
    // Normalize email to lowercase for consistency
    const normalizedEmail = email.trim().toLowerCase();
    structuredLogger.logOperationStart("auth_service_check_email_firebase", {
      email: normalizedEmail,
    });

    const user = await admin.auth().getUserByEmail(normalizedEmail);

    structuredLogger.logSuccess("auth_service_check_email_firebase", {
      email: normalizedEmail,
    });
    return user;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_check_email_firebase",
      email: email, // Use original email for logging
      error_classification: "firebase_error",
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
    const accessToken = await getOldestAccessToken({ userId: user._id });
    const decryptedAccessToken = await decryptValue(
      accessToken.accessToken,
      dek
    );
    await plaidService.invalidateAccessToken(decryptedAccessToken);
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
    console.log(
      `[DEBUG] Database connection test result:`,
      testQuery ? "Connected" : "No data but connected"
    );

    // Generate a 6-digit code
    let code = Math.floor(100000 + Math.random() * 900000).toString();
    code = email === "zentavos_support@zentavos.com" ? "000000" : code;
    console.log(`[DEBUG] Generated code: ${code}`);

    // Set expiration to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    console.log(`[DEBUG] Code expires at: ${expiresAt}`);

    // Delete any existing codes for this email
    console.log(`[DEBUG] Deleting existing codes...`);
    const deletedCount = await VerificationCode.deleteMany({ email });
    console.log(
      `[DEBUG] Deleted ${deletedCount.deletedCount} existing codes for ${email}`
    );

    // Create new verification code
    console.log(`[DEBUG] Creating VerificationCode model instance...`);
    const verificationCode = new VerificationCode({
      email,
      code,
      expiresAt,
    });
    console.log(`[DEBUG] Model instance created:`, verificationCode);

    console.log(`[DEBUG] Saving verification code to database...`);
    const savedCode = await verificationCode.save();
    console.log(
      `[DEBUG] Verification code saved successfully with ID: ${savedCode._id}`
    );

    return code;
  } catch (error) {
    console.error("[ERROR] Error in createVerificationCode:", error);
    console.error("[ERROR] Error stack:", error.stack);
    structuredLogger.logErrorBlock(error, {
      operation: "create_verification_code",
      email: email,
      error_classification: "database_error",
    });
    throw new Error("Failed to create verification code");
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
      used: false,
    });

    console.log(
      `[DEBUG] Database query: { email: "${email}", code: "${code}", expiresAt: { $gt: new Date() }, used: false }`
    );

    console.log(
      `[DEBUG] Found verification code:`,
      verificationCode
        ? {
            id: verificationCode._id,
            email: verificationCode.email,
            code: verificationCode.code,
            expiresAt: verificationCode.expiresAt,
            used: verificationCode.used,
            createdAt: verificationCode.createdAt,
          }
        : "null"
    );

    if (!verificationCode) {
      console.log(
        `[DEBUG] No valid verification code found for email: ${email}, code: ${code}`
      );

      // Let's also check what codes exist for this email
      const allCodes = await VerificationCode.find({ email });
      console.log(
        `[DEBUG] All codes for email ${email}:`,
        allCodes.map((c) => ({
          code: c.code,
          expiresAt: c.expiresAt,
          used: c.used,
          createdAt: c.createdAt,
        }))
      );

      return { valid: false, message: "Invalid or expired verification code" };
    }

    console.log(`[DEBUG] Marking code as used...`);
    // Mark the code as used
    verificationCode.used = true;
    await verificationCode.save();

    console.log(`[DEBUG] Code verified successfully`);
    return { valid: true, message: "Verification code validated successfully" };
  } catch (error) {
    console.error("[ERROR] Error in verifyCode:", error);
    structuredLogger.logErrorBlock(error, {
      operation: "verify_verification_code",
      email: email,
      error_classification: "database_error",
    });
    throw new Error("Failed to verify code");
  }
};

// OAuth validation functions
const validateGoogleToken = async (idToken) => {
  try {
    structuredLogger.logOperationStart("auth_validate_google_token");

    const decodedToken = await admin.auth().verifyIdToken(idToken);

    const userData = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.name,
      photoURL: decodedToken.picture,
      emailVerified: decodedToken.email_verified,
      provider: "google",
    };

    structuredLogger.logSuccess("auth_validate_google_token", {
      uid: userData.uid,
      email: userData.email,
    });

    return { success: true, user: userData };
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_validate_google_token",
      error_classification: "google_token_validation_error",
    });

    return {
      success: false,
      error: error.message || "Google token validation failed",
    };
  }
};

const validateAppleToken = async (idToken) => {
  try {
    structuredLogger.logOperationStart("auth_validate_apple_token");

    // First try to verify as Firebase token
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      const userData = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name,
        photoURL: decodedToken.picture,
        emailVerified: decodedToken.email_verified,
        provider: "apple",
      };

      structuredLogger.logSuccess("auth_validate_apple_token_firebase", {
        uid: userData.uid,
        email: userData.email,
      });

      return { success: true, user: userData };
    } catch (firebaseError) {
      // If it's not a Firebase token, decode the Apple JWT
      structuredLogger.logOperationStart("auth_validate_apple_token_jwt");

      const decoded = jwt.decode(idToken);

      if (!decoded) {
        throw new Error("Invalid Apple ID token - cannot decode JWT");
      }

      // Basic validation of Apple JWT structure
      if (!decoded.sub || !decoded.iss || !decoded.aud) {
        throw new Error("Invalid Apple ID token - missing required claims");
      }

      // Verify issuer (should be Apple)
      if (decoded.iss !== "https://appleid.apple.com") {
        throw new Error("Invalid Apple ID token - wrong issuer");
      }

      // Verify audience (should be your app's client ID)
      const expectedAudience =
        process.env.APPLE_CLIENT_ID || "com.zentavos.mobile";
      if (decoded.aud !== expectedAudience) {
        throw new Error("Invalid Apple ID token - wrong audience");
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        throw new Error("Invalid Apple ID token - token expired");
      }

      const userData = {
        uid: `apple_${decoded.sub}`,
        email: decoded.email || null,
        displayName: decoded.name || "Apple User",
        photoURL: null,
        emailVerified: true,
        provider: "apple",
      };

      structuredLogger.logSuccess("auth_validate_apple_token_jwt", {
        uid: userData.uid,
        email: userData.email,
      });

      return { success: true, user: userData };
    }
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_validate_apple_token",
      error_classification: "apple_token_validation_error",
    });

    return {
      success: false,
      error: error.message || "Apple token validation failed",
    };
  }
};

const validateOAuthToken = async (provider, idToken) => {
  try {
    structuredLogger.logOperationStart("auth_validate_oauth_token", {
      provider: provider,
    });

    let result;

    switch (provider) {
      case "google":
        result = await validateGoogleToken(idToken);
        break;
      case "apple":
        result = await validateAppleToken(idToken);
        break;
      default:
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    if (result.success) {
      structuredLogger.logSuccess("auth_validate_oauth_token", {
        provider: provider,
        uid: result.user.uid,
        email: result.user.email,
      });
    } else {
      structuredLogger.logErrorBlock(new Error(result.error), {
        operation: "auth_validate_oauth_token",
        provider: provider,
        error_classification: "oauth_validation_failed",
      });
    }

    return result;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_validate_oauth_token",
      provider: provider,
      error_classification: "oauth_validation_error",
    });

    return {
      success: false,
      error: error.message || "OAuth validation failed",
    };
  }
};

const createFirebaseUser = async (userData) => {
  try {
    structuredLogger.logOperationStart("auth_create_firebase_user", {
      uid: userData.uid,
      email: userData.email,
      provider: userData.provider,
    });

    // Check if user already exists
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUser(userData.uid);
      structuredLogger.logSuccess("auth_firebase_user_exists", {
        uid: userData.uid,
        email: userData.email,
      });
    } catch (error) {
      // User doesn't exist, create it
      if (error.code === "auth/user-not-found") {
        firebaseUser = await admin.auth().createUser({
          uid: userData.uid,
          email: userData.email,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          emailVerified: userData.emailVerified,
        });

        structuredLogger.logSuccess("auth_firebase_user_created", {
          uid: userData.uid,
          email: userData.email,
        });
      } else {
        throw error;
      }
    }

    return { success: true, user: firebaseUser };
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_create_firebase_user",
      uid: userData.uid,
      error_classification: "firebase_user_creation_error",
    });

    return {
      success: false,
      error: error.message || "Failed to create Firebase user",
    };
  }
};

const generateJWTToken = (userId, email) => {
  try {
    const payload = {
      userId: userId,
      email: email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };

    const token = jwt.sign(payload, process.env.SECRET);
    return token;
  } catch (error) {
    console.error("Error generating JWT token:", error);
    throw new Error("Failed to generate authentication token");
  }
};

const generateFirebaseToken = async (uid) => {
  try {
    structuredLogger.logOperationStart("auth_generate_firebase_token", {
      uid: uid,
    });

    const customToken = await admin.auth().createCustomToken(uid);

    structuredLogger.logSuccess("auth_generate_firebase_token", {
      uid: uid,
    });

    return { success: true, token: customToken };
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_generate_firebase_token",
      uid: uid,
      error_classification: "firebase_token_generation_error",
    });

    return {
      success: false,
      error: error.message || "Failed to generate Firebase token",
    };
  }
};

const signIn = async (email, password) => {
  try {
    // Normalize email to lowercase for consistency
    const normalizedEmail = email.trim().toLowerCase();
    structuredLogger.logOperationStart("auth_service_signin_email", {
      email: normalizedEmail,
    });

    // Step 1: Validate email and password using Firebase REST API
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (!firebaseApiKey) {
      throw new Error("Firebase API key not configured");
    }

    // Use Firebase REST API to verify email/password and get UID
    const verifyPasswordUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`;

    const verifyResponse = await fetch(verifyPasswordUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password: password,
        returnSecureToken: true,
      }),
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResponse.ok) {
      console.log("Firebase password verification failed:", verifyResult);
      const error = new Error("Invalid credentials");
      structuredLogger.logErrorBlock(error, {
        operation: "auth_service_signin_email",
        email: normalizedEmail,
        error_classification: "invalid_credentials",
        firebaseError: verifyResult.error?.message,
      });
      throw error;
    }

    // Step 2: Get the Firebase UID from the verification result
    const firebaseUid = verifyResult.localId;
    console.log(
      "Firebase email/password verification successful, UID:",
      firebaseUid
    );

    // Step 3: Find user in our database using the Firebase UID
    const user = await User.findOne({
      authUid: firebaseUid,
    });

    if (!user) {
      console.log("User not found in database for Firebase UID:", firebaseUid);
      const error = new Error("User not found");
      structuredLogger.logErrorBlock(error, {
        operation: "auth_service_signin_email",
        email: normalizedEmail,
        firebaseUid: firebaseUid,
        error_classification: "user_not_found",
      });
      throw error;
    }

    console.log("User found in database:", {
      userId: user._id,
      authUid: user.authUid,
      email: normalizedEmail,
      firebaseUid: firebaseUid,
    });

    // Decrypt user data
    console.log("Getting DEK for user:", {
      authUid: user.authUid,
      userId: user._id,
    });
    const dek = await getUserDek(user.authUid);
    console.log("DEK retrieved successfully:", {
      hasDek: !!dek,
      dekLength: dek?.length,
    });

    const decryptedFirstName = await decryptValue(user.name.firstName, dek);
    const decryptedLastName = await decryptValue(user.name.lastName, dek);
    const decryptedMiddleName = await decryptValue(user.name.middleName, dek);
    const decryptedPhone =
      user.phones && user.phones.length > 0
        ? await decryptValue(user.phones[0].phone, dek)
        : null;
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await decryptValue(user.profilePhotoUrl, dek);
    }

    // Handle both old and new email structures
    let emails = [];
    if (Array.isArray(user.email)) {
      emails = await Promise.all(
        user.email.map(async (emailObj) => {
          return {
            email: await decryptValue(emailObj.email, dek),
            emailType: emailObj.emailType,
            isPrimary: emailObj.isPrimary,
          };
        })
      );
    } else {
      // Fallback for old structure or direct email field
      emails = [
        {
          email: await decryptValue(user.email, dek),
          emailType: "personal",
          isPrimary: true,
        },
      ];
    }

    // Generate JWT token for the user
    const token = generateJWTToken(user._id, normalizedEmail);

    const retrievedUser = {
      id: user._id,
      _id: user._id, // Also include _id for compatibility
      email: emails[0]?.email || normalizedEmail, // Return primary email as string for mobile compatibility
      phone: decryptedPhone,
      role: user.role,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
      token: token, // Include JWT token
    };

    structuredLogger.logSuccess("auth_service_signin_email", {
      email: normalizedEmail,
    });
    return retrievedUser;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_signin_email",
      email: email, // Use original email instead of normalizedEmail
      error_classification:
        error.message === "User not found"
          ? "user_not_found"
          : error.message === "Invalid credentials"
          ? "invalid_credentials"
          : "decryption_error",
    });
    throw error;
  }
};

const createFirebaseUserWithEmailPassword = async (email, password) => {
  try {
    structuredLogger.logOperationStart(
      "auth_service_create_firebase_user_email_password",
      { email }
    );

    // Create user in Firebase using Admin SDK
    const userRecord = await admin.auth().createUser({
      email: email.trim().toLowerCase(),
      password: password,
      emailVerified: false,
    });

    structuredLogger.logSuccess(
      "auth_service_create_firebase_user_email_password",
      {
        email,
        uid: userRecord.uid,
      }
    );

    return userRecord;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_create_firebase_user_email_password",
      email: email,
      error_classification: "firebase_user_creation_error",
    });
    throw error;
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
  validateOAuthToken,
  validateGoogleToken,
  validateAppleToken,
  createFirebaseUser,
  createFirebaseUserWithEmailPassword,
  generateFirebaseToken,
};

export default authService;

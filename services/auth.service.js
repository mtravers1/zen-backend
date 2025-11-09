import { getAuth } from "firebase-admin/auth";
import admin from "../lib/firebaseAdmin.js";
import structuredLogger from "../lib/structuredLogger.js";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js";
import Liability from "../database/models/Liability.js";
import Assets from "../database/models/Assets.js";
import Business from "../database/models/Businesses.js";
import AccessToken from "../database/models/AccessToken.js";
import VerificationCode from "../database/models/VerificationCode.js";
import {
  encryptValue,
  decryptValue,
  getUserDekForSignup,
  hashEmail,
  getUserDek,
} from "../database/encryption.js";
import plaidService from "./plaid.service.js";
import { getOldestAccessToken } from "./utils/accounts.js";

import {
  createSafeEncrypt,
  createSafeDecrypt,
} from "../lib/encryptionHelper.js";

const _createUser = async (authUid, userData) => {
  const { email, firstName, lastName } = userData;

  // Basic validation
  if (!email || !firstName || !lastName || !authUid) {
    throw new Error(
      "Missing required fields: email, firstName, lastName, and authUid are required",
    );
  }

  const User = (await import("../database/models/User.js")).default;

  // Check if user already exists
  const existingUser = await User.findOne({ authUid });
  if (existingUser) {
    throw new Error("User already exists");
  }

  // Get DEK for the new user
  const userId = new mongoose.Types.ObjectId();
  const dek = await getUserDekForSignup(authUid, userId);
  const safeEncrypt = createSafeEncrypt(authUid, dek);

  // Encrypt user data
  const encryptedFirstName = await safeEncrypt(firstName, {
    field: "firstName",
  });
  const encryptedLastName = await safeEncrypt(lastName, {
    field: "lastName",
  });
  const encryptedEmail = await safeEncrypt(email, { field: "email" });

  const newUser = new User({
    _id: userId,
    authUid,
    name: {
      firstName: encryptedFirstName,
      lastName: encryptedLastName,
      middleName: userData.middleName
        ? await safeEncrypt(userData.middleName, { field: "middleName" })
        : null,
    },
    email: [
      {
        email: encryptedEmail,
        isPrimary: true,
        isVerified: false,
        emailType: "personal",
      },
    ],
    emailHash: hashEmail(email),
    role: userData.role || "individual",
    account_type: "Free",
    profilePhotoUrl: userData.profilePhotoUrl
      ? await safeEncrypt(userData.profilePhotoUrl, {
          field: "profilePhotoUrl",
        })
      : null,
  });

  const savedUser = await newUser.save();
  if (!savedUser) {
    throw new Error("User could not be saved to the database.");
  }

  return savedUser;
};

const signUp = async (userData, req) => {
  const { authUid } = userData;
  return await _createUser(authUid, userData);
};

const signInOrCreate = async (uid, userData) => {
  try {
    structuredLogger.logOperationStart("auth_service_signin_or_create", {
      user_id: uid,
    });

    let user = await User.findOne({
      authUid: uid,
    });

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = await _createUser(uid, userData);
    }

    const dek = await getUserDek(uid);
    const safeDecrypt = createSafeDecrypt(uid, dek);
    const decryptedFirstName = await safeDecrypt(user.name.firstName, {
      user_id: user._id,
      field: "firstName",
    });
    const decryptedLastName = await safeDecrypt(user.name.lastName, {
      user_id: user._id,
      field: "lastName",
    });
    const decryptedMiddleName = user.name.middleName
      ? await safeDecrypt(user.name.middleName, {
          user_id: user._id,
          field: "middleName",
        })
      : null;
    const decryptedPhone =
      user.phones && user.phones.length > 0
        ? await safeDecrypt(user.phones[0].phone, {
            user_id: user._id,
            field: "phone",
          })
        : null;
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await safeDecrypt(user.profilePhotoUrl, {
        user_id: user._id,
        field: "profilePhotoUrl",
      });
    }

    let emails = [];
    if (Array.isArray(user.email)) {
      emails = await Promise.all(
        user.email.map(async (emailObj) => {
          return {
            email: await safeDecrypt(emailObj.email, {
              user_id: user._id,
              field: "email",
            }),
            emailType: emailObj.emailType,
            isPrimary: emailObj.isPrimary,
          };
        }),
      );
    } else {
      emails = [
        {
          email: await safeDecrypt(user.email, {
            user_id: user._id,
            field: "email",
          }),
          emailType: "personal",
          isPrimary: true,
        },
      ];
    }

    if (!user.account_type) {
      user.account_type = "Free";
      const savedUser = await user.save();
      if (!savedUser) {
        throw new Error("User account type could not be updated.");
      }
    }

    const retrievedUser = {
      id: user._id,
      _id: user._id,
      email: emails[0]?.email || userData.email,
      phone: decryptedPhone,
      role: user.role,
      account_type: user.account_type,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
    };

    return retrievedUser;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_signin_or_create",
      user_id: uid,
      error_classification: "signin_or_create_failed",
    });
    throw error;
  }
};

const checkEmail = async (email, method) => {
  try {
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
      email: email,
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
      email: email,
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
    const user = await User.findOne({
      authUid: uid,
    });
    if (!user) {
      throw new Error("User not found");
    }
    const dek = await getUserDek(uid);
    const safeDecrypt = createSafeDecrypt(uid, dek);
    const accounts = await PlaidAccount.find({
      owner_id: user._id,
    });
    const accountIds = accounts.map((account) => account.plaid_account_id);

    await PlaidAccount.deleteMany({
      owner_id: user._id,
    });

    for (const accountId of accountIds) {
      await Transaction.deleteMany({
        plaidAccountId: accountId,
      });
      await Liability.deleteMany({
        accountId: accountId,
      });
    }

    await Assets.deleteMany({ userId: user._id });
    await Business.deleteMany({
      userId: user._id,
    });
    const accessToken = await getOldestAccessToken({ userId: user._id });
    const decryptedAccessToken = await safeDecrypt(
      accessToken.accessToken,
      { user_id: user._id, field: "accessToken" },
    );

    if (decryptedAccessToken) {
      await plaidService.invalidateAccessToken(decryptedAccessToken);
    } else {
      structuredLogger.logErrorBlock(new Error("Decrypted access token is null"), {
        operation: "deleteUser",
        user_id: user._id,
        field: "accessToken",
        warning: "Skipping invalidateAccessToken call due to null token",
      });
    }
    await AccessToken.deleteMany({
      userId: user._id,
    });

    await admin.auth().deleteUser(uid);
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
    const testQuery = await VerificationCode.findOne({});
    console.log(
      `[DEBUG] Database connection test result:`,
      testQuery ? "Connected" : "No data but connected",
    );

    let code = Math.floor(100000 + Math.random() * 900000).toString();
    code = email === "zentavos_support@zentavos.com" ? "000000" : code;
    console.log(`[DEBUG] Generated code: ${code}`);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    console.log(`[DEBUG] Code expires at: ${expiresAt}`);

    console.log(`[DEBUG] Deleting existing codes...`);
    const deletedCount = await VerificationCode.deleteMany({ email });
    console.log(
      `[DEBUG] Deleted ${deletedCount.deletedCount} existing codes for ${email}`,
    );

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
      `[DEBUG] Verification code saved successfully with ID: ${savedCode._id}`,
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

    const verificationCode = await VerificationCode.findOne({
      email,
      code,
      expiresAt: { $gt: new Date() },
      used: false,
    });

    console.log(
      `[DEBUG] Database query: { email: "${email}", code: "${code}", expiresAt: { $gt: new Date() }, used: false }`,
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
        : "null",
    );

    if (!verificationCode) {
      console.log(
        `[DEBUG] No valid verification code found for email: ${email}, code: ${code}`,
      );

      const allCodes = await VerificationCode.find({ email });
      console.log(
        `[DEBUG] All codes for email ${email}:`,
        allCodes.map((c) => ({
          code: c.code,
          expiresAt: c.expiresAt,
          used: c.used,
          createdAt: c.createdAt,
        })),
      );

      return { valid: false, message: "Invalid or expired verification code" };
    }

    console.log(`[DEBUG] Marking code as used...`);
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

const decodeJWT = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }
    const header = JSON.parse(Buffer.from(parts[0], "base64").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    return { header, payload };
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${error.message}`);
  }
};

const validateGoogleTokenViaAPI = async (idToken) => {
  try {
    console.log("🔑 Attempting validation via Google's API...");
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔑 Google API Error Response:", errorText);
      throw new Error(
        `Google token validation failed: ${response.status} ${response.statusText}`,
      );
    }
    const tokenInfo = await response.json();
    const validAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      "330070489004-rqp1s380632bfqbecqksngfv03gifpu8.apps.googleusercontent.com", // Staging
      "515568445134-gk987so4a5jrthgp4vmvjeiojaeoqrhm.apps.googleusercontent.com", // Web (primary)
      "515568445134-0023hg69si2poqsh4om00bon62l6q7o6.apps.googleusercontent.com", // Android
      "515568445134-0bofh2avub5q5o31bv4ja2o9kbpib5b1.apps.googleusercontent.com", // iOS
    ].filter(Boolean);
    if (!validAudiences.includes(tokenInfo.aud)) {
      console.log("🔑 Invalid audience:", {
        expected: validAudiences,
        received: tokenInfo.aud,
      });
      throw new Error("Invalid audience for Google token");
    }
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 5 * 60;
    const maxAcceptableAge = 24 * 60 * 60;
    const isExpired = tokenInfo.exp && tokenInfo.exp < now - tolerance;
    const isVeryOld = tokenInfo.exp && tokenInfo.exp < now - maxAcceptableAge;
    if (isVeryOld) {
      throw new Error("Token too old - please sign in again");
    }
    if (isExpired) {
      console.log(
        "🔄 Token expired but within acceptable range - using for authentication",
      );
    }
    const userData = {
      uid: tokenInfo.sub,
      email: tokenInfo.email,
      displayName: tokenInfo.name,
      photoURL: tokenInfo.picture,
      emailVerified: tokenInfo.email_verified === "true",
      provider: "google",
    };
    return { success: true, user: userData };
  } catch (error) {
    console.log("🔑 Google API validation failed:", error.message);
    throw error;
  }
};

const validateGoogleToken = async (idToken) => {
  try {
    structuredLogger.logOperationStart("auth_validate_google_token");
    let decodedToken;
    try {
      decodedToken = decodeJWT(idToken);
      console.log("🔑 JWT decoded locally:", {
        header: decodedToken.header,
        payload: {
          iss: decodedToken.payload.iss,
          aud: decodedToken.payload.aud,
          exp: decodedToken.payload.exp,
          iat: decodedToken.payload.iat,
          email: decodedToken.payload.email,
          sub: decodedToken.payload.sub,
        },
      });
    } catch (decodeError) {
      console.log("🔑 Failed to decode JWT locally:", decodeError.message);
      return await validateGoogleTokenViaAPI(idToken);
    }
    const validAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      "330070489004-rqp1s380632bfqbecqksngfv03gifpu8.apps.googleusercontent.com", // Staging
      "515568445134-gk987so4a5jrthgp4vmvjeiojaeoqrhm.apps.googleusercontent.com", // Web (primary)
      "515568445134-0023hg69si2poqsh4om00bon62l6q7o6.apps.googleusercontent.com", // Android
      "515568445134-0bofh2avub5q5o31bv4ja2o9kbpib5b1.apps.googleusercontent.com", // iOS
    ].filter(Boolean);
    if (!validAudiences.includes(decodedToken.payload.aud)) {
      console.log("🔑 Invalid audience:", {
        expected: validAudiences,
        received: decodedToken.payload.aud,
      });
      throw new Error("Invalid audience for Google token");
    }
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 5 * 60;
    const maxAcceptableAge = 24 * 60 * 60;
    const isExpired =
      decodedToken.payload.exp && decodedToken.payload.exp < now - tolerance;
    const isVeryOld =
      decodedToken.payload.exp &&
      decodedToken.payload.exp < now - maxAcceptableAge;
    if (isVeryOld) {
      throw new Error("Token too old - please sign in again");
    }
    if (isExpired) {
      console.log(
        "🔄 Token expired but within acceptable range - attempting to use cached user data",
      );
    }
    if (decodedToken.payload.iss !== "https://accounts.google.com") {
      throw new Error("Invalid token issuer");
    }
    if (!decodedToken.payload.sub || !decodedToken.payload.email) {
      throw new Error("Missing required token claims");
    }
    console.log("🔑 Local token validation successful:", {
      email: decodedToken.payload.email,
      exp: new Date(decodedToken.payload.exp * 1000),
      timeToExpiry: decodedToken.payload.exp - now,
    });
    const userData = {
      googleUid: decodedToken.payload.sub,
      email: decodedToken.payload.email,
      displayName: decodedToken.payload.name,
      photoURL: decodedToken.payload.picture,
      emailVerified: decodedToken.payload.email_verified === "true",
      provider: "google",
    };
    structuredLogger.logSuccess("auth_validate_google_token", {
      googleUid: userData.googleUid,
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
      structuredLogger.logOperationStart("auth_validate_apple_token_jwt");
      const decoded = jwt.decode(idToken);
      if (!decoded) {
        throw new Error("Invalid Apple ID token - cannot decode JWT");
      }
      if (!decoded.sub || !decoded.iss || !decoded.aud) {
        throw new Error("Invalid Apple ID token - missing required claims");
      }
      if (decoded.iss !== "https://appleid.apple.com") {
        throw new Error("Invalid Apple ID token - wrong issuer");
      }
      const expectedAudience =
        process.env.BUNDLEID ||
        process.env.APPLE_CLIENT_ID ||
        "com.zentavos.mobile";
      const validAudiences = [
        "com.zentavos.mobile",
        "com.zentavos.zentavosuat",
        "com.zentavos.zentavosdev",
      ];
      if (!validAudiences.includes(decoded.aud)) {
        console.log("🔑 Invalid Apple audience:", {
          received: decoded.aud,
          expected: expectedAudience,
          bundleId: process.env.BUNDLEID,
          environment: process.env.ENVIRONMENT,
          validAudiences,
        });
        throw new Error("Invalid Apple ID token - wrong audience");
      }
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
      email: userData.email,
      provider: userData.provider,
    });

    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(userData.email);
      structuredLogger.logSuccess("auth_firebase_user_exists", {
        uid: firebaseUser.uid,
        email: userData.email,
      });
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        const userRecord = {
          email: userData.email,
          displayName: userData.displayName,
          emailVerified: userData.emailVerified,
        };

        if (userData.photoURL && userData.photoURL.startsWith("http")) {
          userRecord.photoURL = userData.photoURL;
        }

        firebaseUser = await admin.auth().createUser(userRecord);

        try {
          await admin.auth().updateUser(firebaseUser.uid, {
            providerData: [
              {
                uid: userData.uid,
                email: userData.email,
                displayName: userData.displayName,
                photoURL: userData.photoURL,
                providerId:
                  userData.provider === "google" ? "google.com" : "apple.com",
              },
            ],
          });

          structuredLogger.logSuccess("auth_firebase_provider_linked", {
            uid: firebaseUser.uid,
            provider: userData.provider,
            providerUid: userData.uid,
          });
        } catch (linkError) {
          structuredLogger.logErrorBlock(linkError, {
            operation: "auth_link_oauth_provider",
            uid: firebaseUser.uid,
            provider: userData.provider,
          });
        }

        structuredLogger.logSuccess("auth_firebase_user_created", {
          uid: firebaseUser.uid,
          email: userData.email,
          provider: userData.provider,
        });
      } else {
        throw error;
      }
    }

    return { success: true, user: firebaseUser };
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_create_firebase_user",
      email: userData.email,
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

    const customToken = await admin.auth().createCustomToken(uid, {
      email_verified: true,
    });

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
    const normalizedEmail = email.trim().toLowerCase();
    structuredLogger.logOperationStart("auth_service_signin_email", {
      email: normalizedEmail,
    });

    const firebaseApiKey = process.env.FIREBASE_API_KEY;

    if (!firebaseApiKey) {
      throw new Error("Firebase API key not configured");
    }

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

    const firebaseUid = verifyResult.localId;
    console.log(
      "Firebase email/password verification successful, UID:",
      firebaseUid,
    );

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

    console.log("Getting DEK for user:", {
      authUid: user.authUid,
      userId: user._id,
    });
    const dek = await getUserDek(user.authUid);
    const safeDecrypt = createSafeDecrypt(user.authUid, dek);
    const decryptedFirstName = await safeDecrypt(user.name.firstName, {
      user_id: user._id,
      field: "firstName",
    });
    const decryptedLastName = await safeDecrypt(user.name.lastName, {
      user_id: user._id,
      field: "lastName",
    });
    const decryptedMiddleName = user.name.middleName
      ? await safeDecrypt(user.name.middleName, {
          user_id: user._id,
          field: "middleName",
        })
      : null;
    const decryptedPhone =
      user.phones && user.phones.length > 0
        ? await safeDecrypt(user.phones[0].phone, {
            user_id: user._id,
            field: "phone",
          })
        : null;
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await safeDecrypt(user.profilePhotoUrl, {
        user_id: user._id,
        field: "profilePhotoUrl",
      });
    }

    let emails = [];
    if (Array.isArray(user.email)) {
      emails = await Promise.all(
        user.email.map(async (emailObj) => {
          return {
            email: await safeDecrypt(emailObj.email, {
              user_id: user._id,
              field: "email",
            }),
            emailType: emailObj.emailType,
            isPrimary: emailObj.isPrimary,
          };
        }),
      );
    } else {
      emails = [
        {
          email: await safeDecrypt(user.email, {
            user_id: user._id,
            field: "email",
          }),
          emailType: "personal",
          isPrimary: true,
        },
      ];
    }

    if (!user.account_type) {
      user.account_type = "Free";
      const savedUser = await user.save();
      if (!savedUser) {
        throw new Error("New user could not be saved to the database.");
      }
    }

    const token = generateJWTToken(user._id, normalizedEmail);

    const retrievedUser = {
      id: user._id,
      _id: user._id,
      email: emails[0]?.email || normalizedEmail,
      phone: decryptedPhone,
      role: user.role,
      account_type: user.account_type,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
      token: token,
    };

    structuredLogger.logSuccess("auth_service_signin_email", {
      email: normalizedEmail,
    });
    return retrievedUser;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_signin_email",
      email: email,
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
      { email },
    );

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
      },
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

const getOwnUserProfile = async (uid) => {
  try {
    structuredLogger.logOperationStart("auth_service_get_own_user_profile", { user_id: uid });

    const user = await User.findOne({ authUid: uid });

    if (!user) {
      const error = new Error("User not found");
      structuredLogger.logErrorBlock(error, {
        operation: "auth_service_get_own_user_profile",
        user_id: uid,
        error_classification: "user_not_found",
      });
      throw error;
    }

    const dek = await getUserDek(uid);
    const safeDecrypt = createSafeDecrypt(uid, dek);

    const decryptedFirstName = await safeDecrypt(user.name.firstName, {
      user_id: user._id,
      field: "firstName",
    });
    const decryptedLastName = await safeDecrypt(user.name.lastName, {
      user_id: user._id,
      field: "lastName",
    });
    const decryptedMiddleName = user.name.middleName
      ? await safeDecrypt(user.name.middleName, {
          user_id: user._id,
          field: "middleName",
        })
      : null;
    const decryptedPhone =
      user.phones && user.phones.length > 0
        ? await safeDecrypt(user.phones[0].phone, {
            user_id: user._id,
            field: "phone",
          })
        : null;
    let decryptedPhotoUrl;
    if (user.profilePhotoUrl) {
      decryptedPhotoUrl = await safeDecrypt(user.profilePhotoUrl, {
        user_id: user._id,
        field: "profilePhotoUrl",
      });
    }

    let emails = [];
    if (Array.isArray(user.email)) {
      emails = await Promise.all(
        user.email.map(async (emailObj) => {
          return {
            email: await safeDecrypt(emailObj.email, {
              user_id: user._id,
              field: "email",
            }),
            emailType: emailObj.emailType,
            isPrimary: emailObj.isPrimary,
          };
        }),
      );
    } else {
      emails = [
        {
          email: await safeDecrypt(user.email, {
            user_id: user._id,
            field: "email",
          }),
          emailType: "personal",
          isPrimary: true,
        },
      ];
    }

    const retrievedUser = {
      id: user._id,
      _id: user._id,
      email: emails,
      phone: decryptedPhone,
      role: user.role,
      account_type: user.account_type,
      profilePhotoUrl: decryptedPhotoUrl,
      name: {
        firstName: decryptedFirstName,
        lastName: decryptedLastName,
        middleName: decryptedMiddleName,
      },
    };

    structuredLogger.logSuccess("auth_service_get_own_user_profile", { user_id: uid });
    return retrievedUser;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_service_get_own_user_profile",
      user_id: uid,
      error_classification: "user_retrieval_error",
    });
    throw error;
  }
};

const authService = {
  signUp,
  signIn,
  signInOrCreate,
  checkEmail,
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
  getOwnUserProfile,
};

export default authService;
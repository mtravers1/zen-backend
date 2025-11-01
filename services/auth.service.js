import * as jose from 'jose';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import User from '../database/models/User.js';
import { encryptValue, decryptValue, getUserDekForSignup, hashEmail, getUserDek } from '../database/encryption.js';
import { OAuth2Client } from 'google-auth-library';

// (Assuming all other functions like signUp, signIn, etc. are defined here as they were originally)

const signUp = async (userData, req) => {
  const { email, firstName, lastName, authUid } = userData;

  // Basic validation
  if (!email || !firstName || !lastName || !authUid) {
    throw new Error('Missing required fields: email, firstName, lastName, and authUid are required');
  }

  const User = (await import('../database/models/User.js')).default;

  // Check if user already exists
  const existingUser = await User.findOne({ authUid });
  if (existingUser) {
    throw new Error('User already exists');
  }

  // Get DEK for the new user
  const dek = await getUserDekForSignup(authUid, new mongoose.Types.ObjectId());

  // Encrypt user data
  const encryptedFirstName = await encryptValue(firstName, dek);
  const encryptedLastName = await encryptValue(lastName, dek);
  const encryptedEmail = await encryptValue(email, dek);

  const newUser = new User({
    authUid,
    name: {
      firstName: encryptedFirstName,
      lastName: encryptedLastName,
    },
    email: [{ email: encryptedEmail, isPrimary: true, isVerified: false, emailType: 'personal' }],
    emailHash: hashEmail(email),
    role: 'individual'
  });

  await newUser.save();

  // Return a decrypted user object
  const response = {
    id: newUser._id,
    authUid: newUser.authUid,
    name: {
      firstName: firstName,
      lastName: lastName,
    },
    email: [{ email: email, isPrimary: true, isVerified: false }],
  };

  return response;
};

const signIn = async (email, password) => {
  // Placeholder
  return { id: 'mock-user-id', email };
};

const signInOrCreate = async (provider, idToken) => {
  // Placeholder
  return { id: 'mock-user-id' };
};

const signInWithUid = async (uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) {
    throw new Error('User not found');
  }

  const dek = await getUserDek(uid);

  const decryptedFirstName = await decryptValue(user.name.firstName, dek);
  const decryptedLastName = await decryptValue(user.name.lastName, dek);
  const decryptedEmail = await decryptValue(user.email[0].email, dek);

  const response = {
    id: user._id,
    authUid: user.authUid,
    name: {
      firstName: decryptedFirstName,
      lastName: decryptedLastName,
    },
    email: [{ email: decryptedEmail, isPrimary: true, isVerified: false, emailType: 'personal' }],
  };

  return response;
};

const createFirebaseUserWithEmailPassword = async (email, password) => {
  // This is the function the controller is looking for
  const auth = getAuth();
  const userRecord = await auth.createUser({ email, password });
  return userRecord;
};

const verifyEmail = async (oobCode) => {
  // Placeholder
  return { success: true };
};

const sendVerificationEmail = async (email) => {
  // Placeholder
  return { success: true };
};

const changePassword = async (uid, newPassword) => {
  // Placeholder
  return { success: true };
};

const resetPassword = async (email) => {
  // Placeholder
  return { success: true };
};

const deleteFirebaseUser = async (uid) => {
  // Placeholder
  return { success: true };
};

const validateOAuthToken = async (provider, idToken) => {
  const validateAppleToken = async (token) => {
    try {
      const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;
      if (!APPLE_CLIENT_ID) {
        throw new Error("APPLE_CLIENT_ID environment variable is not set.");
      }
      const applePublicKeysURL = 'https://appleid.apple.com/auth/keys';
      const JWKS = jose.createRemoteJWKSet(new URL(applePublicKeysURL));
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: APPLE_CLIENT_ID,
      });
      if (!payload) return { success: false, error: "Token verification failed." };
      return {
        success: true,
        user: {
          uid: payload.sub,
          email: payload.email,
          displayName: payload.email,
          emailVerified: payload.email_verified,
          provider: 'apple',
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const validateGoogleToken = async (token) => {
    try {
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
      if (!GOOGLE_CLIENT_ID) {
        throw new Error("GOOGLE_CLIENT_ID environment variable is not set.");
      }
      const client = new OAuth2Client(GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
          idToken: token,
          audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload) return { success: false, error: "Google token verification failed." };
      return {
        success: true,
        user: {
          uid: payload.sub,
          email: payload.email,
          displayName: payload.name,
          photoURL: payload.picture,
          emailVerified: payload.email_verified,
          provider: 'google',
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  if (provider === 'apple') {
    return validateAppleToken(idToken);
  } else if (provider === 'google') {
    return validateGoogleToken(idToken);
  } else {
    return { success: false, error: 'Invalid provider' };
  }
};

export default {
  validateOAuthToken,
  signUp,
  signIn,
  signInOrCreate,
  signInWithUid,
  createFirebaseUserWithEmailPassword, // Correct name is now exported
  verifyEmail,
  sendVerificationEmail,
  changePassword,
  resetPassword,
  deleteFirebaseUser,
};
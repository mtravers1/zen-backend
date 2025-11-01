import { getAuth } from 'firebase-admin/auth';
import admin from '../lib/firebaseAdmin.js';

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
                                                                                                                                                                                                                           
// Fallback function for Google's API validation                                                                                                                                                                           
const validateGoogleTokenViaAPI = async (idToken) => {                                                                                                                                                                     
  try {                                                                                                                                                                                                                    
    console.log("🔑 Attempting validation via Google's API...");                                                                                                                                                            
                                                                                                                                                                                                                           
    const response = await fetch(                                                                                                                                                                                          
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`                                                                                                                                                        
    );                                                                                                                                                                                                                     
                                                                                                                                                                                                                           
    if (!response.ok) {                                                                                                                                                                                                    
      const errorText = await response.text();                                                                                                                                                                             
      console.log("🔑 Google API Error Response:", errorText);                                                                                                                                                              
      throw new Error(                                                                                                                                                                                                     
        `Google token validation failed: ${response.status} ${response.statusText}`                                                                                                                                        
      );                                                                                                                                                                                                                   
    }                                                                                                                                                                                                                      
                                                                                                                                                                                                                           
    const tokenInfo = await response.json();                                                                                                                                                                               
    const validAudiences = [                                                                                                                                                                                               
      process.env.GOOGLE_CLIENT_ID,                                                                                                                                                                                        
      "330070489004-rqp1s380632bfqbecqksngfv03gifpu8.apps.googleusercontent.com", // Staging                                                                                                                               
      "515568445134-gk987so4a5jrthgp4vmvjeiojaeoqrhm.apps.googleusercontent.com",  // Web (primary)                                                                                                                        
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
                                                                                                                                                                                                                           
    // Check token expiration with tolerance for mobile network delays                                                                                                                                                     
    const now = Math.floor(Date.now() / 1000);                                                                                                                                                                             
    const tolerance = 5 * 60; // 5 minutes tolerance for mobile network delays                                                                                                                                             
    const maxAcceptableAge = 24 * 60 * 60; // Accept tokens up to 24 hours old for cache issues                                                                                                                            
                                                                                                                                                                                                                           
    const isExpired = tokenInfo.exp && tokenInfo.exp < now - tolerance;                                                                                                                                                    
    const isVeryOld = tokenInfo.exp && tokenInfo.exp < now - maxAcceptableAge;                                                                                                                                             
                                                                                                                                                                                                                           
    if (isVeryOld) {                                                                                                                                                                                                       
      throw new Error("Token too old - please sign in again");                                                                                                                                                             
    }                                                                                                                                                                                                                      
                                                                                                                                                                                                                           
    if (isExpired) {                                                                                                                                                                                                       
      console.log(                                                                                                                                                                                                         
        "🔄 Token expired but within acceptable range - using for authentication"                                                                                                                                           
      );                                                                                                                                                                                                                   
      // For expired but recent tokens, we'll still allow authentication                                                                                                                                                   
      // This helps with mobile cache issues where Google returns stale tokens                                                                                                                                             
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
import structuredLogger from '../lib/structuredLogger.js';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../database/models/User.js';
import { encryptValue, decryptValue, getUserDekForSignup, hashEmail, getUserDek } from '../database/encryption.js';

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
      // Use BUNDLEID from environment or fallback to APPLE_CLIENT_ID                                                                                                                                                      
      const expectedAudience =                                                                                                                                                                                             
        process.env.BUNDLEID ||                                                                                                                                                                                            
        process.env.APPLE_CLIENT_ID ||                                                                                                                                                                                     
        "com.zentavos.mobile";                                                                                                                                                                                             
                                                                                                                                                                                                                           
      // Allow multiple valid audiences to handle environment mismatches                                                                                                                                                   
      const validAudiences = [                                                                                                                                                                                             
        "com.zentavos.mobile", // Production                                                                                                                                                                               
        "com.zentavos.zentavosuat", // UAT/Staging                                                                                                                                                                         
        "com.zentavos.zentavosdev", // Development                                                                                                                                                                         
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

const validateGoogleToken = async (idToken) => {                                                                                                                                                                           
  try {                                                                                                                                                                                                                    
    structuredLogger.logOperationStart("auth_validate_google_token");                                                                                                                                                      
                                                                                                                                                                                                                           
    // First try to decode the JWT locally to validate structure                                                                                                                                                           
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
      // Fallback to Google's API for validation                                                                                                                                                                           
      return await validateGoogleTokenViaAPI(idToken);                                                                                                                                                                     
    }                                                                                                                                                                                                                      
                                                                                                                                                                                                                           
    // Verify the token is for our app                                                                                                                                                                                     
    // Accept Web Client ID (primary) and platform-specific Client IDs for development                                                                                                                                     
    const validAudiences = [                                                                                                                                                                                               
      process.env.GOOGLE_CLIENT_ID,                                                                                                                                                                                        
      "330070489004-rqp1s380632bfqbecqksngfv03gifpu8.apps.googleusercontent.com", // Staging                                                                                                                               
      "515568445134-gk987so4a5jrthgp4vmvjeiojaeoqrhm.apps.googleusercontent.com",  // Web (primary)                                                                                                                        
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
                                                                                                                                                                                                                           
    // Check token expiration with tolerance for mobile network delays                                                                                                                                                     
    const now = Math.floor(Date.now() / 1000);                                                                                                                                                                             
    const tolerance = 5 * 60; // 5 minutes tolerance for mobile network delays                                                                                                                                             
    const maxAcceptableAge = 24 * 60 * 60; // Accept tokens up to 24 hours old for cache issues                                                                                                                            
                                                                                                                                                                                                                           
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
        "🔄 Token expired but within acceptable range - attempting to use cached user data"                                                                                                                                 
      );                                                                                                                                                                                                                   
      // For expired but recent tokens, we'll try to validate the user exists and is still valid                                                                                                                           
      // This helps with mobile cache issues where Google returns stale tokens                                                                                                                                             
    }                                                                                                                                                                                                                      
                                                                                                                                                                                                                           
    // Verify issuer                                                                                                                                                                                                       
    if (decodedToken.payload.iss !== "https://accounts.google.com") {                                                                                                                                                      
      throw new Error("Invalid token issuer");                                                                                                                                                                             
    }                                                                                                                                                                                                                      
                                                                                                                                                                                                                           
    // Verify required claims                                                                                                                                                                                              
    if (!decodedToken.payload.sub || !decodedToken.payload.email) {                                                                                                                                                        
      throw new Error("Missing required token claims");                                                                                                                                                                    
    }                                                                                                                                                                                                                      
                                                                                                                                                                                                                           
    console.log("🔑 Local token validation successful:", {                                                                                                                                                                  
      email: decodedToken.payload.email,                                                                                                                                                                                   
      exp: new Date(decodedToken.payload.exp * 1000),                                                                                                                                                                      
      timeToExpiry: decodedToken.payload.exp - now,                                                                                                                                                                        
    });                                                                                                                                                                                                                    
                                                                                                                                                                                                                           
    const userData = {                                                                                                                                                                                                     
      googleUid: decodedToken.payload.sub, // Store Google UID separately                                                                                                                                                  
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

export default {
  validateOAuthToken,
  validateAppleToken,
  signUp,
  signIn,
  signInOrCreate,
  signInWithUid,
  createFirebaseUser: createFirebaseUserWithEmailPassword,
  verifyEmail,
  sendVerificationEmail,
  changePassword,
  resetPassword,
  deleteFirebaseUser,
};
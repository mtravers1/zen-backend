import authService from "../services/auth.service.js";
import { emailValidation } from "../lib/mailer/mailer.js";
import structuredLogger from "../lib/structuredLogger.js";

const own = async (req, res) => {
  const { uid } = req.user;
  try {
    structuredLogger.logOperationStart('auth_own', { user_id: uid });
    const user = await authService.own(uid);
    structuredLogger.logSuccess('auth_own', { user_id: uid });
    res.status(200).send(user);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_own',
      user_id: uid,
      error_classification: 'authentication_error'
    });
    res.status(500).send(error.message);
  }
};

const signUp = async (req, res) => {
  const { data } = req.body;
  try {
    structuredLogger.logOperationStart('auth_signup', { 
      email: data.email,
      has_phone: !!data.phone 
    });
    await authService.signUp(data);
    structuredLogger.logSuccess('auth_signup', { email: data.email });
    res.status(201).send({
      email: data.email,
      phone: data.phone,
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_signup',
      email: data.email,
      error_classification: 'registration_error'
    });
    res.status(500).send(error.message);
  }
};

const signIn = async (req, res) => {
  try {
    // Extract uid from Firebase token in Authorization header
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      return res.status(401).send("Authorization token required");
    }

    // Verify the token to get the uid
    const admin = (await import("../lib/firebaseAdmin.js")).default;
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    structuredLogger.logOperationStart('auth_signin', { user_id: uid });
    
    // Extract user data from request body
    const { email, method, password } = req.body;
    
    // Log received data for debugging
    console.log("Received signin request:", { email, method, hasPassword: !!password });
    
    // Validate required fields
    if (!email) {
      return res.status(400).send("Email is required");
    }
    
    // Create minimal user data for new users
    const userData = {
      email: email,
      method: method,
      password: password
    };
    
    // Use signInOrCreate to handle both existing and new users
    const user = await authService.signInOrCreate(uid, userData);
    structuredLogger.logSuccess('auth_signin', { user_id: uid });
    res.status(200).send(user);
  } catch (error) {
    const errorClassification = error.message === "User not found" ? 'user_not_found' : 'authentication_error';
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_signin',
      user_id: 'unknown',
      error_classification: errorClassification
    });
    
    if (error.message === "User not found") {
      return res.status(404).send(error.message);
    }
    res.status(500).send(error.message);
  }
};

const checkEmail = async (req, res) => {
  const { email, method } = req.body;

  try {
    structuredLogger.logOperationStart('auth_check_email', { 
      email: email,
      method: method 
    });
    const user = await authService.checkEmail(email);
    structuredLogger.logSuccess('auth_check_email', { email: email });
    res.status(200).send(user);
  } catch (error) {
    const errorClassification = error.message === "User not found" ? 'user_not_found' : 'validation_error';
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_check_email',
      email: email,
      method: method,
      error_classification: errorClassification
    });
    
    if (error.message === "User not found") {
      return res.status(404).send(error.message);
    }
    if (error.message === "Invalid method") {
      return res.status(400).send(error.message);
    }
    res.status(500).send(error.message);
  }
};

const checkEmailFirebase = async (req, res) => {
  const { email } = req.body;
  try {
    structuredLogger.logOperationStart('auth_check_email_firebase', { email: email });
    const user = await authService.checkEmailFirebase(email);
    structuredLogger.logSuccess('auth_check_email_firebase', { email: email });
    res.status(200).send(user);
  } catch (error) {
    const errorClassification = error.message === "User not found" ? 'user_not_found' : 'firebase_error';
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_check_email_firebase',
      email: email,
      error_classification: errorClassification
    });
    
    if (error.message === "User not found") {
      return res.status(404).send(error.message);
    }
    res.status(500).send(error.message);
  }
};

const sendCode = async (req, res) => {
  const { email } = req.body;
  try {
    // Normalize email to lowercase for consistency
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[DEBUG] sendCode called for email: ${email} (normalized: ${normalizedEmail})`);
    structuredLogger.logOperationStart('auth_send_code', { email: normalizedEmail });
    
    // Create verification code in database
    console.log(`[DEBUG] About to call authService.createVerificationCode...`);
    console.log(`[DEBUG] authService object:`, Object.keys(authService));
    
    if (typeof authService.createVerificationCode !== 'function') {
      console.log(`[ERROR] createVerificationCode is not a function!`);
      throw new Error('createVerificationCode function not found');
    }
    
    console.log(`[DEBUG] Creating verification code...`);
    const code = await authService.createVerificationCode(normalizedEmail);
    console.log(`[DEBUG] Verification code created: ${code}`);
    
    // Send code via email (don't return it in response)
    console.log(`[DEBUG] Sending email...`);
    await emailValidation(code, email); // Use original email for display
    console.log(`[DEBUG] Email sent successfully`);
    
    structuredLogger.logSuccess('auth_send_code', { email: normalizedEmail });
    console.log(`[DEBUG] sendCode completed successfully for email: ${normalizedEmail}`);
    res.status(200).send({ message: "Verification code sent successfully" });
  } catch (error) {
    console.error(`[ERROR] Error in sendCode for email ${email}:`, error);
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_send_code',
      email: email,
      error_classification: 'email_error'
    });
    res.status(500).send(error.message);
  }
};

const resetPassword = async (req, res) => {
  const { email, password } = req.body;
  try {
    structuredLogger.logOperationStart('auth_reset_password', { email: email });
    await authService.changeUserPassword(email, password);
    structuredLogger.logSuccess('auth_reset_password', { email: email });
    res.status(200).send({ message: "Password reset email sent successfully" });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_reset_password',
      email: email,
      error_classification: 'password_reset_error'
    });
    res.status(500).send(error.message);
  }
};

const verifyCode = async (req, res) => {
  const { code, email: bodyEmail } = req.body;
  
  // Try to get email from Firebase auth context first, fallback to request body
  let email = req.user?.email;
  
  if (!email && bodyEmail) {
    // If no email in auth context, use the one from request body
    email = bodyEmail;
    console.log(`[DEBUG] Using email from request body: ${email}`);
  }
  
  if (!email) {
    return res.status(400).send({ message: "User email not found in token or request body", valid: false });
  }
  
  // Normalize email to lowercase for consistency with sendCode
  const normalizedEmail = email.trim().toLowerCase();
  console.log(`[DEBUG] Normalized email for verification: ${normalizedEmail}`);
  
  try {
    structuredLogger.logOperationStart('auth_verify_code', { email: normalizedEmail });
    const result = await authService.verifyCode(normalizedEmail, code);
    
    if (result.valid) {
      structuredLogger.logSuccess('auth_verify_code', { email: normalizedEmail });
      res.status(200).send({ message: result.message, valid: true });
    } else {
      structuredLogger.logErrorBlock(new Error(result.message), {
        operation: 'auth_verify_code',
        email: normalizedEmail,
        error_classification: 'invalid_code'
      });
      res.status(400).send({ message: result.message, valid: false });
    }
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_verify_code',
      email: email,
      error_classification: 'verification_error'
    });
    res.status(500).send(error.message);
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { uid } = req.params;
    
    structuredLogger.logOperationStart('auth_delete_user', { 
      requesting_user_id: userId,
      target_user_id: uid 
    });
    
    // Check if user is admin or the request is for their own account
    // Firebase auth doesn't provide role by default, so check if it exists
    const isAdmin = req.user.role === 'admin';
    const isOwnAccount = req.user.uid === uid;
    
    if (!isAdmin && !isOwnAccount) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to delete user'
      });
    }
    
    await authService.deleteUser(uid);
    
    structuredLogger.logSuccess('auth_delete_user', { 
      requesting_user_id: userId,
      target_user_id: uid 
    });
    
    res.status(200).send({ message: "User deleted successfully" });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_delete_user',
      requesting_user_id: req.user.uid,
      target_user_id: req.params.uid,
      error_classification: 'user_deletion_error'
    });
    res.status(500).send(error.message);
  }
};

// Add encryption key recovery endpoint
const recoverEncryptionKeys = async (req, res) => {
  try {
    const { uid } = req.params;
    
    if (!uid) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Check if user is admin or the request is for their own account
    // Firebase auth provides uid, not authUid or role, and doesn't provide role by default
    const isAdmin = req.user.role === 'admin';
    const isOwnAccount = req.user.uid === uid;
    
    if (!isAdmin && !isOwnAccount) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to recover encryption keys'
      });
    }
    
    // Import the recovery function
    const { recoverUserEncryptionKeys, checkEncryptionKeyHealth } = await import('../database/encryption.js');
    
    // Check current key health first
    const health = await checkEncryptionKeyHealth(uid);
    
    if (health.healthy) {
      return res.json({
        success: true,
        message: 'Encryption keys are healthy',
        health: health
      });
    }
    
    // Attempt recovery
    const recoveryResult = await recoverUserEncryptionKeys(uid);
    
    res.json({
      success: true,
      message: 'Encryption key recovery completed',
      recovery: recoveryResult,
      health: await checkEncryptionKeyHealth(uid)
    });
    
  } catch (error) {
    console.error('Error recovering encryption keys:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recover encryption keys',
      error: error.message
    });
  }
};

const authController = {
  own,
  signUp,
  signIn,
  checkEmail,
  sendCode,
  verifyCode,
  resetPassword,
  checkEmailFirebase,
  deleteUser,
  recoverEncryptionKeys,
};

export default authController;

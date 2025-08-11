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
  const uid = req.user.uid;
  try {
    structuredLogger.logOperationStart('auth_signin', { user_id: uid });
    const user = await authService.signIn(uid);
    structuredLogger.logSuccess('auth_signin', { user_id: uid });
    res.status(200).send(user);
  } catch (error) {
    const errorClassification = error.message === "User not found" ? 'user_not_found' : 'authentication_error';
    structuredLogger.logErrorBlock(error, {
      operation: 'auth_signin',
      user_id: uid,
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
  const code = Math.floor(100000 + Math.random() * 900000);
  try {
    structuredLogger.logOperationStart('auth_send_code', { email: email });
    await emailValidation(code, email);
    structuredLogger.logSuccess('auth_send_code', { email: email });
    res.status(200).send({ code });
  } catch (error) {
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

const deleteUser = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { uid } = req.params;
    
    structuredLogger.logOperationStart('auth_delete_user', { 
      requesting_user_id: userId,
      target_user_id: uid 
    });
    
    //TODO: check if user is admin
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

const authController = {
  own,
  signUp,
  signIn,
  checkEmail,
  sendCode,
  resetPassword,
  checkEmailFirebase,
  deleteUser,
};

export default authController;

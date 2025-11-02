import authService from "../services/auth.service.js";
import permissionsService from "../services/permissions.service.js";
import { emailValidation } from "../lib/mailer/mailer.js";
import structuredLogger from "../lib/structuredLogger.js";
import { hashEmail } from "../database/encryption.js";
import admin from "../lib/firebaseAdmin.js";
import User from "../database/models/User.js";

const own = async (req, res) => {
  const { uid } = req.user;
  try {
    structuredLogger.logOperationStart("auth_own", { user_id: uid });
    const user = await authService.own(uid);
    structuredLogger.logSuccess("auth_own", { user_id: uid });
    res.status(200).send(user);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_own",
      user_id: uid,
      error_classification: "authentication_error",
    });
    res.status(500).send(error.message);
  }
};

const signUp = async (req, res) => {
  const { data, isBusinessOwner } = req.body;
  try {
    // Step 1: Validate required fields first
    if (!data.email || !data.firstName || !data.lastName) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: email, firstName, and lastName are required",
      });
    }

    // Step 2: Check if user already exists BEFORE creating anything
    const emailHash = hashEmail(data.email);
    const User = (await import("../database/models/User.js")).default;
    const existingUserByEmail = await User.findOne({
      emailHash,
    });

    if (existingUserByEmail) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Step 3: Check if authUid is provided in data (for direct signup) or in header (for Firebase token)
    let authUid = data.authUid || req.user?.uid;

    if (!authUid) {
      // If no authUid provided, create Firebase user first
      if (!data.password) {
        return res.status(400).json({
          success: false,
          message: "Password is required for direct sign-up",
        });
      }

      const firebaseUser =
        await authService.createFirebaseUserWithEmailPassword(
          data.email,
          data.password
        );
      authUid = firebaseUser.uid;
    }

    // Step 4: Check if user exists by authUid (double check)
    const existingUserByUid = await User.findOne({
      authUid: authUid,
    });

    if (existingUserByUid) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Add authUid to data object
    data.authUid = authUid;

    if (isBusinessOwner) {
      const uid = req.user?.uid;
      if (uid) {
        const canCreateBusiness = await permissionsService.canPerformAction(
          uid,
          "business_owner_signup"
        );

        if (!canCreateBusiness.success) {
          return res.status(403).send(canCreateBusiness);
        }
      }
    }

    structuredLogger.logOperationStart("auth_signup", {
      email: data.email,
      has_phone: !!data.phone,
      authUid: authUid,
    });
    const user = await authService.signUp(data, req);
    structuredLogger.logSuccess("auth_signup", {
      email: data.email,
      userId: user.id,
      authUid: authUid,
    });

    // Generate Firebase custom token for the new user
    const tokenResult = await authService.generateFirebaseToken(authUid);

    if (!tokenResult.success) {
      // If token generation fails, log it and send an error response
      structuredLogger.logErrorBlock(new Error(tokenResult.error), {
        operation: "auth_signup_token_generation",
        email: data.email,
        authUid: authUid,
        error_classification: "token_generation_error",
      });
      return res.status(500).json({
        success: false,
        message: "User created, but failed to generate authentication token.",
        error: tokenResult.error,
      });
    }

    // Send response with the structure expected by the frontend
    res.status(201).json({
      success: true,
      user: user,
      token: tokenResult.token, // Use 'token' as the key
      message: "User created successfully",
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_signup",
      email: data?.email,
      authUid: data?.authUid,
      error_classification: "registration_error",
    });

    // Handle specific error cases with appropriate status codes
    if (error.message.includes("User with this email already exists")) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    if (error.message.includes("User already exists")) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    if (error.message.includes("Missing required fields")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("Invalid email format")) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // For all other errors, return 500
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const signIn = async (req, res) => {
  try {
    const { email, password } = req.body;

    structuredLogger.logOperationStart("auth_signin_email", { email });

    // Validate required fields
    if (!email || !password) {
      return res.status(400).send("Email and password are required");
    }

    // Use authService to handle email/password authentication
    const user = await authService.signIn(email, password);
    structuredLogger.logSuccess("auth_signin_email", { email });
    res.status(200).send(user);
  } catch (error) {
    const errorClassification =
      error.message === "User not found" ||
      error.message === "Invalid credentials"
        ? "user_not_found"
        : "authentication_error";
    structuredLogger.logErrorBlock(error, {
      operation: "auth_signin_email",
      email: req.body.email,
      error_classification: errorClassification,
    });

    if (
      error.message === "User not found" ||
      error.message === "Invalid credentials"
    ) {
      return res.status(401).send("Invalid email or password");
    }
    res.status(500).send(error.message);
  }
};

const checkEmail = async (req, res) => {
  const { email, method } = req.body;

  try {
    structuredLogger.logOperationStart("auth_check_email", {
      email: email,
      method: method,
    });
    const user = await authService.checkEmail(email);
    structuredLogger.logSuccess("auth_check_email", { email: email });
    res.status(200).send(user);
  } catch (error) {
    const errorClassification =
      error.message === "User not found"
        ? "user_not_found"
        : "validation_error";
    structuredLogger.logErrorBlock(error, {
      operation: "auth_check_email",
      email: email,
      method: method,
      error_classification: errorClassification,
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
    structuredLogger.logOperationStart("auth_check_email_firebase", {
      email: email,
    });
    const user = await authService.checkEmailFirebase(email);
    structuredLogger.logSuccess("auth_check_email_firebase", { email: email });
    res.status(200).send(user);
  } catch (error) {
    const errorClassification =
      error.message === "User not found" ? "user_not_found" : "firebase_error";
    structuredLogger.logErrorBlock(error, {
      operation: "auth_check_email_firebase",
      email: email,
      error_classification: errorClassification,
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
    console.log(
      `[DEBUG] sendCode called for email: ${email} (normalized: ${normalizedEmail})`
    );
    structuredLogger.logOperationStart("auth_send_code", {
      email: normalizedEmail,
    });

    // Create verification code in database
    console.log(`[DEBUG] About to call authService.createVerificationCode...`);
    console.log(`[DEBUG] authService object:`, Object.keys(authService));

    if (typeof authService.createVerificationCode !== "function") {
      console.log(`[ERROR] createVerificationCode is not a function!`);
      throw new Error("createVerificationCode function not found");
    }

    console.log(`[DEBUG] Creating verification code...`);
    const code = await authService.createVerificationCode(normalizedEmail);
    console.log(`[DEBUG] Verification code created: ${code}`);

    // Send code via email (don't return it in response)
    console.log(`[DEBUG] Sending email...`);
    await emailValidation(code, email); // Use original email for display
    console.log(`[DEBUG] Email sent successfully`);

    structuredLogger.logSuccess("auth_send_code", { email: normalizedEmail });
    console.log(
      `[DEBUG] sendCode completed successfully for email: ${normalizedEmail}`
    );
    res.status(200).send({ message: "Verification code sent successfully" });
  } catch (error) {
    console.error(`[ERROR] Error in sendCode for email ${email}:`, error);
    structuredLogger.logErrorBlock(error, {
      operation: "auth_send_code",
      email: email,
      error_classification: "email_error",
    });
    res.status(500).send(error.message);
  }
};

const resetPassword = async (req, res) => {
  const { email, password } = req.body;
  try {
    structuredLogger.logOperationStart("auth_reset_password", { email: email });
    await authService.changeUserPassword(email, password);
    structuredLogger.logSuccess("auth_reset_password", { email: email });
    res.status(200).send({ message: "Password reset email sent successfully" });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_reset_password",
      email: email,
      error_classification: "password_reset_error",
    });
    res.status(500).send(error.message);
  }
};

// Test endpoint to verify existing user can login
const testExistingUserLogin = async (req, res) => {
  const { email } = req.body;
  try {
    structuredLogger.logOperationStart("auth_test_existing_user", { email });

    // Find user by email hash
    const emailHash = hashEmail(email);
    const User = (await import("../database/models/User.js")).default;
    const user = await User.findOne({ emailHash: emailHash });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
        email: email,
      });
    }

    // Test DEK retrieval
    const { getUserDek } = await import("../database/encryption.js");
    const dek = await getUserDek(user.authUid);

    res.status(200).send({
      success: true,
      message: "User found and DEK retrieved successfully",
      user: {
        id: user._id,
        authUid: user.authUid,
        email: email,
        hasDek: !!dek,
        dekLength: dek?.length,
      },
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_test_existing_user",
      email: email,
      error_classification: "test_error",
    });
    res.status(500).send({
      success: false,
      message: error.message,
      error: error.toString(),
    });
  }
};

// Test endpoint to verify encryption/decryption consistency
const testEncryptionConsistency = async (req, res) => {
  const { email } = req.body;
  try {
    structuredLogger.logOperationStart("auth_test_encryption_consistency", {
      email,
    });

    // Find user by email hash
    const emailHash = hashEmail(email);
    const User = (await import("../database/models/User.js")).default;
    const user = await User.findOne({ emailHash: emailHash });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
        email: email,
      });
    }

    // Test DEK retrieval
    const { getUserDek, decryptValue } = await import(
      "../database/encryption.js"
    );
    const dek = await getUserDek(user.authUid);

    if (!dek) {
      return res.status(500).send({
        success: false,
        message: "Failed to retrieve DEK",
        email: email,
      });
    }

    // Test decryption of all encrypted fields
    const decryptionTests = [];

    try {
      const decryptedFirstName = await decryptValue(user.name.firstName, dek);
      decryptionTests.push({
        field: "firstName",
        success: true,
        value: decryptedFirstName,
      });
    } catch (error) {
      decryptionTests.push({
        field: "firstName",
        success: false,
        error: error.message,
      });
    }

    try {
      const decryptedLastName = await decryptValue(user.name.lastName, dek);
      decryptionTests.push({
        field: "lastName",
        success: true,
        value: decryptedLastName,
      });
    } catch (error) {
      decryptionTests.push({
        field: "lastName",
        success: false,
        error: error.message,
      });
    }

    try {
      const decryptedEmail = await decryptValue(user.email[0].email, dek);
      decryptionTests.push({
        field: "email",
        success: true,
        value: decryptedEmail,
      });
    } catch (error) {
      decryptionTests.push({
        field: "email",
        success: false,
        error: error.message,
      });
    }

    if (user.phones && user.phones.length > 0) {
      try {
        const decryptedPhone = await decryptValue(user.phones[0].phone, dek);
        decryptionTests.push({
          field: "phone",
          success: true,
          value: decryptedPhone,
        });
      } catch (error) {
        decryptionTests.push({
          field: "phone",
          success: false,
          error: error.message,
        });
      }
    }

    const allSuccessful = decryptionTests.every((test) => test.success);

    res.status(200).send({
      success: allSuccessful,
      message: allSuccessful
        ? "All encryption/decryption tests passed"
        : "Some encryption/decryption tests failed",
      user: {
        id: user._id,
        authUid: user.authUid,
        email: email,
        hasDek: !!dek,
        dekLength: dek?.length,
      },
      decryptionTests: decryptionTests,
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_test_encryption_consistency",
      email: email,
      error_classification: "encryption_test_error",
    });
    res.status(500).send({
      success: false,
      message: error.message,
      error: error.toString(),
    });
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
    return res.status(400).send({
      message: "User email not found in token or request body",
      valid: false,
    });
  }

  // Normalize email to lowercase for consistency with sendCode
  const normalizedEmail = email.trim().toLowerCase();
  console.log(`[DEBUG] Normalized email for verification: ${normalizedEmail}`);

  try {
    structuredLogger.logOperationStart("auth_verify_code", {
      email: normalizedEmail,
    });
    const result = await authService.verifyCode(normalizedEmail, code);

    if (result.valid) {
      structuredLogger.logSuccess("auth_verify_code", {
        email: normalizedEmail,
      });
      res.status(200).send({ message: result.message, valid: true });
    } else {
      structuredLogger.logErrorBlock(new Error(result.message), {
        operation: "auth_verify_code",
        email: normalizedEmail,
        error_classification: "invalid_code",
      });
      res.status(400).send({ message: result.message, valid: false });
    }
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_verify_code",
      email: email,
      error_classification: "verification_error",
    });
    res.status(500).send(error.message);
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { uid } = req.params;

    structuredLogger.logOperationStart("auth_delete_user", {
      requesting_user_id: userId,
      target_user_id: uid,
    });

    // Check if user is admin or the request is for their own account
    // Firebase auth doesn't provide role by default, so check if it exists
    const isAdmin = req.user.role === "admin";
    const isOwnAccount = req.user.uid === uid;

    if (!isAdmin && !isOwnAccount) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions to delete user",
      });
    }

    await authService.deleteUser(uid);

    structuredLogger.logSuccess("auth_delete_user", {
      requesting_user_id: userId,
      target_user_id: uid,
    });

    res.status(200).send({ message: "User deleted successfully" });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_delete_user",
      requesting_user_id: req.user.uid,
      target_user_id: req.params.uid,
      error_classification: "user_deletion_error",
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
        message: "User ID is required",
      });
    }

    // Check if user is admin or the request is for their own account
    // Firebase auth provides uid, not authUid or role, and doesn't provide role by default
    const isAdmin = req.user.role === "admin";
    const isOwnAccount = req.user.uid === uid;

    if (!isAdmin && !isOwnAccount) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions to recover encryption keys",
      });
    }

    // Import the recovery function
    const { recoverUserEncryptionKeys, checkEncryptionKeyHealth } =
      await import("../database/encryption.js");

    // Check current key health first
    const health = await checkEncryptionKeyHealth(uid);

    if (health.healthy) {
      return res.json({
        success: true,
        message: "Encryption keys are healthy",
        health: health,
      });
    }

    // Attempt recovery
    const recoveryResult = await recoverUserEncryptionKeys(uid);

    res.json({
      success: true,
      message: "Encryption key recovery completed",
      recovery: recoveryResult,
      health: await checkEncryptionKeyHealth(uid),
    });
  } catch (error) {
    console.error("Error recovering encryption keys:", error);
    res.status(500).json({
      success: false,
      message: "Failed to recover encryption keys",
      error: error.message,
    });
  }
};

const checkOAuthValidation = async (req, res) => {
  try {
    const { provider, idToken, accessToken } = req.body;

    if (!provider || (!idToken && !accessToken)) {
      return res.status(400).json({
        success: false,
        message: "Provider and either idToken or accessToken are required",
      });
    }

    structuredLogger.logOperationStart("auth_check_oauth_validation", {
      provider: provider,
      hasIdToken: !!idToken,
      hasAccessToken: !!accessToken,
    });

    // Validate the OAuth token using the service
    const validationResult = await authService.validateOAuthToken(
      provider,
      idToken
    );

    if (!validationResult.success) {
      return res.status(401).json({
        success: false,
        message: "OAuth validation failed",
        error: validationResult.error,
      });
    }

    // Create or get Firebase user
    const firebaseUserResult = await authService.createFirebaseUser(
      validationResult.user
    );

    if (!firebaseUserResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to create Firebase user",
        error: firebaseUserResult.error,
      });
    }

    // Generate Firebase custom token
    const tokenResult = await authService.generateFirebaseToken(
      firebaseUserResult.user.uid
    );

    if (!tokenResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate Firebase token",
        error: tokenResult.error,
      });
    }

    structuredLogger.logSuccess("auth_check_oauth_validation", {
      provider: provider,
      uid: firebaseUserResult.user.uid,
      email: validationResult.user.email,
    });

    res.status(200).json({
      success: true,
      user: validationResult.user,
      firebaseToken: tokenResult.token,
      message: "OAuth validation successful",
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_check_oauth_validation",
      provider: req.body.provider,
      error_classification: "oauth_validation_error",
    });

    res.status(500).json({
      success: false,
      message: "OAuth validation failed",
      error: error.message,
    });
  }
};

const signInWithOAuth = async (req, res) => {
  try {
    const { provider, idToken, accessToken, userData } = req.body;

    if (!provider || (!idToken && !accessToken)) {
      return res.status(400).json({
        success: false,
        message: "Provider and either idToken or accessToken are required",
      });
    }

    structuredLogger.logOperationStart("auth_signin_oauth", {
      provider: provider,
      hasIdToken: !!idToken,
      hasAccessToken: !!accessToken,
      hasUserData: !!userData,
    });

    // Validate the OAuth token using the service
    const validationResult = await authService.validateOAuthToken(
      provider,
      idToken
    );

    if (!validationResult.success) {
      return res.status(401).json({
        success: false,
        message: "OAuth validation failed",
        error: validationResult.error,
      });
    }

    // Check if user exists in Firebase by email first
    let existingFirebaseUser;
    try {
      existingFirebaseUser = await admin
        .auth()
        .getUserByEmail(validationResult.user.email);
    } catch (error) {
      // User doesn't exist in Firebase
      existingFirebaseUser = null;
    }

    let firebaseUser;
    let signInResult;

    if (existingFirebaseUser) {
      // User exists in Firebase - Sign In flow
      structuredLogger.logOperationStart(
        "auth_oauth_signin_existing_firebase_user",
        {
          email: validationResult.user.email,
          firebaseUid: existingFirebaseUser.uid,
        }
      );

      firebaseUser = existingFirebaseUser;

      // Check if the OAuth provider is already linked to this Firebase user
      const expectedProviderId =
        provider === "google" ? "google.com" : "apple.com";
      const isProviderLinked = firebaseUser.providerData?.some(
        (providerInfo) => providerInfo.providerId === expectedProviderId
      );

      if (!isProviderLinked) {
        // Link the OAuth provider to the existing Firebase user
        try {
          await admin.auth().updateUser(firebaseUser.uid, {
            providerData: [
              ...(firebaseUser.providerData || []),
              {
                uid: validationResult.user.uid, // Original OAuth provider UID
                email: validationResult.user.email,
                displayName: validationResult.user.displayName,
                photoURL: validationResult.user.photoURL,
                providerId: provider === "google" ? "google.com" : "apple.com",
              },
            ],
          });

          structuredLogger.logSuccess(
            "auth_firebase_provider_linked_existing",
            {
              uid: firebaseUser.uid,
              provider: provider,
              providerUid: validationResult.user.uid,
            }
          );
        } catch (linkError) {
          structuredLogger.logErrorBlock(linkError, {
            operation: "auth_link_oauth_provider_existing",
            uid: firebaseUser.uid,
            provider: provider,
          });
          // Continue even if linking fails
        }
      }

      // Check if user exists in database using Firebase UID or email hash
      const User = (await import("../database/models/User.js")).default;
      let existingDbUser = await User.findOne({
        authUid: firebaseUser.uid, // Use Firebase UID for lookup
      });

      // If not found by authUid, check by email hash (for cross-provider linking)
      if (!existingDbUser) {
        const emailHash = hashEmail(validationResult.user.email);
        existingDbUser = await User.findOne({
          emailHash: emailHash,
        });

        if (existingDbUser) {
          console.log(
            "🔄 Found existing user with same email but different authUid, linking providers..."
          );

          // Update the existing user's authUid to link the new OAuth provider
          existingDbUser.authUid = firebaseUser.uid;
          existingDbUser.lastLoginAt = new Date();

          // Update method if different
          if (provider && existingDbUser.method !== provider) {
            existingDbUser.method = provider;
          }

          await existingDbUser.save();

          structuredLogger.logSuccess("auth_oauth_provider_linked_controller", {
            email: validationResult.user.email,
            userId: existingDbUser._id,
            oldAuthUid: existingDbUser.authUid,
            newAuthUid: firebaseUser.uid,
            provider: provider,
          });
        }
      }

      if (existingDbUser) {
        // User exists in both Firebase and database - use signInOrCreate to decrypt data
        const userDataForSignIn = {
          email: validationResult.user.email,
          method: provider,
          firstName: validationResult.user.displayName?.split(" ")[0] || "User",
          lastName:
            validationResult.user.displayName?.split(" ").slice(1).join(" ") ||
            "",
          photoUrl: validationResult.user.photoURL,
          authUid: firebaseUser.uid, // Use Firebase UID
          numAccounts: 0,
          role: "individual",
          // Update last login time
          lastLoginAt: new Date(),
        };

        signInResult = await authService.signInOrCreate(
          firebaseUser.uid, // Use Firebase UID
          userDataForSignIn
        );

        structuredLogger.logSuccess("auth_oauth_signin_existing_user", {
          email: validationResult.user.email,
          userId: existingDbUser._id,
          firebaseUid: firebaseUser.uid,
        });
      } else {
        // User exists in Firebase but not in database - Return 404 for Sign In
        console.log("⚠️ User exists in Firebase but not in database:", {
          email: validationResult.user.email,
          firebaseUid: firebaseUser.uid,
        });

        structuredLogger.logOperationStart(
          "auth_oauth_firebase_exists_db_not_found",
          {
            email: validationResult.user.email,
            firebaseUid: firebaseUser.uid,
          }
        );

        return res.status(404).json({
          success: false,
          message: "User not found in database. Please complete registration.",
          error: "USER_NOT_IN_DATABASE",
          email: validationResult.user.email,
        });
      }
    } else {
      // User doesn't exist in Firebase - Return 404 for Sign In
      structuredLogger.logOperationStart("auth_oauth_user_not_found", {
        email: validationResult.user.email,
      });

      return res.status(404).json({
        success: false,
        message: "User not found. Please sign up first.",
        error: "USER_NOT_FOUND",
        email: validationResult.user.email,
      });
    }

    // Generate Firebase custom token for authentication
    // Both existing and new users need custom tokens for API authentication
    const tokenResult = await authService.generateFirebaseToken(
      firebaseUser.uid
    );

    if (!tokenResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate Firebase token",
        error: tokenResult.error,
      });
    }

    structuredLogger.logSuccess("auth_signin_oauth", {
      provider: provider,
      uid: firebaseUser.uid,
      email: validationResult.user.email,
      userId: signInResult.id,
      isNewUser: !existingFirebaseUser,
    });

    // Return user data with Firebase token (as expected by mobile)
    res.status(200).json({
      success: true,
      user: signInResult,
      firebaseToken: tokenResult.token,
      isNewUser: !existingFirebaseUser,
      message: existingFirebaseUser
        ? "OAuth sign-in successful"
        : "OAuth sign-up successful",
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_signin_oauth",
      provider: req.body.provider,
      error_classification: "oauth_signin_error",
    });

    res.status(500).json({
      success: false,
      message: "OAuth sign-in failed",
      error: error.message,
    });
  }
};

const signUpWithOAuth = async (req, res) => {
  try {
    const { provider, idToken, accessToken, userData } = req.body;

    if (!provider || (!idToken && !accessToken)) {
      return res.status(400).json({
        success: false,
        message: "Provider and either idToken or accessToken are required",
      });
    }

    structuredLogger.logOperationStart("auth_signup_oauth", {
      provider: provider,
      hasIdToken: !!idToken,
      hasAccessToken: !!accessToken,
      hasUserData: !!userData,
    });

    // Validate the OAuth token using the service
    const validationResult = await authService.validateOAuthToken(
      provider,
      idToken
    );

    if (!validationResult.success) {
      return res.status(401).json({
        success: false,
        message: "OAuth validation failed",
        error: validationResult.error,
      });
    }

    // Check if user already exists in Firebase
    let existingFirebaseUser;
    try {
      existingFirebaseUser = await admin
        .auth()
        .getUserByEmail(validationResult.user.email);
    } catch (error) {
      // User doesn't exist in Firebase - this is expected for sign up
      existingFirebaseUser = null;
    }

    // If user already exists in Firebase, check database
    if (existingFirebaseUser) {
      const User = (await import("../database/models/User.js")).default;
      const existingDbUser = await User.findOne({
        $or: [
          { authUid: existingFirebaseUser.uid },
          { emailHash: hashEmail(validationResult.user.email) },
        ],
      });

      if (existingDbUser) {
        // User already exists completely - return error
        return res.status(409).json({
          success: false,
          message: "User already exists. Please sign in instead.",
          error: "USER_ALREADY_EXISTS",
          email: validationResult.user.email,
        });
      }

      // User exists in Firebase but not in database - complete registration
      structuredLogger.logOperationStart(
        "auth_signup_oauth_complete_firebase_user",
        {
          email: validationResult.user.email,
          firebaseUid: existingFirebaseUser.uid,
        }
      );

      const userDataForSignUp = {
        email: validationResult.user.email,
        method: provider,
        firstName:
          userData?.firstName ||
          validationResult.user.displayName?.split(" ")[0] ||
          "User",
        lastName:
          userData?.lastName ||
          validationResult.user.displayName?.split(" ").slice(1).join(" ") ||
          "",
        photoUrl: userData?.photoUrl || validationResult.user.photoURL,
        authUid: existingFirebaseUser.uid,
        numAccounts: 0,
        role: userData?.role || "individual",
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      const signUpResult = await authService.signInOrCreate(
        existingFirebaseUser.uid,
        userDataForSignUp
      );

      // Generate Firebase custom token
      const tokenResult = await authService.generateFirebaseToken(
        existingFirebaseUser.uid
      );

      if (!tokenResult.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to generate Firebase token",
          error: tokenResult.error,
        });
      }

      structuredLogger.logSuccess("auth_signup_oauth_complete_firebase_user", {
        email: validationResult.user.email,
        userId: signUpResult.id,
        firebaseUid: existingFirebaseUser.uid,
      });

      return res.status(201).json({
        success: true,
        user: signUpResult,
        firebaseToken: tokenResult.token,
        isNewUser: true,
        message: "OAuth sign-up completed successfully",
      });
    }

    // User doesn't exist in Firebase - Create new user
    structuredLogger.logOperationStart("auth_signup_oauth_new_user", {
      email: validationResult.user.email,
    });

    // Create Firebase user
    const firebaseUserResult = await authService.createFirebaseUser(
      validationResult.user
    );

    if (!firebaseUserResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to create Firebase user",
        error: firebaseUserResult.error,
      });
    }

    const firebaseUser = firebaseUserResult.user;

    // Create user in database
    const userDataForSignUp = {
      email: validationResult.user.email,
      method: provider,
      firstName:
        userData?.firstName ||
        validationResult.user.displayName?.split(" ")[0] ||
        "User",
      lastName:
        userData?.lastName ||
        validationResult.user.displayName?.split(" ").slice(1).join(" ") ||
        "",
      photoUrl: userData?.photoUrl || validationResult.user.photoURL,
      authUid: firebaseUser.uid,
      numAccounts: 0,
      role: userData?.role || "individual",
      createdAt: new Date(),
      lastLoginAt: new Date(),
    };

    const signUpResult = await authService.signInOrCreate(
      firebaseUser.uid,
      userDataForSignUp
    );

    // Generate Firebase custom token
    const tokenResult = await authService.generateFirebaseToken(
      firebaseUser.uid
    );

    if (!tokenResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate Firebase token",
        error: tokenResult.error,
      });
    }

    structuredLogger.logSuccess("auth_signup_oauth_new_user", {
      email: validationResult.user.email,
      userId: signUpResult.id,
      firebaseUid: firebaseUser.uid,
      oauthProviderUID: validationResult.user.uid,
    });

    res.status(201).json({
      success: true,
      user: signUpResult,
      firebaseToken: tokenResult.token,
      isNewUser: true,
      message: "OAuth sign-up successful",
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "auth_signup_oauth",
      provider: req.body.provider,
      error_classification: "oauth_signup_error",
    });

    res.status(500).json({
      success: false,
      message: "OAuth sign-up failed",
      error: error.message,
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
  checkOAuthValidation,
  signInWithOAuth,
  signUpWithOAuth,
  testExistingUserLogin,
  testEncryptionConsistency,
};

export default authController;

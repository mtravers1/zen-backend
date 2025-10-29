import { Router } from "express";
import authController from "../controllers/auth.controller.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";
const router = Router();

router.post("/signup", authController.signUp);
router.post("/signin", authController.signIn);
router.post("/signin-oauth", authController.signInWithOAuth);
router.post("/signup-oauth", authController.signUpWithOAuth);
router.post("/check-email-firebase", authController.checkEmailFirebase);
router.post("/check-email", authController.checkEmail);
router.post("/check-oauth-validation", authController.checkOAuthValidation);
router.get("/own", authController.own);
router.post("/sendCode", authController.sendCode);
router.post("/verifyCode", authController.verifyCode);
router.post("/resetPassword", authController.resetPassword);
router.delete("/:uid", authController.deleteUser);
router.post(
  "/recover-encryption-keys/:uid",
  firebaseAuth,
  authController.recoverEncryptionKeys
);
router.get("/test", (req, res) => {
  const aiurl = process.env.AI_URL;
  const aimodel = process.env.AI_MODEL;
  const plaidredirect = process.env.PLAID_REDIRECT_URI;
  const plaidredirectnew = process.env.PLAID_REDIRECT_URI_NEW_ACCOUNTS;
  const groqModel = process.env.GROQ_AI_MODEL;
  const groqApiKey = process.env.GROQ_API_KEY;

  return res.status(200).json({
    aiurl,
    aimodel,
    plaidredirect,
    plaidredirectnew,
    groqModel,
    groqApiKey,
  });
});

// Test endpoint for existing users
router.post("/test-existing-user", authController.testExistingUserLogin);

// Test endpoint for encryption consistency
router.post(
  "/test-encryption-consistency",
  authController.testEncryptionConsistency
);

export default router;

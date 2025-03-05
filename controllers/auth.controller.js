import authService from "../services/auth.service.js";
import { emailValidation } from "../lib/mailer/mailer.js";

const own = async (req, res) => {
  const { email } = req.user;
  try {
    const user = await authService.own(email);
    res.status(200).send(user);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const signUp = async (req, res) => {
  const { data } = req.body;
  try {
    await authService.signUp(data);
    res.status(201).send({
      email: data.email,
      phone: data.phone,
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const signIn = async (req, res) => {
  const { email, password, method } = req.body;
  try {
    const user = await authService.signIn(email.toLowerCase());
    res.status(200).send(user);
  } catch (error) {
    if (error.message === "User not found") {
      return res.status(404).send(error.message);
    }
    res.status(500).send(error.message);
  }
};

const checkEmail = async (req, res) => {
  const { email, method } = req.body;

  try {
    const user = await authService.checkEmail(email, method);
    console.log(user);
    res.status(200).send(user);
  } catch (error) {
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
    const user = await authService.checkEmailFirebase(email);
    res.status(200).send(user);
  } catch (error) {
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
    await emailValidation(code, email);
    res.status(200).send({ code });
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const resetPassword = async (req, res) => {
  const { email, password } = req.body;
  try {
    await authService.changeUserPassword(email, password);
    res.status(200).send({ message: "Password reset email sent successfully" });
  } catch (error) {
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
};

export default authController;

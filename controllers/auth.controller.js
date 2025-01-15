import authService from "../services/auth.service.js";

const signUp = async (req, res) => {
  const { email, password, phone, role, method, authUid } = req.body;
  console.log(req.body);
  try {
    await authService.signUp(email, password, phone, role, method, authUid);
    res.status(201).send({
      email,
      phone,
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const signIn = async (req, res) => {
  const { email, password, method } = req.body;
  try {
    const user = await authService.signIn(
      email.toLowerCase(),
      password,
      method
    );
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

const authController = {
  signUp,
  signIn,
  checkEmail,
};

export default authController;

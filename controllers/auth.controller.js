import authService from '../services/auth.service.js';

const signUp = async (req, res) => {
    const { email, password, phone, role } = req.body;
    try {
      await authService.signUp(email, password, phone, role);
      res.status(201).send({
        email,
        phone,
      });
    } catch (error) {
      res.status(500).send(error.message);
    }
  };
  
  const signIn = async (req, res) => {
    const { email, password, firebaseToken } = req.body;
    try {
      await authService.signIn(email.toLowerCase(), password, firebaseToken);
      res.status(200).send({
        email,
        token: firebaseToken,
      });
    } catch (error) {
      if (error.message === "User not found") {
        return res.status(404).send(error.message);
      }
      res.status(500).send(error.message);
    }
  };

const authController ={
    signUp,
    signIn
}

export default authController;
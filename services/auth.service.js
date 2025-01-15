import User from "../database/models/User.js";
import { encryptPassword, comparePassword } from "../lib/encrypt.js";

const signUp = async (email, password, phone, role, method, authUid) => {
  try {
    const existingUser = await User.findOne({
      "email.email": email,
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    const emailSchema = {
      email,
      //TODO: add email type to the schema
      emailType: "personal",
      isPrimary: true,
    };

    if (method === "google" || method === "apple") {
      const user = new User({
        email: emailSchema,
        phone,
        role,
        signinMethod: method,
        authUid,
      });

      await user.save();

      return user;
    }

    const encryptedPassword = await encryptPassword(password);

    const user = new User({
      email: emailSchema,
      password: encryptedPassword,
      phone,
      role,
      signinMethod: method,
      authUid,
    });

    await user.save();
    console.log(user);

    return user;
  } catch (error) {
    console.log(error);
    throw new Error(error);
  }
};

const signIn = async (email, password, method) => {
  try {
    const user = await User.findOne({
      "email.email": email,
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.signinMethod !== method) {
      throw new Error("Invalid method");
    }

    const retrievedUser = {
      id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    if (method === "google" || method === "apple") {
      return retrievedUser;
    }

    const isMatch = await comparePassword(password, user.password);

    if (!isMatch) {
      throw new Error("Invalid password");
    }

    return retrievedUser;
  } catch (error) {
    console.log("error in signin", error);
    throw new Error(error);
  }
};

const checkEmail = async (email, method) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const signinMethod = user.signinMethod;
  if (signinMethod !== method) {
    throw new Error("Invalid method");
  }
  return user;
};

const authService = {
  signUp,
  signIn,
  checkEmail,
};

export default authService;

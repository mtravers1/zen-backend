import User from "../database/models/User.js";
import { encryptPassword, comparePassword } from "../lib/encrypt.js";

const own = async (email) => {
  const user = await User.findOne({
    "email.email": email,
  }).select("-password");
  return user;
};

const signUp = async (
  email,
  password,
  phone,
  role,
  method,
  authUid,
  photoUrl,
  firstName,
  lastName,
  prefix,
  suffix,
  middleName
) => {
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

    const nameSchema = {
      firstName,
      lastName,
      prefix,
      suffix,
      middleName,
    };

    if (method === "google" || method === "apple") {
      const user = new User({
        email: [emailSchema],
        phone,
        role,
        signinMethod: method,
        authUid,
        profilePhotoUrl: photoUrl,
        name: nameSchema,
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
      profilePhotoUrl: photoUrl,
      name: nameSchema,
    });

    await user.save();
    console.log(user);

    return user;
  } catch (error) {
    console.log("error in signup", error);

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

    const retrievedUser = {
      id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profilePhotoUrl: user.profilePhotoUrl,
      name: user.name,
    };

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
  return user;
};

const authService = {
  signUp,
  signIn,
  checkEmail,
  own,
};

export default authService;

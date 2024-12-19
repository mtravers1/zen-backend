import User from '../database/models/user.js';
import admin from 'firebase-admin';
import {encryptPassword, comparePassword} from '../lib/encrypt.js';


const signUp = async (email, password, phone, role) => {

  const existingUser = await User.findOne({
    email,
  });

  if (existingUser) {
    throw new Error("User already exists");
  }

  const encryptedPassword = await encryptPassword(password);

  const user = new User({
    email,
    password: encryptedPassword,
    phone,
    role,
  });

  await user.save();

  return user;
};

const signIn = async (email, password) => {
  const user = await User.findOne({
    email,
  });

  if (!user) {
    throw new Error("User not found");
  }

  const isMatch = await comparePassword(password, user.password);

  if (!isMatch) {
    throw new Error("Invalid password");
  }

  return user;
}

const authService = {
  signUp,
  signIn,
};

export default authService;

import { Schema, model } from "mongoose";

const userSchema = new Schema({
  role: {
    type: String,
    required: true,
    enum: ["business_owner", "individual"],
  },
  email: {
    type: String,
    required: true,
    trim: true,
    toLowerCase: true,
    unique: true,
  },
  phone: {
    type: String,
  },
  password: {
    type: String,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  signinMethod: {
    type: String,
    enum: ["email", "google", "apple"],
    default: "email",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = model("User", userSchema);

export default User;

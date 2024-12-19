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
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = model("User", userSchema);

export default User;

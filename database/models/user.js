import { Schema, model } from "mongoose";

const numAccountsSchema = new Schema({
  banking: {
    type: Number,
    default: 0,
  },
  credit: {
    type: Number,
    default: 0,
  },
  investment: {
    type: Number,
    default: 0,
  },
  loan: {
    type: Number,
    default: 0,
  },
  other: {
    type: Number,
    default: 0,
  },
});

const emailSchema = new Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    toLowerCase: true,
    unique: true,
  },
  emailType: {
    type: String,
    required: true,
    enum: ["personal", "work"],
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
});

const userSchema = new Schema({
  role: {
    type: String,
    required: true,
    enum: ["business_owner", "individual"],
  },
  email: emailSchema,
  authUid: {
    type: String,
    required: true,
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
  plaidAccounts: [
    {
      type: Schema.Types.ObjectId,
      ref: "PlaidAccount",
    },
  ],
  numAccounts: numAccountsSchema,
  profilePhotoUrl: {
    type: String,
  },
  dateOfBirth: {
    type: Date,
  },
  annualIncome: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
  },
  lastLoginAt: {
    type: Date,
  },
});

const User = model("User", userSchema);

export default User;

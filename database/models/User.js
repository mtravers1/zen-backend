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

//TODO: first and last name should be required but apple sign in does not provide this information always
const nameSchema = new Schema({
  prefix: {
    type: String,
  },
  firstName: {
    type: String,
  },
  middleName: {
    type: String,
  },
  lastName: {
    type: String,
  },
  suffix: {
    type: String,
  },
});

const phoneNumbersSchema = new Schema({
  phone: {
    type: String,
  },
  phoneType: {
    type: String,
  },
});

const addressSchema = new Schema({
  street: {
    type: String,
  },
  city: {
    type: String,
  },
  state: {
    type: String,
  },
  postalCode: {
    type: String,
  },
  country: {
    type: String,
  },
  type: {
    type: String,
  },
});

const userSchema = new Schema({
  role: {
    type: String,
    required: true,
    enum: ["business_owner", "individual"],
  },
  email: [emailSchema],
  emailHash: {
    type: String,
    required: true,
    unique: true, // Add unique constraint to prevent duplicate emails
  },
  // emailPermission: [emailSchema],
  authUid: {
    type: String,
    required: true,
    unique: true, // Add unique constraint to prevent duplicate Firebase UIDs
  },
  method: {
    type: String,
    required: true,
    enum: ["google", "apple", "email"],
    default: "email",
  },
  name: nameSchema,
  phones: [phoneNumbersSchema],
  deleted: {
    type: Boolean,
    default: false,
  },
  plaidAccounts: [
    {
      type: Schema.Types.ObjectId,
      ref: "PlaidAccount",
    },
  ],
  numAccounts: {
    type: Number,
  },
  profilePhotoUrl: {
    type: String,
  },
  dateOfBirth: {
    type: Date,
  },
  annualIncome: {
    type: String,
  },
  maritalStatus: {
    type: String,
    enum: [
      "single",
      "married",
      "divorced",
      "widowed",
      "domestic_partner",
      "other",
    ],
  },
  occupation: {
    type: String,
  },
  encryptedSSN: {
    type: String,
  },
  dependents: {
    type: Number,
  },
  address: [addressSchema],
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
  id_uuid: {
    type: String,
  },
  account_type: {
    type: String,
  },
});

const User = model("User", userSchema);

export default User;

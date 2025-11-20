import { Schema, model } from "mongoose";

const addressSchema = new Schema({
  name: { type: String, default: null },
  street: { type: String, default: null },
  city: { type: String, default: null },
  state: { type: String, default: null },
  postalCode: { type: String, default: null },
  country: { type: String, default: null },
  addressLine1: { type: String, default: null },
  addressLine2: { type: String, default: null },
  type: { type: String, default: null },
});

const phoneNumberSchema = new Schema({
  phone: { type: String, default: null },
  phoneType: { type: String, default: null },
});

const businessOwnershipSchema = new Schema({
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  percentage: String,
});

const businessOwnersDetailsSchema = new Schema([
  {
    name: { type: String, default: null },
    percentOwned: { type: String, default: null },
    email: { type: String, default: null },
    position: { type: String, default: null },
  },
]);

const businessSchema = new Schema({
  userId: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
  name: {
    type: String,
    required: true,
  },
  legalName: {
    type: String,
  },
  encryptedEin: {
    type: String,
  },
  businessLogo: String,
  numAccounts: Number,
  businessDesc: String,
  businessDescription: {
    type: String,
    default: null,
  },
  businessCode: Number,
  entityType: String,
  businessType: {
    type: String,
    default: null,
  },
  addresses: [addressSchema],
  website: String,
  phoneNumbers: [phoneNumberSchema],
  industryDesc: String,
  plaidAccountIds: [{ type: Schema.Types.ObjectId, ref: "PlaidAccount" }],
  documentIds: [{ type: Schema.Types.ObjectId, ref: "Document" }],
  goalIds: [{ type: Schema.Types.ObjectId, ref: "Goal" }],
  subsidiaries: [String],
  businessLocations: [addressSchema],
  accountingInfo: Schema.Types.Mixed,
  fiscalYearStart: String,
  taxInformation: Schema.Types.Mixed,
  payrollDetails: Schema.Types.Mixed,
  formationDate: Date,
  businessHours: [String],
  ownership: businessOwnershipSchema,
  businessOwners: [String],
  businessOwnersDetails: [businessOwnersDetailsSchema],
  timezone: String,
  color: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date,
});

const Business = model("Business", businessSchema);

export default Business;

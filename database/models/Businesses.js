import { Schema, model } from "mongoose";

const addressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
  type: String,
});

const phoneNumberSchema = new Schema({
  phone: String,
  phoneType: String,
});

const businessOwnershipSchema = new Schema({
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  percentage: Number,
});

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
  businessCode: Number,
  entityType: String,
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

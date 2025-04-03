import { model, Schema } from "mongoose";

const plaidAccountSchema = new Schema({
  owner_id: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  itemId: {
    type: String,
    required: true,
  },
  accessToken: {
    type: Buffer,
    required: true,
  },
  isAccessTokenExpired: {
    type: Boolean,
    default: false,
  },
  owner_type: {
    type: String,
    enum: ["business_owner", "individual"],
    required: true,
  },
  plaid_account_id: {
    type: String,
    required: true,
  },
  account_name: {
    type: Buffer,
    required: true,
  },
  account_official_name: {
    type: Buffer,
  },
  account_type: {
    type: Buffer,
    required: true,
  },
  account_subtype: {
    type: Buffer,
    required: true,
  },
  institution_name: {
    type: Buffer,
  },
  institution_id: {
    type: String,
    required: true,
  },
  image_url: {
    type: String,
  },
  currentBalance: {
    type: Buffer,
  },
  availableBalance: {
    type: Buffer,
  },
  currency: {
    type: String,
    required: true,
  },
  mask: {
    type: Buffer,
  },
  transactions: [
    {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    },
  ],
  nextCursor: {
    type: String,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
  },
});

const PlaidAccount = model("PlaidAccount", plaidAccountSchema);

export default PlaidAccount;

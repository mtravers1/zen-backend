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
    type: String,
    required: true,
  },
  account_official_name: {
    type: String,
  },
  account_type: {
    type: String,
    required: true,
  },
  account_subtype: {
    type: String,
    required: true,
  },
  institution_name: {
    type: String,
  },
  institution_id: {
    type: String,
    required: true,
  },
  hashAccountInstitutionId: {
    type: String,
    required: true,
  },
  hashAccountName: {
    type: String,
    required: true,
  },
  hashAccountMask: {
    type: String,
    required: true,
  },
  image_url: {
    type: String,
  },
  currentBalance: {
    type: String,
  },
  availableBalance: {
    type: String,
  },
  currency: {
    type: String,
    required: true,
  },
  mask: {
    type: String,
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
  status: {
    type: String,
    enum: ['good', 'bad', 'login_required'],
    default: 'good',
  },
      updated_at: {
        type: Date,
      },
      deletedAt: {
        type: Date,
        default: null,
      },});

const PlaidAccount = model("PlaidAccount", plaidAccountSchema);

export default PlaidAccount;

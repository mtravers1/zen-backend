import { model, Schema } from "mongoose";

export const merchantSchema = new Schema({
  merchantName: {
    type: Buffer,
  },
  name: {
    type: Buffer,
  },
  merchantCategory: {
    type: String,
  },
  website: {
    type: String,
  },
  logo: {
    type: String,
  },
});

const transactionSchema = new Schema({
  plaidTransactionId: {
    type: String,
    required: true,
  },
  plaidAccountId: {
    type: String,
    required: true,
  },
  accountType: {
    type: Buffer,
  },
  transactionDate: {
    type: Date,
    required: true,
  },
  amount: {
    type: Buffer,
    required: true,
  },
  currency: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
  },
  merchant: {
    type: merchantSchema,
  },
  description: {
    type: String,
  },
  transactionCode: {
    type: Buffer,
  },
  isInternal: {
    type: Boolean,
    default: false,
  },
  tags: {
    type: [String],
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
  },

  //fields only for investment transactions
  name: {
    type: Buffer,
  },
  fees: {
    type: Buffer,
  },
  price: {
    type: Buffer,
  },
  type: {
    type: Buffer,
  },
  subtype: {
    type: Buffer,
  },
  quantity: {
    type: Buffer,
  },
  securityId: {
    type: Buffer,
  },
  isInvestment: {
    type: Boolean,
    default: false,
  },
});

const Transaction = model("Transaction", transactionSchema);

export default Transaction;

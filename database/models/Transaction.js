import { model, Schema } from "mongoose";

export const merchantSchema = new Schema({
  merchantName: {
    type: String,
  },
  name: {
    type: String,
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
  transactionDate: {
    type: Date,
    required: true,
  },
  amount: {
    type: Number,
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
    type: Number,
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
});

const Transaction = model("Transaction", transactionSchema);

export default Transaction;

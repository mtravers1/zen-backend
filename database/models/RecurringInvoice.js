import { Schema, Types, model } from "mongoose";

const recurringInvoiceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive", "paused"], default: "active" },
    paymentMethod: {
      type: String,
      enum: ["Credit Card", "ACH", "Wire", "Check", "Cash", "Other"],
      default: "ACH",
    },
    amount: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    frequency: {
      type: String,
      enum: ["weekly", "biweekly", "monthly", "quarterly", "annually"],
      default: "monthly",
    },
    nextBilling: { type: Date },
    lastBilled: { type: Date },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

recurringInvoiceSchema.index({ clientId: 1 });
recurringInvoiceSchema.index({ status: 1 });

const RecurringInvoice = model("RecurringInvoice", recurringInvoiceSchema);
export default RecurringInvoice;

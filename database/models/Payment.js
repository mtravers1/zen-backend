import { Schema, Types, model } from "mongoose";

const paymentSchema = new Schema(
  {
    paymentNumber: { type: String, unique: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    invoiceId: { type: Types.ObjectId, ref: "Invoice" },
    invoiceNumber: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["completed", "pending", "refunded", "failed"],
      default: "pending",
    },
    amount: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ["Credit Card", "ACH", "Wire", "Check", "Cash", "Other"],
      default: "ACH",
    },
    notes: { type: String },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

paymentSchema.index({ clientId: 1 });
paymentSchema.index({ status: 1 });

const Payment = model("FirmPayment", paymentSchema);
export default Payment;

import { Schema, model } from "mongoose";

const paymentSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: "Invoice",
  },
  recordedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Payment details
  amount: { type: Number, required: true },
  currency: { type: String, default: "USD" },
  paymentDate: { type: Date, default: Date.now },
  method: {
    type: String,
    enum: ["cash", "check", "bank_transfer", "credit_card", "ach", "stripe", "paypal", "other"],
    default: "bank_transfer",
  },
  reference: { type: String },
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded", "partial_refund"],
    default: "completed",
  },
  notes: { type: String },
  // Stripe / payment processor
  processorTransactionId: { type: String },
  processorFee: { type: Number, default: 0 },
  netAmount: { type: Number },
}, {
  timestamps: true,
});

paymentSchema.index({ status: 1, firmId: 1 });
paymentSchema.index({ paymentDate: -1 });

const Payment = model("Payment", paymentSchema);
export default Payment;

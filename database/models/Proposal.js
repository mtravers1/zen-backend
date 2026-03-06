import { Schema, model } from "mongoose";

const lineItemSchema = new Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, required: true },
  amount: { type: Number, required: true },
  optional: { type: Boolean, default: false },
});

const proposalSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: "Client",
  },
  contactId: {
    type: Schema.Types.ObjectId,
    ref: "Contact",
  },
  leadId: {
    type: Schema.Types.ObjectId,
    ref: "Lead",
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Proposal identity
  proposalNumber: { type: String, required: true },
  title: { type: String, required: true },
  status: {
    type: String,
    enum: ["draft", "sent", "viewed", "accepted", "rejected", "expired"],
    default: "draft",
  },
  // Dates
  issueDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  acceptedAt: { type: Date },
  // Content
  coverLetter: { type: String },
  lineItems: [lineItemSchema],
  terms: { type: String },
  notes: { type: String },
  // Financials
  subtotal: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  currency: { type: String, default: "USD" },
  // Signature
  requiresSignature: { type: Boolean, default: false },
  signedAt: { type: Date },
  signatureData: { type: String },
  // Conversion
  convertedToInvoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
}, {
  timestamps: true,
});

proposalSchema.index({ proposalNumber: 1, firmId: 1 }, { unique: true });
proposalSchema.index({ status: 1, firmId: 1 });

const Proposal = model("Proposal", proposalSchema);
export default Proposal;

import { Schema, model } from "mongoose";

const lineItemSchema = new Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, required: true },
  amount: { type: Number, required: true },
  taxable: { type: Boolean, default: true },
  serviceId: { type: Schema.Types.ObjectId, ref: "Service" },
});

const invoiceSchema = new Schema({
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
  contactId: {
    type: Schema.Types.ObjectId,
    ref: "Contact",
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Invoice number
  invoiceNumber: { type: String, required: true },
  // Status
  status: {
    type: String,
    enum: ["draft", "sent", "viewed", "partial", "paid", "overdue", "void", "cancelled"],
    default: "draft",
  },
  // Dates
  issueDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  paidDate: { type: Date },
  // Line items
  lineItems: [lineItemSchema],
  // Financials
  subtotal: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountType: { type: String, enum: ["percent", "fixed"], default: "fixed" },
  discountValue: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  amountDue: { type: Number, default: 0 },
  currency: { type: String, default: "USD" },
  // Payment terms
  paymentTerms: { type: String },
  paymentInstructions: { type: String },
  // Notes
  notes: { type: String },
  internalNotes: { type: String },
  // Recurring
  isRecurring: { type: Boolean, default: false },
  recurringId: { type: Schema.Types.ObjectId, ref: "RecurringInvoice" },
  // Job/Proposal link
  jobId: { type: Schema.Types.ObjectId, ref: "Job" },
  proposalId: { type: Schema.Types.ObjectId, ref: "Proposal" },
}, {
  timestamps: true,
});

invoiceSchema.index({ invoiceNumber: 1, firmId: 1 }, { unique: true });
invoiceSchema.index({ status: 1, firmId: 1 });
invoiceSchema.index({ dueDate: 1 });

const Invoice = model("Invoice", invoiceSchema);
export default Invoice;

import { Schema, model } from "mongoose";

const lineItemSchema = new Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, required: true },
  amount: { type: Number, required: true },
});

const recurringInvoiceSchema = new Schema({
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
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Template details
  title: { type: String },
  lineItems: [lineItemSchema],
  subtotal: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  currency: { type: String, default: "USD" },
  notes: { type: String },
  paymentTerms: { type: String },
  // Recurrence schedule
  frequency: {
    type: String,
    enum: ["weekly", "biweekly", "monthly", "quarterly", "annually"],
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  nextInvoiceDate: { type: Date },
  lastInvoiceDate: { type: Date },
  // Status
  status: {
    type: String,
    enum: ["active", "paused", "completed", "cancelled"],
    default: "active",
  },
  // Generated invoices
  generatedInvoices: [{ type: Schema.Types.ObjectId, ref: "Invoice" }],
  invoiceCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

recurringInvoiceSchema.index({ status: 1, nextInvoiceDate: 1 });

const RecurringInvoice = model("RecurringInvoice", recurringInvoiceSchema);
export default RecurringInvoice;

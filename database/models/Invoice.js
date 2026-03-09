import { Schema, Types, model } from "mongoose";

const lineItemSchema = new Schema({
  description: { type: String },
  quantity: { type: Number, default: 1 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
});

const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, unique: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },       // denormalized for display
    assignee: { type: String, trim: true },
    status: {
      type: String,
      enum: ["paid", "unpaid", "overdue", "draft", "void"],
      default: "unpaid",
    },
    postedDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    total: { type: Number, default: 0 },             // in dollars
    lineItems: [lineItemSchema],
    notes: { type: String },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

invoiceSchema.index({ status: 1 });
invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ invoiceNumber: 1 });

const Invoice = model("Invoice", invoiceSchema);
export default Invoice;

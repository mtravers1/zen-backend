import { Schema, model } from "mongoose";

const clientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["Business", "Individual"], default: "Business" },
    assignee: { type: String, trim: true },        // staff member name or userId
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    balance: { type: Number, default: 0 },         // outstanding balance in cents
    notes: { type: String },
    deleted: { type: Boolean, default: false },
    createdById: { type: String },
  },
  { timestamps: true }
);

clientSchema.index({ name: 1 });
clientSchema.index({ status: 1 });

const Client = model("Client", clientSchema);
export default Client;

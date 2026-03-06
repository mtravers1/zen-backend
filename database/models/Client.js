import { Schema, model } from "mongoose";

const addressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
  type: { type: String, default: "business" },
});

const clientSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Entity info
  type: {
    type: String,
    enum: ["individual", "business", "trust", "estate", "other"],
    default: "individual",
  },
  // For individual
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  // For business
  companyName: { type: String, trim: true },
  entityType: { type: String, trim: true },
  ein: { type: String },
  // Contact
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  website: { type: String, trim: true },
  // Address
  address: addressSchema,
  // Status
  status: {
    type: String,
    enum: ["active", "inactive", "prospect", "former"],
    default: "active",
  },
  // Billing
  billingRate: { type: Number },
  currency: { type: String, default: "USD" },
  paymentTerms: { type: String, default: "net30" },
  // Services / engagement
  services: [{ type: String }],
  engagementStartDate: { type: Date },
  engagementEndDate: { type: Date },
  // Tags and notes
  tags: [{ type: String }],
  notes: { type: String },
  // Portal
  portalEnabled: { type: Boolean, default: false },
  // Source
  referredBy: { type: String },
  source: { type: String },
  // Custom fields
  customFields: { type: Map, of: Schema.Types.Mixed },
  // Relations
  contacts: [{ type: Schema.Types.ObjectId, ref: "Contact" }],
}, {
  timestamps: true,
});

clientSchema.index({ status: 1, firmId: 1 });
clientSchema.index({ email: 1, firmId: 1 });

const Client = model("Client", clientSchema);
export default Client;

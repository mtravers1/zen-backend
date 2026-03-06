import { Schema, model } from "mongoose";

const addressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
  type: { type: String, enum: ["home", "work", "other"], default: "work" },
});

const contactSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: "Client",
    index: true,
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Identity
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  mobile: { type: String, trim: true },
  jobTitle: { type: String, trim: true },
  company: { type: String, trim: true },
  // Address
  address: addressSchema,
  // Contact details
  type: {
    type: String,
    enum: ["primary", "secondary", "billing", "other"],
    default: "primary",
  },
  status: {
    type: String,
    enum: ["active", "inactive", "prospect"],
    default: "active",
  },
  tags: [{ type: String }],
  notes: { type: String },
  // Portal access
  portalAccess: { type: Boolean, default: false },
  portalEmail: { type: String, trim: true, lowercase: true },
  // Source tracking
  source: { type: String },
  leadId: { type: Schema.Types.ObjectId, ref: "Lead" },
  // Custom fields
  customFields: { type: Map, of: Schema.Types.Mixed },
}, {
  timestamps: true,
});

contactSchema.index({ email: 1, firmId: 1 });
contactSchema.index({ lastName: 1, firstName: 1 });

const Contact = model("Contact", contactSchema);
export default Contact;

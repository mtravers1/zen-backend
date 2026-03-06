import { Schema, model } from "mongoose";

const leadSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    index: true,
  },
  // CRM owner (staff member)
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Lead identity
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  company: { type: String, trim: true },
  message: { type: String },
  serviceInterest: { type: String, trim: true },
  // Lead metadata
  source: {
    type: String,
    enum: ["website", "referral", "social", "email", "phone", "event", "other"],
    default: "website",
  },
  status: {
    type: String,
    enum: ["new", "contacted", "qualified", "converted", "lost"],
    default: "new",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium",
  },
  budget: { type: String },
  notes: { type: String },
  tags: [{ type: String }],
  // Salesforce integration
  salesforceId: { type: String },
  // Conversion tracking
  convertedToContactId: {
    type: Schema.Types.ObjectId,
    ref: "Contact",
  },
  convertedAt: { type: Date },
  // Activity timestamps
  lastContactedAt: { type: Date },
  followUpAt: { type: Date },
}, {
  timestamps: true,
});

leadSchema.index({ status: 1, firmId: 1 });
leadSchema.index({ email: 1, firmId: 1 });

const Lead = model("Lead", leadSchema);
export default Lead;

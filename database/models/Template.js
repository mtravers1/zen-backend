import { Schema, model } from "mongoose";

const templateSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    index: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Template identity
  name: { type: String, required: true },
  description: { type: String },
  type: {
    type: String,
    enum: ["invoice", "proposal", "email", "document", "task", "job", "checklist"],
    required: true,
  },
  // Template content
  content: { type: Schema.Types.Mixed },
  // For invoice/proposal templates
  lineItems: [{ type: Schema.Types.Mixed }],
  notes: { type: String },
  terms: { type: String },
  // Visibility
  isGlobal: { type: Boolean, default: false }, // marketplace
  isActive: { type: Boolean, default: true },
  // Usage stats
  usageCount: { type: Number, default: 0 },
  // Tags
  tags: [{ type: String }],
  category: { type: String },
}, {
  timestamps: true,
});

const Template = model("Template", templateSchema);
export default Template;

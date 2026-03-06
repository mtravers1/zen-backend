import { Schema, model } from "mongoose";

const documentSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Associations
  clientId: { type: Schema.Types.ObjectId, ref: "Client" },
  jobId: { type: Schema.Types.ObjectId, ref: "Job" },
  contactId: { type: Schema.Types.ObjectId, ref: "Contact" },
  // Document details
  name: { type: String, required: true },
  originalName: { type: String },
  description: { type: String },
  type: {
    type: String,
    enum: ["tax_return", "financial_statement", "contract", "id", "organizer", "report", "other"],
    default: "other",
  },
  // File info
  fileUrl: { type: String },
  storagePath: { type: String },
  mimeType: { type: String },
  size: { type: Number },
  // Visibility
  visibility: {
    type: String,
    enum: ["firm", "client", "private"],
    default: "firm",
  },
  // Status
  status: {
    type: String,
    enum: ["active", "archived", "deleted"],
    default: "active",
  },
  // Signing
  requiresSignature: { type: Boolean, default: false },
  signedAt: { type: Date },
  signedBy: { type: Schema.Types.ObjectId, ref: "User" },
  // Versioning
  version: { type: Number, default: 1 },
  parentDocumentId: { type: Schema.Types.ObjectId, ref: "Document" },
  // Organizer
  isOrganizer: { type: Boolean, default: false },
  organizerYear: { type: Number },
  organizerStatus: {
    type: String,
    enum: ["pending", "in_progress", "submitted", "approved"],
  },
  // Tags
  tags: [{ type: String }],
  // Custom fields
  customFields: { type: Map, of: Schema.Types.Mixed },
}, {
  timestamps: true,
});

documentSchema.index({ firmId: 1, type: 1 });
documentSchema.index({ clientId: 1 });

const Document = model("Document", documentSchema);
export default Document;

import { Schema, Types, model } from "mongoose";

const documentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    type: {
      type: String,
      enum: ["folder", "document"],
      default: "document",
    },
    docType: { type: String, trim: true },            // e.g. "Tax Return", "Invoice"
    fileUrl: { type: String, trim: true },
    fileName: { type: String, trim: true },
    size: { type: Number, default: 0 },               // bytes
    folder: { type: String, trim: true, default: "General" },
    scope: {
      type: String,
      enum: ["client", "internal", "organizer"],
      default: "client",
    },
    uploadedById: { type: String, trim: true },
    uploadedByName: { type: String, trim: true },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

documentSchema.index({ clientId: 1 });
documentSchema.index({ scope: 1 });
documentSchema.index({ folder: 1 });

const Document = model("FirmDocument", documentSchema);
export default Document;

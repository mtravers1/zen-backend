import { Schema, model } from "mongoose";

const documentSchema = new Schema(
  {
    firmId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    // Identity
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "Tax Return",
        "Financial Statement",
        "Contract",
        "Invoice",
        "Report",
        "Organizer",
        "Other",
      ],
      required: true,
    },

    // Storage
    fileUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number, // bytes
      default: 0,
    },
    mimeType: {
      type: String,
      default: null,
    },

    // Organisation
    folder: {
      type: String,
      default: "General",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    description: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({ firmId: 1, clientId: 1, status: 1 });
documentSchema.index({ name: "text", tags: "text" });

const Document = model("Document", documentSchema);

export default Document;

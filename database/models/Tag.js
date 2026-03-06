import { Schema, model } from "mongoose";

const tagSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  name: { type: String, required: true },
  color: { type: String, default: "#6366f1" },
  // Applies to which entity types
  appliesTo: [{
    type: String,
    enum: ["lead", "contact", "client", "job", "task", "document"],
  }],
  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

tagSchema.index({ firmId: 1, name: 1 }, { unique: true });

const Tag = model("Tag", tagSchema);
export default Tag;

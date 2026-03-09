import { Schema, model } from "mongoose";

const reportSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    verified: { type: Boolean, default: false },
    tags: [{ type: String, trim: true }],
    author: { type: String, trim: true },
    lastViewed: { type: Date },
    content: { type: Schema.Types.Mixed },          // flexible report data/config
    reportType: {
      type: String,
      enum: ["revenue", "clients", "team", "billing", "workflow", "custom"],
      default: "custom",
    },
    deleted: { type: Boolean, default: false },
    createdById: { type: String },
  },
  { timestamps: true }
);

reportSchema.index({ name: 1 });
reportSchema.index({ reportType: 1 });

const Report = model("Report", reportSchema);
export default Report;

import { Schema, model } from "mongoose";

const pipelineStageSchema = new Schema({
  name: { type: String, required: true },
  color: { type: String, default: "#6366f1" },
  position: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  isCancelled: { type: Boolean, default: false },
  automations: [{ type: String }],
});

const pipelineSchema = new Schema({
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
  description: { type: String },
  type: {
    type: String,
    enum: ["job", "lead", "project", "custom"],
    default: "job",
  },
  stages: [pipelineStageSchema],
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  color: { type: String, default: "#6366f1" },
}, {
  timestamps: true,
});

const Pipeline = model("Pipeline", pipelineSchema);
export default Pipeline;

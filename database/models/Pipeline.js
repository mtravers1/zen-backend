import { Schema, model } from "mongoose";

const stageSchema = new Schema({
  name: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  color: { type: String, trim: true },
});

const pipelineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    numJobs: { type: Number, default: 0 },
    stages: [stageSchema],
    isDefault: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    createdById: { type: String },
  },
  { timestamps: true }
);

pipelineSchema.index({ name: 1 });

const Pipeline = model("Pipeline", pipelineSchema);
export default Pipeline;

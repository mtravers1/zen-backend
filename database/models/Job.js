import { Schema, Types, model } from "mongoose";

const jobSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    assignee: { type: String, trim: true },
    pipelineId: { type: Types.ObjectId, ref: "Pipeline" },
    pipelineName: { type: String, trim: true },
    stage: { type: String, trim: true },
    priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    status: { type: String, enum: ["open", "in_progress", "completed", "cancelled"], default: "open" },
    clientStatus: {
      type: String,
      enum: ["Awaiting Info", "In Progress", "On Track", "Completed", "On Hold"],
      default: "In Progress",
    },
    startDate: { type: Date },
    dueDate: { type: Date },
    description: { type: String },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

jobSchema.index({ clientId: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ pipelineId: 1 });

const Job = model("Job", jobSchema);
export default Job;

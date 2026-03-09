import { Schema, Types, model } from "mongoose";

const taskSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    jobId: { type: Types.ObjectId, ref: "Job" },
    assignee: { type: String, trim: true },
    priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    status: { type: String, enum: ["open", "in_progress", "completed", "cancelled"], default: "open" },
    dueDate: { type: Date },
    description: { type: String },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

taskSchema.index({ clientId: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ assignee: 1 });

const Task = model("Task", taskSchema);
export default Task;

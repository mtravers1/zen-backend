import { Schema, model } from "mongoose";

const taskSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  jobId: {
    type: Schema.Types.ObjectId,
    ref: "Job",
    index: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: "Client",
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Task details
  title: { type: String, required: true },
  description: { type: String },
  status: {
    type: String,
    enum: ["todo", "in_progress", "blocked", "review", "done", "cancelled"],
    default: "todo",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  // Scheduling
  dueDate: { type: Date },
  startDate: { type: Date },
  completedAt: { type: Date },
  estimatedHours: { type: Number },
  actualHours: { type: Number },
  // Pipeline / kanban
  pipelineId: { type: Schema.Types.ObjectId, ref: "Pipeline" },
  pipelineStageId: { type: Schema.Types.ObjectId },
  position: { type: Number, default: 0 },
  // Metadata
  tags: [{ type: String }],
  attachments: [{ type: Schema.Types.ObjectId, ref: "Files" }],
  // Checklist
  checklist: [{
    text: { type: String },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
  }],
  // Recurrence
  isRecurring: { type: Boolean, default: false },
  recurrenceId: { type: Schema.Types.ObjectId, ref: "JobRecurrence" },
}, {
  timestamps: true,
});

taskSchema.index({ status: 1, firmId: 1 });
taskSchema.index({ assignedTo: 1, dueDate: 1 });

const Task = model("Task", taskSchema);
export default Task;

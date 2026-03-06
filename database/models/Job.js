import { Schema, model } from "mongoose";

const jobSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: "Client",
  },
  assignedTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Job details
  title: { type: String, required: true },
  description: { type: String },
  jobNumber: { type: String },
  type: { type: String },
  status: {
    type: String,
    enum: ["not_started", "in_progress", "on_hold", "review", "completed", "cancelled"],
    default: "not_started",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  // Dates
  startDate: { type: Date },
  dueDate: { type: Date },
  completedAt: { type: Date },
  // Pipeline
  pipelineId: { type: Schema.Types.ObjectId, ref: "Pipeline" },
  pipelineStageId: { type: Schema.Types.ObjectId },
  // Budget / billing
  estimatedHours: { type: Number },
  actualHours: { type: Number },
  budgetAmount: { type: Number },
  billingType: {
    type: String,
    enum: ["fixed", "hourly", "retainer"],
    default: "fixed",
  },
  hourlyRate: { type: Number },
  // Relations
  tasks: [{ type: Schema.Types.ObjectId, ref: "Task" }],
  invoices: [{ type: Schema.Types.ObjectId, ref: "Invoice" }],
  documents: [{ type: Schema.Types.ObjectId, ref: "Files" }],
  // Tags and notes
  tags: [{ type: String }],
  notes: { type: String },
  // Recurrence
  isRecurring: { type: Boolean, default: false },
  recurrenceId: { type: Schema.Types.ObjectId, ref: "JobRecurrence" },
  // Custom fields
  customFields: { type: Map, of: Schema.Types.Mixed },
}, {
  timestamps: true,
});

jobSchema.index({ status: 1, firmId: 1 });
jobSchema.index({ dueDate: 1 });

const Job = model("Job", jobSchema);
export default Job;

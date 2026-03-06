import { Schema, model } from "mongoose";

const jobRecurrenceSchema = new Schema({
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
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  // Template
  title: { type: String, required: true },
  description: { type: String },
  jobType: { type: String },
  assignedTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
  // Schedule
  frequency: {
    type: String,
    enum: ["daily", "weekly", "biweekly", "monthly", "quarterly", "annually", "custom"],
    required: true,
  },
  customDays: [{ type: Number }], // 0=Sun, 6=Sat for weekly
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  nextDueDate: { type: Date },
  lastCreatedDate: { type: Date },
  // Duration
  estimatedHours: { type: Number },
  dueDaysAfterStart: { type: Number, default: 7 },
  // Status
  status: {
    type: String,
    enum: ["active", "paused", "completed", "cancelled"],
    default: "active",
  },
  // Generated jobs
  generatedJobs: [{ type: Schema.Types.ObjectId, ref: "Job" }],
  jobCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

const JobRecurrence = model("JobRecurrence", jobRecurrenceSchema);
export default JobRecurrence;

import { Schema, model } from "mongoose";

const timeEntrySchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: "Client",
  },
  jobId: {
    type: Schema.Types.ObjectId,
    ref: "Job",
  },
  taskId: {
    type: Schema.Types.ObjectId,
    ref: "Task",
  },
  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: "Invoice",
  },
  // Time tracking
  description: { type: String },
  date: { type: Date, required: true, default: Date.now },
  startTime: { type: Date },
  endTime: { type: Date },
  durationMinutes: { type: Number, required: true },
  // Billing
  billable: { type: Boolean, default: true },
  billed: { type: Boolean, default: false },
  hourlyRate: { type: Number },
  amount: { type: Number },
  // Status
  status: {
    type: String,
    enum: ["draft", "submitted", "approved", "rejected", "invoiced"],
    default: "draft",
  },
}, {
  timestamps: true,
});

timeEntrySchema.index({ userId: 1, date: -1 });
timeEntrySchema.index({ clientId: 1, billed: 1 });

const TimeEntry = model("TimeEntry", timeEntrySchema);
export default TimeEntry;

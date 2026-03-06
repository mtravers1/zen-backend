import { Schema, model } from "mongoose";

const reportSchema = new Schema({
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
  // Report identity
  name: { type: String, required: true },
  description: { type: String },
  type: {
    type: String,
    enum: [
      "revenue", "outstanding_invoices", "payments", "client_summary",
      "lead_funnel", "time_tracking", "job_status", "team_performance",
      "custom",
    ],
    required: true,
  },
  // Configuration
  config: {
    dateRange: {
      type: { type: String, enum: ["last_7d", "last_30d", "last_90d", "ytd", "custom"] },
      startDate: Date,
      endDate: Date,
    },
    filters: { type: Schema.Types.Mixed },
    groupBy: { type: String },
    metrics: [{ type: String }],
    columns: [{ type: String }],
  },
  // Scheduling
  isScheduled: { type: Boolean, default: false },
  scheduleFrequency: {
    type: String,
    enum: ["daily", "weekly", "monthly"],
  },
  scheduleRecipients: [{ type: String }],
  lastRunAt: { type: Date },
  nextRunAt: { type: Date },
  // Visibility
  isShared: { type: Boolean, default: false },
  sharedWith: [{ type: Schema.Types.ObjectId, ref: "User" }],
}, {
  timestamps: true,
});

const Report = model("Report", reportSchema);
export default Report;

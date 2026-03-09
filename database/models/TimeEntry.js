import { Schema, Types, model } from "mongoose";

const timeEntrySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    assignee: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ["Billable", "Non-billable"], default: "Billable" },
    service: { type: String, trim: true },
    duration: { type: String, trim: true },          // e.g. "1:30"
    durationMinutes: { type: Number, default: 0 },
    timerStatus: { type: String, enum: ["idle", "running", "paused"], default: "idle" },
    billed: { type: Boolean, default: false },
    invoiceId: { type: Types.ObjectId, ref: "Invoice" },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

timeEntrySchema.index({ clientId: 1 });
timeEntrySchema.index({ billed: 1 });

const TimeEntry = model("TimeEntry", timeEntrySchema);
export default TimeEntry;

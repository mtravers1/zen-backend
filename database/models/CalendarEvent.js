import { Schema, model } from "mongoose";

const calendarEventSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  attendees: [{ type: Schema.Types.ObjectId, ref: "User" }],
  clientId: { type: Schema.Types.ObjectId, ref: "Client" },
  jobId: { type: Schema.Types.ObjectId, ref: "Job" },
  taskId: { type: Schema.Types.ObjectId, ref: "Task" },
  // Event details
  title: { type: String, required: true },
  description: { type: String },
  location: { type: String },
  type: {
    type: String,
    enum: ["meeting", "deadline", "reminder", "task", "appointment", "other"],
    default: "meeting",
  },
  // Timing
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  allDay: { type: Boolean, default: false },
  timezone: { type: String, default: "UTC" },
  // Recurrence
  isRecurring: { type: Boolean, default: false },
  recurrenceRule: { type: String },
  recurrenceEndDate: { type: Date },
  // Status
  status: {
    type: String,
    enum: ["confirmed", "tentative", "cancelled"],
    default: "confirmed",
  },
  color: { type: String },
  // Reminders
  reminders: [{
    type: { type: String, enum: ["email", "push", "sms"] },
    minutesBefore: { type: Number },
  }],
  // External calendar sync
  googleEventId: { type: String },
  outlookEventId: { type: String },
}, {
  timestamps: true,
});

calendarEventSchema.index({ firmId: 1, startAt: 1 });
calendarEventSchema.index({ attendees: 1, startAt: 1 });

const CalendarEvent = model("CalendarEvent", calendarEventSchema);
export default CalendarEvent;

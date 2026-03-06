import { Schema, model } from "mongoose";

const alertSchema = new Schema({
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
  name: { type: String, required: true },
  description: { type: String },
  // Trigger conditions
  trigger: {
    type: {
      type: String,
      enum: [
        "invoice_overdue", "payment_received", "lead_new",
        "task_due", "job_deadline", "revenue_threshold",
        "client_inactive", "custom",
      ],
      required: true,
    },
    conditions: { type: Schema.Types.Mixed },
  },
  // Alert actions
  actions: [{
    type: { type: String, enum: ["email", "push", "in_app", "webhook"] },
    config: { type: Schema.Types.Mixed },
  }],
  recipients: [{ type: Schema.Types.ObjectId, ref: "User" }],
  // Status
  isActive: { type: Boolean, default: true },
  lastTriggeredAt: { type: Date },
  triggerCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

const Alert = model("Alert", alertSchema);
export default Alert;

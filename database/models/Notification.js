import { Schema, model } from "mongoose";

const notificationSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // Notification content
  type: {
    type: String,
    enum: [
      "lead_new", "lead_updated",
      "client_new", "client_updated",
      "invoice_sent", "invoice_paid", "invoice_overdue",
      "payment_received",
      "task_assigned", "task_due", "task_completed",
      "job_assigned", "job_status_changed",
      "message_new",
      "document_shared",
      "proposal_accepted", "proposal_rejected",
      "mention",
      "system",
    ],
    required: true,
  },
  title: { type: String, required: true },
  body: { type: String },
  // Referenced entity
  entityType: { type: String },
  entityId: { type: Schema.Types.ObjectId },
  // Action URL
  actionUrl: { type: String },
  // Status
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  // Delivery
  channels: [{
    type: String,
    enum: ["in_app", "email", "push"],
  }],
}, {
  timestamps: true,
});

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

const Notification = model("Notification", notificationSchema);
export default Notification;

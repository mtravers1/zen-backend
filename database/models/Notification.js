import { Schema, model } from "mongoose";

const notificationSchema = new Schema(
  {
    userId: { type: String, required: true, trim: true },   // userId or "all" for broadcast
    title: { type: String, required: true, trim: true },
    message: { type: String, trim: true },
    type: {
      type: String,
      enum: ["info", "success", "warning", "error", "invoice", "task", "message", "system"],
      default: "info",
    },
    read: { type: Boolean, default: false },
    link: { type: String, trim: true },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = model("Notification", notificationSchema);
export default Notification;

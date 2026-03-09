import { Schema, Types, model } from "mongoose";

const activitySchema = new Schema(
  {
    date: { type: Date, default: Date.now },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    type: {
      type: String,
      enum: ["Invoice", "Document", "Proposal", "Payment", "Lead", "Time Entry", "Task", "Job", "Message", "User", "Other"],
      default: "Other",
    },
    item: { type: String, trim: true },             // item name/number
    action: { type: String, trim: true },            // e.g. "created", "updated", "deleted"
    userId: { type: String, trim: true },
    userName: { type: String, trim: true },
  },
  { timestamps: true }
);

activitySchema.index({ date: -1 });
activitySchema.index({ clientId: 1 });

const Activity = model("Activity", activitySchema);
export default Activity;

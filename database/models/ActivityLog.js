import { Schema, model } from "mongoose";

const activityLogSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    index: true,
  },
  // Action details
  action: {
    type: String,
    required: true,
    // e.g. "created", "updated", "deleted", "sent", "viewed", "signed"
  },
  entityType: {
    type: String,
    required: true,
    // e.g. "lead", "client", "invoice", "task", "job", "document"
  },
  entityId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  entityName: { type: String },
  // Change details
  changes: { type: Map, of: Schema.Types.Mixed },
  // Context
  description: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
}, {
  timestamps: true,
});

activityLogSchema.index({ firmId: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });

const ActivityLog = model("ActivityLog", activityLogSchema);
export default ActivityLog;

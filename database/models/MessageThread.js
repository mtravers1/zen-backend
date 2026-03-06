import { Schema, model } from "mongoose";

const messageThreadSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["team", "client", "direct"],
    default: "team",
  },
  // For team/group chats
  name: { type: String },
  description: { type: String },
  // Participants
  participants: [{
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date },
  }],
  // Client thread
  clientId: { type: Schema.Types.ObjectId, ref: "Client" },
  jobId: { type: Schema.Types.ObjectId, ref: "Job" },
  // Last message (for listing)
  lastMessage: {
    content: String,
    senderId: { type: Schema.Types.ObjectId, ref: "User" },
    sentAt: Date,
  },
  // Status
  isArchived: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
}, {
  timestamps: true,
});

const MessageThread = model("MessageThread", messageThreadSchema);
export default MessageThread;

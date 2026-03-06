import { Schema, model } from "mongoose";

const messageSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  threadId: {
    type: Schema.Types.ObjectId,
    ref: "MessageThread",
    required: true,
    index: true,
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: { type: String, required: true },
  type: {
    type: String,
    enum: ["text", "file", "system"],
    default: "text",
  },
  attachments: [{
    name: String,
    url: String,
    size: Number,
    mimeType: String,
  }],
  readBy: [{
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    readAt: { type: Date },
  }],
  editedAt: { type: Date },
  deletedAt: { type: Date },
  replyTo: { type: Schema.Types.ObjectId, ref: "Message" },
}, {
  timestamps: true,
});

const Message = model("Message", messageSchema);
export default Message;

import { Schema, Types, model } from "mongoose";

const messageSchema = new Schema(
  {
    fromUserId: { type: String, trim: true },
    fromName: { type: String, trim: true },
    fromEmail: { type: String, trim: true, lowercase: true },
    toUserId: { type: String, trim: true },
    toName: { type: String, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    subject: { type: String, trim: true },
    preview: { type: String, trim: true },
    body: { type: String },
    unread: { type: Boolean, default: true },
    starred: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ toUserId: 1 });
messageSchema.index({ unread: 1 });

const Message = model("Message", messageSchema);
export default Message;

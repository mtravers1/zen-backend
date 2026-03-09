import { Schema, model } from "mongoose";

const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["proposals", "jobs", "statuses", "tasks", "organizers", "requests", "chats", "emails", "sms", "invoices", "recurring", "signatures", "folders", "other"],
      default: "other",
    },
    content: { type: String },
    description: { type: String },
    tags: [{ type: String, trim: true }],
    isGlobal: { type: Boolean, default: false },   // marketplace vs firm-only
    deleted: { type: Boolean, default: false },
    createdById: { type: String },
    updatedById: { type: String },
  },
  { timestamps: true }
);

templateSchema.index({ category: 1 });
templateSchema.index({ name: 1 });

const Template = model("Template", templateSchema);
export default Template;

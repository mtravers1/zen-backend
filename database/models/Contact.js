import { Schema, Types, model } from "mongoose";

const contactSchema = new Schema(
  {
    clientId: { type: Types.ObjectId, ref: "Client" },
    name: { type: String, required: true, trim: true },
    initials: { type: String, trim: true },
    role: { type: String, trim: true },           // e.g. CEO, CFO, Controller
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contactSchema.index({ clientId: 1 });

const Contact = model("Contact", contactSchema);
export default Contact;

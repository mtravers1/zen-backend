import { Schema, model } from "mongoose";

const customFieldSchema = new Schema({
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
  label: { type: String, required: true },
  type: {
    type: String,
    enum: ["text", "number", "date", "select", "multi_select", "checkbox", "url", "email", "phone"],
    required: true,
  },
  // For select/multi_select
  options: [{ label: String, value: String }],
  // Applies to which entity types
  appliesTo: [{
    type: String,
    enum: ["lead", "contact", "client", "job", "task", "invoice"],
  }],
  // Validation
  required: { type: Boolean, default: false },
  placeholder: { type: String },
  helpText: { type: String },
  // Display
  position: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const CustomField = model("CustomField", customFieldSchema);
export default CustomField;

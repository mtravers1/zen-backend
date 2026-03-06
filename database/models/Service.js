import { Schema, model } from "mongoose";

const serviceSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    index: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  // Pricing
  pricingType: {
    type: String,
    enum: ["fixed", "hourly", "range", "custom"],
    default: "fixed",
  },
  price: { type: Number },
  priceMin: { type: Number },
  priceMax: { type: Number },
  currency: { type: String, default: "USD" },
  // Billing
  unit: { type: String, default: "service" }, // "hour", "month", "project"
  taxable: { type: Boolean, default: true },
  // Visibility
  isPublic: { type: Boolean, default: false }, // Show on firm website
  isActive: { type: Boolean, default: true },
  // Marketplace
  isGlobal: { type: Boolean, default: false },
  // Tags
  tags: [{ type: String }],
  // Usage
  usageCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

const Service = model("Service", serviceSchema);
export default Service;

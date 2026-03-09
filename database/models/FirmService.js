import { Schema, model } from "mongoose";

const firmServiceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    short_description: { type: String, trim: true },
    description: { type: String },
    category: { type: String, trim: true },
    price: { type: Number, default: 0 },
    pricingModel: {
      type: String,
      enum: ["fixed", "hourly", "monthly", "annual", "custom"],
      default: "fixed",
    },
    isActive: { type: Boolean, default: true },
    imageUrl: { type: String, trim: true },
    features: [{ type: String, trim: true }],
    deleted: { type: Boolean, default: false },
    createdById: { type: String },
  },
  { timestamps: true }
);

firmServiceSchema.index({ category: 1 });
firmServiceSchema.index({ isActive: 1 });

const FirmService = model("FirmService", firmServiceSchema);
export default FirmService;

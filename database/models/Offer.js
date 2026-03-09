import { Schema, model } from "mongoose";

const offerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    partner: { type: String, trim: true },
    description: { type: String, trim: true },
    discount: { type: String, trim: true },          // e.g. "20% off first year"
    category: {
      type: String,
      enum: ["Retirement", "Cloud hosting", "Software", "Security", "Finance", "HR", "Marketing", "Other"],
      default: "Other",
    },
    imageUrl: { type: String, trim: true },
    partnerUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

offerSchema.index({ category: 1 });
offerSchema.index({ isActive: 1 });

const Offer = model("Offer", offerSchema);
export default Offer;

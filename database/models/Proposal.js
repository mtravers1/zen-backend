import { Schema, Types, model } from "mongoose";

const proposalSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    clientId: { type: Types.ObjectId, ref: "Client" },
    clientName: { type: String, trim: true },
    status: {
      type: String,
      enum: ["draft", "sent", "viewed", "signed", "declined", "expired"],
      default: "draft",
    },
    paymentMethod: { type: String, trim: true },
    auth: { type: String, trim: true },              // authorization info
    invoicing: { type: String, trim: true },
    packages: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    signed: { type: Boolean, default: false },
    signedAt: { type: Date },
    content: { type: String },                       // proposal body
    totalAmount: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

proposalSchema.index({ clientId: 1 });
proposalSchema.index({ status: 1 });

const Proposal = model("Proposal", proposalSchema);
export default Proposal;

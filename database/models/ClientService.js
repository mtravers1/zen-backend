import { Schema, Types, model } from "mongoose";

const clientServiceSchema = new Schema(
  {
    clientId: { type: Types.ObjectId, ref: "Client", required: true },
    serviceId: { type: Types.ObjectId, ref: "FirmService", required: true },
    status: {
      type: String,
      enum: ["active", "inactive", "pending", "cancelled"],
      default: "active",
    },
    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    notes: { type: String },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

clientServiceSchema.index({ clientId: 1 });
clientServiceSchema.index({ serviceId: 1 });
clientServiceSchema.index({ status: 1 });

const ClientService = model("ClientService", clientServiceSchema);
export default ClientService;

import { Schema, model } from "mongoose";

const phoneNumberSchema = new Schema({
  phone: { type: String, default: null },
  phoneType: { type: String, default: null },
});

const addressSchema = new Schema({
  street: { type: String, default: null },
  city: { type: String, default: null },
  state: { type: String, default: null },
  postalCode: { type: String, default: null },
  country: { type: String, default: null },
});

const clientSchema = new Schema(
  {
    // Owning firm / staff
    firmId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Identity
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["Business", "Individual"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Contact info
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phones: [phoneNumberSchema],
    address: addressSchema,

    // Financials
    balance: {
      type: Number,
      default: 0,
    },

    // Relationships
    contactIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Contact",
      },
    ],
    documentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Document",
      },
    ],
    taskIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Task",
      },
    ],

    notes: {
      type: String,
      default: null,
    },

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

clientSchema.index({ firmId: 1, status: 1 });
clientSchema.index({ name: "text", email: "text" });

const Client = model("Client", clientSchema);

export default Client;

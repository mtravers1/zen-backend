import { Schema, model } from "mongoose";

const contactSchema = new Schema(
  {
    firmId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      trim: true,
      default: null,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },

    isPrimary: {
      type: Boolean,
      default: false,
    },

    notes: {
      type: String,
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    virtuals: true,
  }
);

contactSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

contactSchema.index({ firmId: 1, clientId: 1 });

const Contact = model("Contact", contactSchema);

export default Contact;

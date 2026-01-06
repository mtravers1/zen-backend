import { Schema, model } from "mongoose";

const accessTokenSchema = new Schema(
  {
    accessToken: {
      type: String,
      required: true,
    },
    itemId: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    institutionId: {
      type: String,
    },
    isAccessTokenExpired: {
      type: Boolean,
      default: false,
    },
    // Add status tracking for corrupted tokens
    status: {
      type: String,
      enum: ["active", "corrupted", "expired"],
      default: "active",
    },
    // Add error tracking
    lastError: {
      type: String,
      default: null,
    },
    lastErrorAt: {
      type: Date,
      default: null,
    },
    // Add retry count
    retryCount: {
      type: Number,
      default: 0,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Add index for better performance
accessTokenSchema.index({ itemId: 1 });
accessTokenSchema.index({ userId: 1 });
accessTokenSchema.index({ status: 1 });

const AccessToken = model("AccessToken", accessTokenSchema);

export default AccessToken;

import mongoose from "mongoose";

const verificationCodeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true,
  },
  code: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for automatic cleanup of expired codes
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for finding codes by email and code
verificationCodeSchema.index({ email: 1, code: 1 });

const VerificationCode = mongoose.model(
  "VerificationCode",
  verificationCodeSchema,
);

export default VerificationCode;

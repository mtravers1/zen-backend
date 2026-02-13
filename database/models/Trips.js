import mongoose, { Schema } from "mongoose";

const coordinateSchema = new mongoose.Schema(
  {
    latitude: String,
    longitude: String,
    timestamp: String,
  },
  { _id: false },
);

const metadataSchema = new mongoose.Schema(
  {
    profile: {
      type: String,
      required: false,
    },
    vehicle: {
      type: String,
      required: false,
    },
    purpose: String,
    description: String,
    placeName: String,
    pickupAddress: String,
    dropoffAddress: String,
    dateTime: String,
    initialMileage: {
      type: Number,
      default: null,
    },
    endMileage: {
      type: Number,
      default: null,
    },
    other: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const tripSchema = new mongoose.Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientTripId: {
      type: String,
      required: false, // Not all documents will have this (old ones)
      unique: true,
      sparse: true, // Allows multiple documents to have a null value for this field
      index: true,
    },
    locations: [coordinateSchema],
    totalMiles: Number,
    mileageEditedAt: {
      type: Date,
      default: null,
    },
    mileageManuallyEdited: {
      type: Boolean,
      default: false,
    },
    metadata: metadataSchema,
  },
  { timestamps: true },
);

export default mongoose.model("Trips", tripSchema);

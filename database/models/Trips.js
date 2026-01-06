import mongoose, { Schema } from "mongoose";

const coordinateSchema = new mongoose.Schema(
  {
    latitude: String,
    longitude: String,
  },
  { _id: false },
);

const metadataSchema = new mongoose.Schema(
  {
    profile: {
      type: String,
      ref: "Business",
      required: false,
    },
    vehicle: {
      type: String,
      ref: "Assets",
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

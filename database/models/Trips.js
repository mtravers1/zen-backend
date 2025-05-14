import mongoose, { Schema } from "mongoose";

const coordinateSchema = new mongoose.Schema(
  {
    latitude: String,
    longitude: String,
  },
  { _id: false }
);

const metadataSchema = new mongoose.Schema(
  {
    profile: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    vehicle: {
      type: Schema.Types.Mixed,
      ref: "Assets",
      required: true,
    },
    purpose: String,
    description: String,
    placeName: String,
    pickupAddress: String,
    dropoffAddress: String,
    dateTime: Date,
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
  { _id: false }
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
    metadata: metadataSchema,
  },
  { timestamps: true }
);

export default mongoose.model("Trips", tripSchema);

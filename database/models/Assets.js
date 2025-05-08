import { Schema, model } from "mongoose";

const assetsSchema = new Schema({
  userId: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
  account: {
    type: String,
    required: true,
  },
  profileId: {
    type: String,
    required: true,
  },
  type: String,
  basis: String,
  purchaseDate: String,
  info: {},
  updatedAt: Date,
});

const Assets = model("Assets", assetsSchema);

export default Assets;

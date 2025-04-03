import { Schema, model } from "mongoose";

const accessTokenSchema = new Schema(
  {
    accessToken: {
      type: Buffer,
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
  },
  { timestamps: true }
);

const AccessToken = model("AccessToken", accessTokenSchema);

export default AccessToken;

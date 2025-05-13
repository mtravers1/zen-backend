import { Schema, model } from "mongoose";

const filesSchema = new Schema({
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
  info: {},
  fileurl: String,
  updatedAt: Date,
});

const Files = model("Files", filesSchema);

export default Files;

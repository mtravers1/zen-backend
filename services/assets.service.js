import User from "../database/models/User.js";
import Assets from "../database/models/Assets.js";

const addAsset = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const newAsset = new Assets({
    userId: user._id.toString(),
    account: data.accountName,
    type: data.type,
    basis: data.basis,
    purchaseDate: data.purchaseDate,
    info: data.info,
    updatedAt: new Date(),
  });

  await newAsset.save();
  return { message: "Asset added successfully" };
};

const getAssets = async (uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const assets = await Assets.find({ userId: user._id.toString() });
  return assets.map((asset) => ({
    id: asset._id,
    account: asset.account,
    type: asset.type,
    basis: asset.basis,
    purchaseDate: asset.purchaseDate,
    info: asset.info,
    updatedAt: asset.updatedAt,
  }));
};

const updateAsset = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  console.log(data);

  const asset = await Assets.findOneAndUpdate(
    { _id: data.id, userId: user._id.toString() },
    {
      account: data.accountName,
      type: data.type,
      basis: data.basis,
      purchaseDate: data.purchaseDate,
      info: data.info,
      updatedAt: new Date(),
    },
    { new: true }
  );

  if (!asset) throw new Error("Asset not found or unauthorized");
  return { message: "Asset updated successfully" };
};

const deleteAsset = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const asset = await Assets.findOneAndDelete({
    _id: data.id,
    userId: user._id.toString(),
  });
  if (!asset) throw new Error("Asset not found or unauthorized");

  return { message: "Asset deleted successfully" };
};

const assetsService = { addAsset, getAssets, updateAsset, deleteAsset };
export default assetsService;

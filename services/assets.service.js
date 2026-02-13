import User from "../database/models/User.js";
import Assets from "../database/models/Assets.js";

const addAsset = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const newAsset = new Assets({
    userId: user._id.toString(),
    profileId: data.profileId,
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

const getAssets = async (uid, profileId = null) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const query = { userId: user._id.toString() };
  if (profileId) {
    query.profileId = profileId;
  }

  const assets = await Assets.find(query);
  return assets.map((asset) => ({
    id: asset._id,
    account: asset.account,
    profileId: asset.profileId,
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
      profileId: data.profileId,
      type: data.type,
      basis: data.basis,
      purchaseDate: data.purchaseDate,
      info: data.info,
      updatedAt: new Date(),
    },
    { new: true },
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

const addAssetAndReturn = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const newAsset = new Assets({
    userId: user._id.toString(),
    profileId: data.profileId,
    account: data.accountName,
    type: data.type,
    basis: data.basis,
    purchaseDate: data.purchaseDate,
    info: data.info,
    updatedAt: new Date(),
  });

  const savedAsset = await newAsset.save();
  return savedAsset;
};

const assetsService = { addAsset, getAssets, updateAsset, deleteAsset, addAssetAndReturn };
export default assetsService;

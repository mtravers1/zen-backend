import assetsService from "../services/assets.service.js";

const addAsset = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;
    const response = await assetsService.addAsset(data, uid);
    res.status(201).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getAssets = async (req, res) => {
  try {
    const uid = req.user.uid;
    const response = await assetsService.getAssets(uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updateAsset = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;
    const response = await assetsService.updateAsset(data, uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteAsset = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;
    const response = await assetsService.deleteAsset(data, uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const assetsController = { addAsset, getAssets, updateAsset, deleteAsset };
export default assetsController;

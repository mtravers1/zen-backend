import filesService from "../services/files.service.js";

const addFile = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;
    const response = await filesService.addFile(data, uid);
    res.status(201).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getFiles = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { profileId } = req.params;
    const response = await filesService.getFiles(profileId, uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteFiles = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;
    const response = await filesService.deleteFiles(data, uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const generateFileUrl = async (req, res) => {
  try {
    const { fileName, mimeType } = req.body;
    const url = await filesService.generateUploadUrl(fileName, mimeType);
    res.status(200).send({ uploadUrl: url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const genereteImageUrl = async (req, res) => {
  try {
    const { fileName, mimeType } = req.body;
    const url = await filesService.generateImageUploadUrl(fileName, mimeType);
    res.status(200).send({ uploadUrl: url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getFileUrl = async (req, res) => {
  try {
    const { fileName } = req.body;
    const url = await filesService.generateSignedUrl(fileName);
    res.status(200).send({ downloadUrl: url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const filesController = { addFile, getFiles, deleteFiles, generateFileUrl, getFileUrl, genereteImageUrl };
export default filesController;

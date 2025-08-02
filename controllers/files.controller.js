import filesService from "../services/files.service.js";
import permissionsService from "../services/permissions.service.js";

const addFile = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;
    
    const canUploadFile = await permissionsService.canPerformAction(uid, 'upload_file');
    
    if (!canUploadFile.success) {
      return res.status(403).send(canUploadFile);
    }
    
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

const checkStorageLimit = async (req, res) => {
  try {
    const uid = req.user.uid;
    
    const canUploadFile = await permissionsService.canPerformAction(uid, 'upload_file');
    
    if (canUploadFile.success) {
      return res.status(200).send({ success: true });
    } else {
      return res.status(403).send(canUploadFile);
    }
    
  } catch (error) {
    console.error("Error checking storage limit:", error);
    res.status(500).send({ error: "Internal server error" });
  }
};

const filesController = { addFile, getFiles, deleteFiles, generateFileUrl, getFileUrl, genereteImageUrl, checkStorageLimit };
export default filesController;

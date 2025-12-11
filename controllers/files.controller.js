import crypto from "crypto";
import filesService from "../services/files.service.js";
import permissionsService from "../services/permissions.service.js";
import storageService from "../services/storage.service.js";

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

const getFolders = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { profileId } = req.params;
    const response = await filesService.getFolders(profileId, uid);
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

const generateImageUrl = async (req, res) => {
  try {
    const { fileName, mimeType } = req.body;

    // Validate MIME type
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedMimeTypes.includes(mimeType)) {
      return res.status(400).send({ message: "Invalid file type." });
    }

    // Generate a unique filename to prevent collisions and enhance security
    const randomBytes = crypto.randomBytes(16).toString("hex");
    const extension = fileName.split(".").pop();
    const uniqueFileName = `${randomBytes}.${extension}`;

    const url = await filesService.generateImageUploadUrl(
      uniqueFileName,
      mimeType,
    );
    res.status(200).send({ uploadUrl: url, newFileName: uniqueFileName });
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

// /files/check-limit - Validación preventiva para popups de upgrade
const checkStorageLimit = async (req, res) => {
  try {
    const uid = req.user.uid;

    console.log(`[CHECK STORAGE LIMIT] Validating storage for user: ${uid}`);

    // Get current storage status using storageService
    const storageData = await storageService.getStorageStatus(uid);

    console.log(`[CHECK STORAGE LIMIT] Storage check result:`, {
      usedGB: storageData.storage.usedGB,
      maxGB: storageData.limits.maxGB,
      isOverLimit: storageData.storage.isOverLimit,
      usagePercentage: storageData.limits.usagePercentage,
    });

    // If user is already over limit, block upload and return upgrade popup data
    if (storageData.storage.isOverLimit) {
      console.log(
        `[CHECK STORAGE LIMIT] 🚫 Storage limit exceeded - blocking upload`,
      );

      return res.status(403).json({
        error: "LIMIT_EXCEEDED",
        popup_data: {
          title: "Storage Limit Reached",
          message: `You've reached your storage limit of ${storageData.limits.maxGB}GB. Upgrade to continue uploading files.`,
          current_plan: "Current Plan", // This could be enhanced to show actual plan
          popup_type: "storage_limit",
        },
      });
    }

    // If under limit, allow upload
    console.log(
      `[CHECK STORAGE LIMIT] ✅ Storage check passed - allowing upload`,
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[CHECK STORAGE LIMIT] Error checking storage limit:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// /files/storage-status - Stats para UI (usage, limits, percentages)
const getStorageStatus = async (req, res) => {
  try {
    const uid = req.user.uid;

    console.log(`[STORAGE STATUS] Getting storage status for user: ${uid}`);

    const storageData = await storageService.getStorageStatus(uid);

    console.log(`[STORAGE STATUS] Storage data retrieved:`, {
      usedGB: storageData.usedGB,
      limitGB: storageData.limitGB,
      usagePercentage: storageData.usagePercentage,
      isOverLimit: storageData.isOverLimit,
    });

    res.status(200).json(storageData);
  } catch (error) {
    console.error("[STORAGE STATUS] Error getting storage status:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const filesController = {
  addFile,
  getFiles,
  getFolders,
  deleteFiles,
  generateFileUrl,
  getFileUrl,
  generateImageUrl,
  checkStorageLimit,
  getStorageStatus,
};
export default filesController;

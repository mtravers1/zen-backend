import crypto from "crypto";
import filesService from "../services/files.service.js";
import permissionsService from "../services/permissions.service.js";
import storageService from "../services/storage.service.js";
import structuredLogger from "../lib/structuredLogger.js";

const addFile = async (req, res) => {
  await structuredLogger.withContext(
    "addFile",
    { user: req.user, body: req.body },
    async () => {
      try {
        const data = req.body;
        const uid = req.user.uid;

        const response = await filesService.addFile(data, uid);
        res.status(201).json(response);
      } catch (error) {
        res.status(500).json({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
};

const getFiles = async (req, res) => {
  await structuredLogger.withContext(
    "getFiles",
    { user: req.user, params: req.params },
    async () => {
      try {
        const uid = req.user.uid;
        const { profileId } = req.params;
        const response = await filesService.getFiles(profileId, uid);
        res.status(200).json(response);
      } catch (error) {
        res.status(500).json({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
};

const getFolders = async (req, res) => {
  await structuredLogger.withContext(
    "getFolders",
    { user: req.user, params: req.params },
    async () => {
      try {
        const uid = req.user.uid;
        const { profileId } = req.params;
        const response = await filesService.getFolders(profileId, uid);
        res.status(200).json(response);
      } catch (error) {
        res.status(500).json({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
};

const deleteFiles = async (req, res) => {
  await structuredLogger.withContext(
    "deleteFiles",
    { user: req.user, body: req.body },
    async () => {
      try {
        const data = req.body;
        const uid = req.user.uid;
        const response = await filesService.deleteFiles(data, uid);
        res.status(200).json(response);
      } catch (error) {
        res.status(500).json({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
};

const generateFileUrl = async (req, res) => {
  await structuredLogger.withContext(
    "generateFileUrl",
    { user: req.user, body: req.body },
    async () => {
      try {
        const { fileName, mimeType } = req.body;
        const url = await filesService.generateUploadUrl(fileName, mimeType);
        res.status(200).send({ uploadUrl: url });
      } catch (error) {
        res.status(500).send({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
};

const generateImageUrl = async (req, res) => {
  await structuredLogger.withContext(
    "generateImageUrl",
    { user: req.user, body: req.body },
    async () => {
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
        const objectName = `profilePhotos/${uniqueFileName}`;

        const url = await filesService.generateImageUploadUrl(
          objectName,
          mimeType,
        );
        res.status(200).send({ uploadUrl: url, newFileName: objectName });
      } catch (error) {
        res.status(500).send({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
};

const getFileUrl = async (req, res) => {
  await structuredLogger.withContext(
    "getFileUrl",
    { user: req.user, body: req.body },
    async () => {
      try {
        const { fileName } = req.body;
        const url = await filesService.generateSignedUrl(fileName);
        res.status(200).send({ downloadUrl: url });
      } catch (error) {
        res.status(500).send({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
};

// /files/check-limit - Validación preventiva para popups de upgrade
const checkStorageLimit = async (req, res) => {
  await structuredLogger.withContext(
    "checkStorageLimit",
    { uid: req.user.uid },
    async (context) => {
      try {
        const uid = req.user.uid;

        // Get current storage status using storageService
        const storageData = await storageService.getStorageStatus(uid);

        structuredLogger.logSuccess("checkStorageLimit", {
          ...context,
          usedGB: storageData.storage.usedGB,
          maxGB: storageData.limits.maxGB,
          isOverLimit: storageData.storage.isOverLimit,
          usagePercentage: storageData.limits.usagePercentage,
        });

        // If user is already over limit, block upload and return upgrade popup data
        if (storageData.storage.isOverLimit) {
          structuredLogger.logErrorBlock(
            new Error("Storage limit exceeded - blocking upload"),
            {
              ...context,
              error_classification: "storage_limit_exceeded",
            },
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
        res.status(200).json({ success: true });
      } catch (error) {
        structuredLogger.logErrorBlock(error, { ...context });
        res.status(500).json({
          message: "Internal server error",
          errorId: `Z-${error.errorId}`,
        });
      }
    },
  );
};

// /files/storage-status - Stats para UI (usage, limits, percentages)
const getStorageStatus = async (req, res) => {
  await structuredLogger.withContext(
    "getStorageStatus",
    { uid: req.user.uid },
    async (context) => {
      try {
        const uid = req.user.uid;

        const storageData = await storageService.getStorageStatus(uid);

        structuredLogger.logSuccess("getStorageStatus", {
          ...context,
          usedGB: storageData.usedGB,
          limitGB: storageData.limitGB,
          usagePercentage: storageData.usagePercentage,
          isOverLimit: storageData.isOverLimit,
        });

        res.status(200).json(storageData);
      } catch (error) {
        structuredLogger.logErrorBlock(error, { ...context });
        res.status(500).json({
          message: "Internal server error",
          errorId: `Z-${error.errorId}`,
        });
      }
    },
  );
};

const getSignedUrlForFile = async (req, res) => {
  await structuredLogger.withContext(
    "getSignedUrlForFile",
    { fileId: req.params.fileId, user: req.user },
    async () => {
      try {
        const { userId, fileId } = req.params;
        const { uid } = req.user;

        if (userId !== uid) {
          return res.status(403).send({ message: "Unauthorized" });
        }

        const url = await filesService.getSignedUrlByFileId(fileId, uid);
        res.status(200).send({ signedUrl: url });
      } catch (error) {
        res.status(500).send({ message: "An internal server error occurred.", errorId: `Z-${error.errorId}` });
      }
    },
  );
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
  getSignedUrlForFile,
};
export default filesController;


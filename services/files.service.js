import User from "../database/models/User.js";
import Files from "../database/models/Files.js";
import { Storage } from "@google-cloud/storage";

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
const serviceAccountJsonString = Buffer.from(
  serviceAccountBase64,
  "base64"
).toString("utf8");
const storageServiceAccount = JSON.parse(serviceAccountJsonString);

const storage = new Storage({
  credentials: storageServiceAccount,
});
const bucketName = "zentavos-bucket";

const addFile = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const newFile = new Files({
    userId: user._id.toString(),
    account: data.accountName,
    profileId: data.profileId,
    type: data.type,
    info: data.info,
    fileurl: data.fileurl,
    folder: data.folder || "General",
    updatedAt: new Date(),
  });

  await newFile.save();
  return { message: "File uploaded successfully" };
};

const generateUploadUrl = async (fileName, mimeType) => {
  try {
    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl({
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: mimeType,
      });
    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
};

const generateImageUploadUrl = async (fileName, mimeType) => {
  console.log("🚀 ~ generateImageUploadUrl ~ fileName:", fileName);
  console.log("🚀 ~ generateImageUploadUrl ~ mimeType:", mimeType);
  try {
    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl({
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: mimeType,
      });
    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
};

const generateSignedUrl = async (fileName) => {
  try {
    const options = {
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    };

    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl(options);

    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
};

const getFiles = async (profileId, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const files = await Files.find({
    userId: user._id.toString(),
    profileId: profileId,
  });
  return files.map((file) => ({
    id: file._id,
    userId: file.userId,
    account: file.account,
    profileId: file.profileId,
    type: file.type,
    info: file.info,
    fileurl: file.fileurl,
    folder: file.folder,
    updatedAt: file.updatedAt,
  }));
};

const getFolders = async (profileId, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const files = await Files.find({
    userId: user._id.toString(),
    profileId: profileId,
  });

  // Get unique folders and count files in each
  const folderCounts = {};
  files.forEach((file) => {
    const folder = file.folder || "General";
    folderCounts[folder] = (folderCounts[folder] || 0) + 1;
  });

  // Convert to array format expected by mobile app
  const folders = Object.keys(folderCounts).map((folderName) => ({
    id: folderName,
    name: folderName,
    fileCount: folderCounts[folderName],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  return folders;
};

const deleteFiles = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  try {
    data.forEach(async (element) => {
      await Files.deleteOne({
        _id: element.id,
        userId: user._id.toString(),
      });
      await storage.bucket(bucketName).file(element.fileurl).delete();
      console.log(`File ${element.fileurl} deleted successfully.`);
    });
  } catch (error) {
    console.error("Error deleting files:", error);
    throw new Error("Error deleting files");
  }

  return { message: "Files deleted successfully" };
};

const filesService = {
  addFile,
  getFiles,
  getFolders,
  deleteFiles,
  generateUploadUrl,
  generateSignedUrl,
  generateImageUploadUrl,
};
export default filesService;

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
  projectId: process.env.GCP_PROJECT_ID,
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

const getFilesByFolder = async (profileId, uid, folder) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");
  const query = {
    userId: user._id.toString(),
    profileId: profileId,
  };
  if (folder) {
    query["info.folder"] = folder;
  }
  const files = await Files.find(query);
  return files.map((file) => ({
    id: file._id,
    userId: file.userId,
    account: file.account,
    profileId: file.profileId,
    type: file.type,
    info: file.info,
    fileurl: file.fileurl,
    updatedAt: file.updatedAt,
  }));
};

const getFolderCounts = async (profileId, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");
  const pipeline = [
    { $match: { userId: user._id.toString(), profileId: profileId } },
    { $group: { _id: "$info.folder", count: { $sum: 1 } } },
  ];
  const result = await Files.aggregate(pipeline);
  const counts = {};
  result.forEach((item) => {
    counts[item._id || "General"] = item.count;
  });
  return counts;
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
  getFilesByFolder,
  getFolderCounts,
  deleteFiles,
  generateUploadUrl,
  generateSignedUrl,
  generateImageUploadUrl,
};
export default filesService;

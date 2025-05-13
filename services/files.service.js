import User from "../database/models/User.js";
import Files from "../database/models/Files.js";
import { Storage } from "@google-cloud/storage";

const storage = new Storage({
  credentials: {
    type: "service_account",
    project_id: "zentavos-d6c79",
    private_key_id: "24978c4e7ffff262c73c88f0a625e74dfa1f8dbd",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCWnQNWbrHeEEwX\nLYRgr8iPwqIIrYoQ446/dR/hMPPetXtt5cJfMmPVLV2PQmpZU016r9txVT4bDtLJ\n0aLc6C0BecyyoFlXak66dloz5LSKogkt1DCwQmRKoeDK5ZB3NcYqemFj+csF86Qw\nVHi1agu/dLyp2kYpC7j4VOzhK/fsoOtNDPOkRn5ozFVID37dSmlfC2LJJ71h26S2\n7hOd0bmMtM1f7q8nNOkHAm/Us1SYd7oqgD0uh5F+re6pQJRDB/pz3xtiOOFqFjPi\n1t6gr4HlBkKZIPtLF916x+Pd7MVyk6xP0zNU63GDhvZCDajftZPNYSOG3p1EVBtA\nRhpsYNd7AgMBAAECggEAAc2BOm89k5JYJ4pxbvanT7an4YSO+LPXIPLm9hJkP2yW\n8vkO5H5qzk9ep3QYtZFGnTaNcHVWZRqq+Cw0dJ1zfQ/1NBVbxpW8LfXRVVcp/f5i\njK5Rxfav5jvhlV8LjF8SBniXWOUi7xtoz692yjtIyq7yV5VV0PRKUIscxutwu8Dc\nF0KeePndfKbDnNk6rGD0FLJkyk6inoXuOtYJJiq0xhzetMYyG1nUoGlwKx9dZAMz\nPa/yCCY3uFu4GGzMQVO54kfms0qdo8q35kIAyG6Nhqu/MrmrEGdIvN12g6mbyPXj\nOGsSFaSDMpsTQWjylr+lCJCFjzu63gVax9UO7ucAgQKBgQDH0+HLD45xDZrNX4Dz\nFjGjOMBTJKKGsxM06xx66Gk9gCEPS7LCGzLTT12AZ+ybxvPizpiXMcLSD2eROnUy\n1VxgyjX6qwbDxKyiGb1fJ5LJwUH1g03h02C3xpPxTpJYpZjszZuuvkTVvncdI2BJ\nFgzbaGAFOceUSY3yfQS4K4CMgQKBgQDA84oxcL6+l5wIJqn3hrhrsoChfnxRRJhM\nBgUONjWeT3nY2M55ohbUgJB3wlUxcaXd5yUjTwA8MYGVIH72G7VwxKJ7vQVwQIxJ\nrOhD9eoncfn5QfHnfQLgzkUcN6Tu91fqbCcbDd6cBJnLiqvuQ3LxrKoINEq/hhyI\neE6ta5CV+wKBgFtbSR1W7V5OQ/mksgVwnhzrMzJPy2YdtKg63PhsDMErNPITP5Ry\nbtggrrSnzoqheJq2rRhijZkPpd/FhBNLbEJr8CW7zwntfqdVcThxlTBcBFXEQ/T8\neHlMdhKaQ1n3y2Rn08ceAcZen4JYzApd5F7i5xM8iTwILLcx5Nh2Ov0BAoGBAKsw\nJ75/miv81OmCbC/5LewXPfqJ/wAXTMu+V4PpYp7nQmK60E2oGntE6WfnWbB5dUCw\nUAnIkJvXDHHjl+EAanT3cHU6GfYivpSrPJL3PlzqyW51LItGJWSQfU5wq/t8JVsN\nw5BEOOnRRyYIDUxiOTvkBiMrSdoswWnu21cPZQM7AoGACLcQoJgRAPQ0RKFYoghq\nEWz0rd+opwsfCzGNdti74GQ9LCdGC+8yPld3UjV+eQhRbgWao+D8yKNvLlKoq+5c\nYGURUsKdSShWy2sTM1rvtGQim90lJHfGel29xxjDY69jvyDS/sZQ4Gbz3QosF/Qj\nmLKxxwRvKbzZCjUO/LU2l9U=\n-----END PRIVATE KEY-----\n",
    client_email: "storage-admin@zentavos-d6c79.iam.gserviceaccount.com",
    client_id: "117489984613438292578",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url:
      "https://www.googleapis.com/robot/v1/metadata/x509/storage-admin%40zentavos-d6c79.iam.gserviceaccount.com",
    universe_domain: "googleapis.com",
  },
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
    updatedAt: new Date(),
  });

  await newFile.save();
  return { message: "File uploaded successfully" };
};

const generateUploadUrl = async (fileName) => {
    try {
      const [url] = await storage
        .bucket(bucketName)
        .file(fileName)
        .getSignedUrl({
          action: "write",
          expires: Date.now() + 15 * 60 * 1000,
          contentType: "application/pdf",
        });
      return url;
    } catch (error) {
      console.error("Error generating signed URL:", error);
      return null;
    }
  };

  const generateImageUploadUrl = async (fileName) => {
    try {
      const [url] = await storage
        .bucket(bucketName)
        .file(fileName)
        .getSignedUrl({
          action: "write",
          expires: Date.now() + 15 * 60 * 1000,
          contentType: "image/jpeg",
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

const getFiles = async (uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");

  const files = await Files.find({ userId: user._id.toString() });
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

const deleteFiles = async (data, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) throw new Error("User not found");
  
  try {
    data.forEach(async element => {
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

const filesService = { addFile, getFiles, deleteFiles, generateUploadUrl, generateSignedUrl, generateImageUploadUrl };
export default filesService;

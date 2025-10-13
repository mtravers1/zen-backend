import User from "../database/models/User.js";
import Files from "../database/models/Files.js";
import { Storage } from "@google-cloud/storage";

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
const serviceAccountJsonString = Buffer.from(
  serviceAccountBase64,
  "base64"
).toString("utf8");
const storageServiceAccount = JSON.parse(serviceAccountJsonString);

// Ensure credentials have universe_domain field
if (!storageServiceAccount.universe_domain) {
  storageServiceAccount.universe_domain = "googleapis.com";
}

const storage = new Storage({
  credentials: storageServiceAccount,
  projectId: process.env.GCP_PROJECT_ID,
  apiEndpoint: "https://storage.googleapis.com",
  useAuthWithCustomEndpoint: true,
});
const bucketName = "zentavos-bucket";

const getStorageStatus = async (uid) => {
  try {
    const user = await User.findOne({ authUid: uid });
    if (!user) throw new Error("User not found");

    // Get user's plan limits
    const permissions = (await import("../config/permissions.js")).default;
    const userRole = user.account_type || "Free";
    const planLimits = permissions[userRole];
    const limitGB = planLimits ? planLimits.storage_max_gb : 0.1; // Default to Free plan

    // DEVELOPMENT: Return mock data but with correct plan limits + real uploaded files
    if (process.env.NODE_ENV === "development") {
      // Calculate real storage usage from uploaded files
      const userFiles = await Files.find({ userId: user._id.toString() });
      let realStorageUsed = 0;

      for (const file of userFiles) {
        try {
          const [fileMetadata] = await storage
            .bucket(bucketName)
            .file(file.fileurl)
            .getMetadata();
          realStorageUsed += parseInt(fileMetadata.size || 0);
        } catch (error) {
          console.log(`File ${file.fileurl} not found in bucket`);
        }
      }

      // Mock base usage: 99% of limit, so one upload will exceed it
      const mockBaseGB = limitGB === -1 ? 4.0 : limitGB * 0.99;
      const mockBaseBytes = Math.round(mockBaseGB * 1024 * 1024 * 1024);

      const totalUsageBytes = mockBaseBytes + realStorageUsed;
      const totalUsageGB = totalUsageBytes / (1024 * 1024 * 1024);
      const totalUsageMB = totalUsageBytes / (1024 * 1024);

      return {
        storage: {
          usedBytes: totalUsageBytes,
          usedMB: totalUsageMB.toFixed(2),
          usedGB: totalUsageGB.toFixed(3),
          fileCount: 999 + userFiles.length,
          isOverLimit: limitGB === -1 ? false : totalUsageGB >= limitGB,
        },
        limits: {
          maxGB: limitGB,
          usagePercentage:
            limitGB === -1 ? 0 : Math.min((totalUsageGB / limitGB) * 100, 100),
        },
      };
    }

    // PRODUCTION: Real calculation
    const userFiles = await Files.find({ userId: user._id.toString() });

    let userStorageUsed = 0;
    for (const file of userFiles) {
      try {
        const [fileMetadata] = await storage
          .bucket(bucketName)
          .file(file.fileurl)
          .getMetadata();
        userStorageUsed += parseInt(fileMetadata.size || 0);
      } catch (error) {
        console.log(`File ${file.fileurl} not found in bucket`);
      }
    }

    const usedGB = userStorageUsed / (1024 * 1024 * 1024);
    const isOverLimit = limitGB === -1 ? false : usedGB >= limitGB; // -1 means unlimited
    const usagePercentage =
      limitGB === -1 ? 0 : Math.min((usedGB / limitGB) * 100, 100);

    return {
      storage: {
        usedBytes: userStorageUsed,
        usedMB: (userStorageUsed / (1024 * 1024)).toFixed(2),
        usedGB: usedGB.toFixed(2),
        fileCount: userFiles.length,
        isOverLimit: isOverLimit,
      },
      limits: {
        maxGB: limitGB,
        usagePercentage: parseFloat(usagePercentage.toFixed(1)),
      },
    };
  } catch (error) {
    console.error("Error getting storage status:", error);
    throw error;
  }
};

const storageService = {
  getStorageStatus,
};

export default storageService;

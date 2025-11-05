import { jest } from "@jest/globals";

// Mock the structuredLogger module
jest.unstable_mockModule("../lib/structuredLogger.js", () => ({
  default: {
    logError: jest.fn(),
  },
}));

// Mock the encryption module
const mockEncryptValue = jest.fn();
const mockDecryptValue = jest.fn();

jest.unstable_mockModule("../database/encryption.js", () => ({
  encryptValue: mockEncryptValue,
  decryptValue: mockDecryptValue,
  getUserDek: jest.fn(),
  getUserDekForSignup: jest.fn(),
  hashEmail: jest.fn(),
  hashValue: jest.fn(),
  copyDEKToNewBucketKey: jest.fn(),
  backupExistingDEK: jest.fn(),
  tryRecoverDEKFromBackup: jest.fn(),
  moveDEKToDeadLetterQueue: jest.fn(),
  DecryptionError: class DecryptionError extends Error {
    constructor(message) {
      super(message);
      this.name = "DecryptionError";
    }
  },
}));

// Dynamically import the module with the mocks
const { createSafeEncrypt, createSafeDecrypt } = await import(
  "../lib/encryptionHelper.js"
);

describe("Encryption Helpers", () => {
  const uid = "test-uid";
  const dek = "test-dek";
  const value = { sensitive: "data" };
  const encryptedValue = "encrypted-data";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createSafeEncrypt", () => {
    it("should encrypt a value successfully", async () => {
      mockEncryptValue.mockResolvedValue(encryptedValue);
      const safeEncrypt = createSafeEncrypt(uid);
      const result = await safeEncrypt(value, dek, {});
      expect(result).toBe(encryptedValue);
      expect(mockEncryptValue).toHaveBeenCalledWith(value, dek);
    });

    it("should throw an EncryptionError on failure", async () => {
      const originalError = new Error("Encryption failed");
      mockEncryptValue.mockRejectedValue(originalError);
      const safeEncrypt = createSafeEncrypt(uid);
      await expect(safeEncrypt(value, dek, {})).rejects.toThrow(
        "Failed to encrypt value. Please report error code:",
      );
    });
  });

  describe("createSafeDecrypt", () => {
    it("should decrypt a value successfully", async () => {
      mockDecryptValue.mockResolvedValue(value);
      const safeDecrypt = createSafeDecrypt(uid);
      const result = await safeDecrypt(encryptedValue, dek, {});
      expect(result).toEqual(value);
      expect(mockDecryptValue).toHaveBeenCalledWith(encryptedValue, dek);
    });

    it("should return null on DecryptionError", async () => {
      const { DecryptionError } = await import("../database/encryption.js");
      const originalError = new DecryptionError("Decryption failed");
      mockDecryptValue.mockRejectedValue(originalError);
      const safeDecrypt = createSafeDecrypt(uid);
      const result = await safeDecrypt(encryptedValue, dek, {});
      expect(result).toBeNull();
    });

    it("should re-throw other errors", async () => {
      const originalError = new Error("Something else went wrong");
      mockDecryptValue.mockRejectedValue(originalError);
      const safeDecrypt = createSafeDecrypt(uid);
      await expect(safeDecrypt(encryptedValue, dek, {})).rejects.toThrow(
        "Something else went wrong",
      );
    });
  });
});

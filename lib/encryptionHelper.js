import {
  decryptValue,
  encryptValue,
  getUserDek,
  DecryptionError,
} from "../database/encryption.js";
import structuredLogger from "./structuredLogger.js";

class EncryptionError extends Error {
  constructor(message, errorCode) {
    super(message);
    this.name = "EncryptionError";
    this.errorCode = errorCode;
  }
}

export function createSafeEncrypt(uid) {
  return async function safeEncrypt(value, dek, context) {
    try {
      return await encryptValue(value, dek);
    } catch (error) {
      const errorCode = `ENC_FAIL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      structuredLogger.logError("encryption_failed", {
        uid,
        ...context,
        error_code: errorCode,
        message: error.message,
      });
      throw new EncryptionError(
        `Failed to encrypt value. Please report error code: ${errorCode}`,
        errorCode,
      );
    }
  };
}

export function createSafeDecrypt(uid) {
  return async function safeDecrypt(value, dek, context) {
    try {
      return await decryptValue(value, dek);
    } catch (error) {
      let decryptionError = error;
      if (!(error instanceof DecryptionError)) {
        const errorCode = `DEC_FAIL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        decryptionError = new DecryptionError(
          `Failed to decrypt value. Please report error code: ${errorCode}`,
          errorCode,
        );
      }

      structuredLogger.logError("decryption_failed", {
        uid,
        ...context,
        error_code: decryptionError.errorCode,
        message: decryptionError.message,
      });
      return null; // Return null on decryption failure
    }
  };
}

/**
 * Encryption helper class with structured logging
 */
class EncryptionHelper {
  /**
   * Decrypt value with current key version
   */
  static async decryptWithLogging(cipherTextBase64, uid, context = {}) {
    const startTime = Date.now();

    try {
      const dek = await getUserDek(uid);

      const result = await structuredLogger.withContext(
        "decryptWithCurrentKey",
        {
          user_id: uid,
          has_cipher_text: !!cipherTextBase64,
          ...context,
        },
        async () => {
          return await decryptValue(cipherTextBase64, dek);
        },
      );

      const durationMs = Date.now() - startTime;

      structuredLogger.logEncryptionOperation("decrypt", true, {
        user_id: uid,
        durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      structuredLogger.logErrorBlock(error, {
        operation: "decryptWithLogging",
        user_id: uid,
        durationMs,
        error_classification: "decryption_failure",
      });

      throw error;
    }
  }

  /**
   * Encrypt value with current key version
   */
  static async encryptWithLogging(plainText, uid, context = {}) {
    const startTime = Date.now();

    try {
      const dek = await getUserDek(uid);

      const result = await structuredLogger.withContext(
        "encryptWithCurrentKey",
        {
          user_id: uid,
          has_plain_text: !!plainText,
          ...context,
        },
        async () => {
          return await encryptValue(plainText, dek);
        },
      );

      const durationMs = Date.now() - startTime;

      structuredLogger.logEncryptionOperation("encrypt", true, {
        user_id: uid,
        durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      structuredLogger.logErrorBlock(error, {
        operation: "encryptWithLogging",
        user_id: uid,
        durationMs,
        error_classification: "encryption_failure",
      });

      throw error;
    }
  }

  /**
   * Decrypt value with fallback support (simplified)
   */
  static async decryptWithFallback(cipherTextBase64, uid, context = {}) {
    const startTime = Date.now();
    const fallbacksTriggered = [];

    try {
      const dek = await getUserDek(uid);

      try {
        const result = await structuredLogger.withContext(
          "decryptWithCurrentKey",
          {
            user_id: uid,
            has_cipher_text: !!cipherTextBase64,
            fallback_used: false,
            ...context,
          },
          async () => {
            return await decryptValue(cipherTextBase64, dek);
          },
        );

        const durationMs = Date.now() - startTime;

        structuredLogger.logEncryptionOperation("decrypt", true, {
          user_id: uid,
          durationMs,
          fallback_used: false,
        });

        return result;
      } catch (currentKeyError) {
        fallbacksTriggered.push("retry-with-current-key");

        // Log the error and return the original value if decryption fails
        const durationMs = Date.now() - startTime;

        structuredLogger.logErrorBlock(currentKeyError, {
          operation: "decryptWithFallback",
          user_id: uid,
          fallbacks_triggered: fallbacksTriggered,
          durationMs,
          error_classification: "decryption_failure",
          metadata: {
            current_key_attempted: true,
            recommendation: "Data may not be encrypted or key may be invalid",
          },
        });

        // Return the original value as fallback
        return cipherTextBase64;
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;

      structuredLogger.logErrorBlock(error, {
        operation: "decryptWithFallback",
        user_id: uid,
        fallbacks_triggered: fallbacksTriggered,
        durationMs,
        error_classification: "decryption_failure",
      });

      throw error;
    }
  }
}

export default EncryptionHelper;

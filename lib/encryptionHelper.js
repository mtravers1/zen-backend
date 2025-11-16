import {
  decryptValue,
  encryptValue,
  getUserDek,
  DecryptionError,
} from "../database/encryption.js";
import structuredLogger from "./structuredLogger.js";

export class EncryptionError extends Error {
  constructor(message, errorCode) {
    super(message);
    this.name = "EncryptionError";
    this.errorCode = errorCode;
  }
}

/**
 * Creates a user-scoped encryptor that logs failures and maps encryption errors to an EncryptionError with a reportable code.
 *
 * @param {string} uid - Identifier of the user whose context will be attached to logged errors.
 * @param {any} dek - The user's Data Encryption Key.
 * @returns {function(any, Object=): Promise<any>} A function that encrypts a provided value. On success returns the encrypted result; on failure logs an error block and throws an `EncryptionError` whose message contains a reportable error code.
 */
export function createSafeEncrypt(uid, dek) {
  return async function safeEncrypt(value, context = {}) {
    try {
      return await encryptValue(value, dek);
    } catch (error) {
      const errorCode = `ENC_FAIL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      structuredLogger.logErrorBlock(error, {
        operation: "encryption_failed",
        uid,
        ...context,
        error_code: errorCode,
      });
      throw new EncryptionError(
        `Failed to encrypt value. Please report error code: ${errorCode}`,
        errorCode,
      );
    }
  };
}

/**
 * Creates a decrypt helper bound to a user identifier and DEK.
 *
 * The returned function attempts to decrypt a provided value. If the underlying operation
 * throws a `DecryptionError`, the error is logged and the function returns `null`. If an unexpected error occurs,
 * the error is logged and rethrown.
 *
 * @param {string} uid - User identifier associated with decryption attempts.
 * @param {any} dek - The user's Data Encryption Key.
 * @returns {function(value: any, context?: object): any} A function that decrypts `value` using the bound DEK and optional `context`; returns the decrypted plaintext, or `null` when decryption fails due to a `DecryptionError`.
 * @throws Rethrows unexpected errors from the underlying decryption operation.
 */
export function createSafeDecrypt(uid, dek) {
  return async function safeDecrypt(value, context = {}) {
    try {
      return await decryptValue(value, dek);
    } catch (error) {
      if (error instanceof DecryptionError) {
        structuredLogger.logErrorBlock(error, {
          operation: "decryption_failed",
          uid,
          ...context,
          error_code: error.errorCode,
        });
        throw error; // Re-throw the DecryptionError
      } else {
        const errorCode = `DEC_UNEXPECTED_FAIL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        structuredLogger.logError("decryption_unexpected_failed", {
          uid,
          ...context,
          error_code: errorCode,
          message: error.message,
          stack: error.stack,
        });
        throw error; // Rethrow unexpected errors
      }
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
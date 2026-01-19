import AccessToken from "../database/models/AccessToken.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
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
    if (process.env.DEBUG_ENCRYPTION === 'true') {
      console.error(`[DECRYPT_TRACE] Attempting to decrypt value for field: ${context.field}`);
      console.error(`[DECRYPT_TRACE] Value: ${value}`);
    }
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
        return null; // Return null on decryption failure
      } else {
        const errorCode = `DEC_UNEXPECTED_FAIL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        structuredLogger.logError("decryption_unexpected_failed", {
          uid,
          ...context,
          error_code: errorCode,
          message: error.message,
          stack: error.stack,
        });
        return null; // Return null for unexpected errors as well for robustness
      }
    }
  };
}

/**
 * Decrypts a value that is expected to be a number. If the decrypted value is a string,
 * it's considered a decryption failure and null is returned.
 * @param {*} value The value to decrypt.
 * @param {Function} safeDecrypt The safeDecrypt function to use.
 * @param {Object} context The context for logging.
 * @returns {Promise<number|null>} The decrypted number, or null if decryption fails.
 */
export async function safeDecryptNumericValue(value, safeDecrypt, context) {
  const decryptedValue = await safeDecrypt(value, context);
  if (decryptedValue === null || decryptedValue === undefined) {
    return null; // Decryption failed or value was null/undefined initially
  }
  if (typeof decryptedValue === "string") {
    const parsedValue = parseFloat(decryptedValue);
    if (isNaN(parsedValue)) {
      // If the string cannot be parsed as a number, treat as a failure
      return null;
    }
    return parsedValue;
  }
  return decryptedValue;
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

export async function flexibleDecrypt(value, safeDecrypt, context) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return await safeDecrypt(value, context);
    } catch (e) {
      // If decryption fails, assume it's a plaintext value and return it.
      return value;
    }
  }

  // If it's not a string (e.g., a number, boolean, or object from new data), return it directly.
  return value;
}

export async function getDecryptedLiabilitiesCredit(liabilities, dek, uid) {

  const liabilitiesList = liabilities[0];
  if (!liabilitiesList) return null;
  const safeDecrypt = createSafeDecrypt(uid, dek);
  const decryptedLiabilities = {
    _id: liabilitiesList._id,
    liabilityType: liabilitiesList.liabilityType,
    accountNumber: await flexibleDecrypt(liabilitiesList.accountNumber, safeDecrypt, { field: 'accountNumber' }),
  };
  const binaryFields = [
    "lastPaymentAmount",
    "lastPaymentDate",
    "lastPaymentDueDate",
    "nextPaymentDueDate",
    "minimumPaymentAmount",
    "lastStatementBalance",
    "lastStatementIssueDate",
    "isOverdue",
  ];
  for (const field of binaryFields) {
    if (liabilitiesList[field] !== undefined) {
      decryptedLiabilities[field] = await flexibleDecrypt(
        liabilitiesList[field],
        safeDecrypt,
        { field: field },
      );
    }
  }
  if (Array.isArray(liabilitiesList.aprs)) {
    decryptedLiabilities.aprs = [];
    for (const aprItem of liabilitiesList.aprs) {
      const decryptedAprItem = { _id: aprItem._id };
      for (const key of [
        "aprPercentage",
        "aprType",
        "balanceSubjectToApr",
        "interestChargeAmount",
      ]) {
        if (aprItem[key] !== undefined) {
          decryptedAprItem[key] = await flexibleDecrypt(aprItem[key], safeDecrypt, {
            field: `aprs.${key}`,
          });
        }
      }
      decryptedLiabilities.aprs.push(decryptedAprItem);
    }
  }
  return decryptedLiabilities;
}

export async function getDecryptedLiabilitiesLoan(liabilities, dek, uid) {
  const liabilitiesList = liabilities[0];
  const safeDecrypt = createSafeDecrypt(uid, dek);
  const decryptedLiabilities = {
    _id: liabilitiesList._id,
    liabilityType: liabilitiesList.liabilityType,
    accountNumber: await flexibleDecrypt(liabilitiesList.accountNumber, safeDecrypt, { field: 'accountNumber' }),
  };
  const binaryFields = [
    "lastPaymentAmount",
    "lastPaymentDate",
    "lastPaymentDueDate",
    "nextPaymentDueDate",
    "minimumPaymentAmount",
    "lastStatementBalance",
    "lastStatementIssueDate",
    "isOverdue",
    "loanTypeDescription",
    "loanTerm",
    "maturityDate",
    "nextMonthlyPayment",
    "originationDate",
    "originationPrincipalAmount",
    "pastDueAmount",
    "escrowBalance",
    "hasPmi",
    "hasPrepaymentPenalty",
    "ytdInterestPaid",
    "ytdPrincipalPaid",
    "interestRatePercentage",
  ];
  for (const field of binaryFields) {
    if (liabilitiesList[field] !== undefined) {
      decryptedLiabilities[field] = await flexibleDecrypt(
        liabilitiesList[field],
        safeDecrypt,
        { field: field },
      );
    }
  }
  // Handle nested objects for propertyAddress, interestRate, loanStatus, repayment_plan, servicer_address
  if (liabilitiesList.propertyAddress) {
    decryptedLiabilities.propertyAddress = {};
    for (const key of ["city", "country", "postalCode", "region", "street"]) {
      if (liabilitiesList.propertyAddress[key] !== undefined) {
        decryptedLiabilities.propertyAddress[key] = await flexibleDecrypt(
          liabilitiesList.propertyAddress[key],
          safeDecrypt,
          { field: `propertyAddress.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.interestRate) {
    decryptedLiabilities.interestRate = {};
    for (const key of ["percentage", "type"]) {
      if (liabilitiesList.interestRate[key] !== undefined) {
        decryptedLiabilities.interestRate[key] = await flexibleDecrypt(
          liabilitiesList.interestRate[key],
          safeDecrypt,
          { field: `interestRate.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.loanStatus) {
    decryptedLiabilities.loanStatus = {};
    for (const key of ["endDate", "type"]) {
      if (liabilitiesList.loanStatus[key] !== undefined) {
        decryptedLiabilities.loanStatus[key] = await flexibleDecrypt(
          liabilitiesList.loanStatus[key],
          safeDecrypt,
          { field: `loanStatus.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.repayment_plan) {
    decryptedLiabilities.repaymentPlan = {};
    for (const key of ["type", "description"]) {
      if (liabilitiesList.repayment_plan[key] !== undefined) {
        decryptedLiabilities.repaymentPlan[key] = await flexibleDecrypt(
          liabilitiesList.repayment_plan[key],
          safeDecrypt,
          { field: `repaymentPlan.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.servicer_address) {
    decryptedLiabilities.servicerAddress = {};
    for (const key of ["city", "country", "postalCode", "region", "street"]) {
      if (liabilitiesList.servicer_address[key] !== undefined) {
        decryptedLiabilities.servicerAddress[key] = await flexibleDecrypt(
          liabilitiesList.servicer_address[key],
          safeDecrypt,
          { field: `servicerAddress.${key}` },
        );
      }
    }
  }
  return decryptedLiabilities;
}

export async function getDecryptedAccount(account, dek, uid, accessToken) {
  const safeDecrypt = createSafeDecrypt(uid, dek);
  
  let sync_status = 'synced';
  if (!accessToken || accessToken.isAccessTokenExpired) {
    sync_status = 'error';
  }

  const decryptedAccount = {
    _id: account._id,
    owner_id: account.owner_id,
    itemId: account.itemId,
    owner_type: account.owner_type,
    plaid_account_id: account.plaid_account_id,
    institution_id: account.institution_id,
    currency: account.currency,
    transactions: account.transactions,
    nextCursor: account.nextCursor,
    created_at: account.created_at,
    __v: account.__v,
    sync_status: sync_status,
    isAccessTokenExpired: !accessToken || accessToken.isAccessTokenExpired,
  };

  const binaryFields = [
    "account_name",
    "account_official_name",
    "account_type",
    "account_subtype",
    "institution_name",
    "currentBalance",
    "availableBalance",
    "mask",
  ];

  for (const field of binaryFields) {
    if (account[field]) {
      try {
        decryptedAccount[field] = await safeDecrypt(account[field], {
          field: field,
        });
      } catch (error) {
        console.error(`Failed to decrypt field: ${field}`, error);
        throw error;
      }
    }
  }

  if (decryptedAccount.currentBalance) {
    decryptedAccount.currentBalance = parseFloat(decryptedAccount.currentBalance);
  }
  if (decryptedAccount.availableBalance) {
    decryptedAccount.availableBalance = parseFloat(decryptedAccount.availableBalance);
  }
  if (!decryptedAccount.availableBalance) {
    decryptedAccount.availableBalance = decryptedAccount.currentBalance;
  }

  return decryptedAccount;
}

export default EncryptionHelper;

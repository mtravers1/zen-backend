import structuredLogger from "./structuredLogger.js";

/**
 * A data healing helper that encrypts a plaintext value and updates the corresponding
 * document in the database. This is designed to be a fire-and-forget background task.
 *
 * @param {object} options - The options for the healing.
 * @param {import('mongoose').Model} options.model - The Mongoose model to update.
 * @param {string} options.docId - The ID of the document to update.
 * @param {string} options.fieldPath - The path to the field to update (e.g., 'merchant.merchantCategory').
 * @param {*} options.value - The plaintext value to encrypt.
 * @param {Function} options.safeEncrypt - The safeEncrypt function to use.
 */
export async function healUnencryptedField({ model, docId, fieldPath, value, safeEncrypt }) {
  try {
    structuredLogger.logInfo("healing_unencrypted_field", {
      doc_id: docId,
      model: model.modelName,
      field: fieldPath,
    });
    const encryptedValue = await safeEncrypt(value, {
      doc_id: docId,
      field: fieldPath,
    });
    
    const update = { $set: { [fieldPath]: encryptedValue } };
    await model.updateOne({ _id: docId }, update);

  } catch (e) {
    structuredLogger.logError("healing_failed", {
      doc_id: docId,
      model: model.modelName,
      field: fieldPath,
      error: e.message,
    });
  }
}
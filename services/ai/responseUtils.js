// Zentavos AI Response Utilities Module
// Provides functions for validating and correcting JSON responses from the LLM.

/**
 * Checks if a string is valid JSON.
 * @param {string} str - The string to validate.
 * @returns {boolean} True if valid JSON, false otherwise.
 */
export function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Uses the LLM to attempt to correct an invalid JSON string.
 * @param {object} params - Parameters including invalidJson, groqClient, and model.
 * @returns {Promise<object|null>} The corrected JSON object, or null if correction fails.
 */
export async function getCorrectedJsonResponse({
  invalidJson,
  groqClient,
  model,
}) {
  try {
    const correctionPrompt = `The following response contains invalid JSON. Please correct any syntax errors and return ONLY the valid JSON object, with no additional text or explanation:
${invalidJson}
Respond with ONLY the corrected JSON object.`;

    const correctionResponse = await groqClient.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a JSON correction assistant. Fix any JSON syntax errors and return ONLY the valid JSON object.",
        },
        { role: "user", content: correctionPrompt },
      ],
      temperature: 0.0,
      max_tokens: 2000,
    });

    const correctedJson =
      correctionResponse.choices[0]?.message?.content?.trim();
    if (correctedJson && isValidJSON(correctedJson)) {
      return JSON.parse(correctedJson);
    }
  } catch (error) {
    console.error("Error getting corrected JSON:", error);
  }
  return null;
}

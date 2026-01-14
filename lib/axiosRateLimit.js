import structuredLogger from "./structuredLogger.js";

const withRetry = async (fn, maxRetries = 5, initialDelay = 1000) => {
  let retries = 0;
  let delay = initialDelay;

  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      const plaidErrorCode = error.response?.data?.error_code;
      const shouldRetry =
        (error.response && error.response.status === 429) ||
        plaidErrorCode === "ITEM_NOT_READY";

      if (shouldRetry && retries < maxRetries) {
        retries++;
        structuredLogger.logWarning(
          `Plaid API call failed with retryable error. Retrying in ${delay}ms...`,
          {
            error_code: plaidErrorCode,
            attempt: retries,
            max_retries: maxRetries,
          },
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
};

export default withRetry;

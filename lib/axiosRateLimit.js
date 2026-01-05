import structuredLogger from "./structuredLogger.js";

const withRetry = async (fn, maxRetries = 5, initialDelay = 1000) => {
  let retries = 0;
  let delay = initialDelay;

  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (error.response && error.response.status === 429) {
        retries++;
        if (retries >= maxRetries) {
          structuredLogger.logError("Plaid API rate limit exceeded. Max retries reached.", { error });
          throw error;
        }

        structuredLogger.logWarning(`Plaid API rate limit exceeded. Retrying in ${delay}ms...`, { error });
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
};

export default withRetry;

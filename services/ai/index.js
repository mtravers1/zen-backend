// Zentavos AI Service - Main Entry Point
// Centralizes all AI-related exports for easy importing

// Core AI service
export { default as aiService } from "./service.js";

// Prompt management
export { buildScreenPrompt, getProductionSystemPrompt } from "./prompts.js";

// Tool system
export { toolFunctions } from "./toolFunctions.js";
export { toolDefinitions } from "./toolDefinitions.js";

// LLM client
export { callLLM } from "./llmClient.js";

// Response utilities
export { isValidJSON, getCorrectedJsonResponse } from "./responseUtils.js";

// Filtering utilities
export { filterTransactions, filterAccounts } from "./filters.js";

// Testing utilities
export {
  testAIIntegration,
  testPrompts,
  testToolDefinitions,
} from "./test-integration.js";
export {
  testHallucinationProtection,
  testValidationFunction,
} from "./test-hallucination-protection.js";

// Serviços específicos
export { default as accountsService } from "../account.service.js";
export { default as businessService } from "../businesses.service.js";
export { default as authService } from "../auth.service.js";
export { default as assetsService } from "../assets.service.js";
export { default as tripService } from "../trips.service.js";

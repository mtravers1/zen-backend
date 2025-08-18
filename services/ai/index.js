// Zentavos AI Service - Main Entry Point
// This file serves as the main entry point for the AI service, exporting all necessary modules.

import aiService from "./service.js";
import { buildScreenPrompt, getProductionSystemPrompt } from "./prompts.js";
import { toolFunctions } from "./toolFunctions.js";
import { callLLM } from "./llmClient.js";
import { isValidJSON, getCorrectedJsonResponse } from "./responseUtils.js";
import { filterTransactions, filterAccounts } from "./filters.js";
import { toolDefinitions } from "./toolDefinitions.js";

// Main service export
export default aiService;

// Individual module exports for advanced use/testing
export {
  buildScreenPrompt,
  getProductionSystemPrompt,
  toolFunctions,
  callLLM,
  isValidJSON,
  getCorrectedJsonResponse,
  filterTransactions,
  filterAccounts,
  toolDefinitions,
}; 
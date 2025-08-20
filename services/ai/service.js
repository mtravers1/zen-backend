// Zentavos AI Service - Centralized Exports
// This module centralizes all AI-related logic for maintainability and clarity.

import { buildScreenPrompt, getProductionSystemPrompt } from "./prompts.js";
import { toolFunctions } from "./toolFunctions.js";
import { callLLM } from "./llmClient.js";
import { isValidJSON, getCorrectedJsonResponse } from "./responseUtils.js";
import { formatFinancialResponse } from "./responseFormatter.js";
import { filterTransactions, filterAccounts } from "./filters.js";
import { toolDefinitions } from "./toolDefinitions.js";

import accountsService from "../accounts.service.js";
import businessService from "../businesses.service.js";
import authService from "../auth.service.js";
import assetsService from "../assets.service.js";
import tripService from "../trips.service.js";
// Circular import prevention - import aiController only when needed
// import aiController from "../../controllers/ai.controller.js";
import { getUserDek } from "../../database/encryption.js";
import User from "../../database/models/User.js";
import dotenv from "dotenv";
import Groq from "groq-sdk";
dotenv.config();

class AIService {
  constructor() {
    // Load model and API key from environment variables and initialize Groq client
    this.GROQ_AI_MODEL = process.env.GROQ_AI_MODEL;
    this.GROQ_API_KEY = process.env.GROQ_API_KEY;
    this.groqClient = new Groq({ apiKey: this.GROQ_API_KEY });
  }

  /**
   * Main entry point for AI requests. Handles prompt construction, LLM call, and tool execution.
   * @param {string} prompt - The user's prompt or system prompt.
   * @param {string} uid - User ID (required).
   * @param {string} profileId - Profile ID (required).
   * @param {Array} incomingMessages - Conversation history/messages.
   * @param {string} screen - Current screen context (optional).
   * @param {object} res - Express response object (optional, for streaming).
   * @returns {Promise<object>} LLM response and related data.
   */
  async makeRequest(
    prompt,
    uid,
    profileId,
    incomingMessages,
    screen,
    res = null,
    dataScreen
  ) {
    try {
      // Validate required parameters
      if (!uid) throw new Error("User ID (uid) is required");
      if (!profileId) throw new Error("Profile ID is required");

      console.log("[AI Service] Starting request with:", { uid, profileId, hasPrompt: !!prompt, screen, dataScreen });

      // Check if environment variables are set
      if (!this.GROQ_API_KEY) {
        console.error("[AI Service] GROQ_API_KEY not set in environment variables");
        throw new Error("AI service not properly configured - missing API key");
      }
      
      if (!this.GROQ_AI_MODEL) {
        console.error("[AI Service] GROQ_AI_MODEL not set in environment variables");
        throw new Error("AI service not properly configured - missing model configuration");
      }

      console.log("[AI Service] Environment variables check passed");

      // Retrieve user and profile context for tool calls
      const dek = await getUserDek(uid);
      const user = await User.findOne({ authUid: uid }).lean();
      if (!user?.email?.[0]?.email) throw new Error("User email not found");
      const email = user.email[0].email;
      const profiles = await businessService.getUserProfiles(email, uid);
      if (!profiles?.length) throw new Error("No profiles found for user");

      console.log("[AI Service] Found profiles:", profiles.length);

      // Find the correct profile by ID (handles personal and business profiles)
      let profile = profiles.find((p) => {
        if (p.isPersonal) {
          return user._id.toString() === profileId;
        }
        return p.id.toString() === profileId;
      });
      // Fallback for legacy/personal profile ID
      if (!profile) {
        if (user && user._id.toString() === profileId) {
          profile = profiles.find((p) => p.isPersonal);
        }
      }
      if (!profile) {
        throw new Error(`Profile with ID ${profileId} not found. Make sure the profile ID is correct.`);
      }

      console.log("[AI Service] Using profile:", { id: profile.id, name: profile.name, isPersonal: profile.isPersonal });

      // Parse screen context for prompt construction
      const baseScreen = (screen || "").split("/")[0] || "";
      const currentDataScreen = dataScreen || (screen || "").split("/")[1];
      const currentScreen = baseScreen.toLowerCase().trim();

      // Build the system and screen prompts
      const screenPrompt = buildScreenPrompt(currentScreen, currentDataScreen);
      const systemPrompt = getProductionSystemPrompt();

      // Construct the message array for the LLM
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: "user", content: `${screenPrompt}\n\nUser question: ${prompt}` },
      ];

      // Use the tool definitions for function calling
      const tools = toolDefinitions;

      // Prepare the context for tool functions (injects user/profile info)
      const toolContext = {
        email,
        profile,
        filterAccounts,
        filterTransactions,
      };
      const toolsImpl = toolFunctions(toolContext);

      console.log("[AI] Calling LLM with messages:", messages);
      // Call the LLM (Groq/vLLM) with all context and tool functions
      let completeResponse = await callLLM({
        apiKey: this.GROQ_API_KEY,
        model: this.GROQ_AI_MODEL,
        messages,
        tools,
        toolFunctions: toolsImpl,
        uid,
        aiController: res ? (await import("../../controllers/ai.controller.js")).default : null,
      });
      console.log("[AI] LLM response:", completeResponse);

      // Validate and correct the LLM response if needed
      let parsedResponse;
      if (isValidJSON(completeResponse)) {
        parsedResponse = JSON.parse(completeResponse);
      } else {
        parsedResponse = await getCorrectedJsonResponse({
          invalidJson: completeResponse,
          groqClient: this.groqClient,
          model: this.GROQ_AI_MODEL,
        });
      }

      // Handle streaming responses if res is provided
      if (res && parsedResponse) {
        const { default: aiController } = await import("../../controllers/ai.controller.js");
        if (aiController) {
          aiController.sendToUser(uid, parsedResponse);
          aiController.sendToUser(uid, "[DONE]");
        }
      }

      // Normalize the response structure for mobile compatibility
      const normalizedResponse = this.normalizeResponse(parsedResponse, completeResponse);
      
      console.log("[AI Service] Final normalized response:", normalizedResponse);
      return normalizedResponse;
      
    } catch (error) {
      console.error("[AI Service] Error in makeRequest:", error);
      
      // Create user-friendly error message
      const userFriendlyError = this.createUserFriendlyError(error, { uid, screen, dataScreen });
      
      // Send error to user if possible
      if (uid && res) {
        try {
          const { default: aiController } = await import("../../controllers/ai.controller.js");
          if (aiController) {
            aiController.sendToUser(uid, userFriendlyError);
            aiController.sendToUser(uid, "[DONE]");
          }
        } catch (sendError) {
          console.error("[AI Service] Failed to send error to user:", sendError);
        }
      }
      
      // Return the user-friendly error instead of throwing
      return userFriendlyError;
    }
  }

  /**
   * Normalizes the response structure to ensure mobile compatibility
   * @param {object} parsedResponse - The parsed LLM response
   * @param {string} completeResponse - The complete raw response
   * @returns {object} Normalized response object
   */
  normalizeResponse(parsedResponse, completeResponse) {
    // If no parsed response, create a fallback
    if (!parsedResponse) {
      return {
        text: "I'm having trouble processing your request. Please try again.",
        data: {},
        error: true,
        errorMessage: "Failed to parse AI response"
      };
    }

    // Ensure we have the required fields for mobile
    let text = parsedResponse.text || parsedResponse.response || "";
    let data = parsedResponse.data || {};
    let error = parsedResponse.error || false;
    let errorMessage = parsedResponse.errorMessage || undefined;

    // If we have no text but have data, create a default text
    if (!text && data && Object.keys(data).length > 0) {
      text = "Here is your requested information.";
    }

    // If we still have no text, provide a fallback
    if (!text) {
      if (error) {
        text = errorMessage || "An error occurred while processing your request.";
      } else {
        text = "I've processed your request but couldn't provide a specific response.";
      }
    }

    // Ensure data is always an object or array
    if (data === null || data === undefined) {
      data = {};
    }

    return {
      text,
      data,
      error,
      errorMessage
    };
  }

  // Helper method to create user-friendly error messages
  createUserFriendlyError(error, context = {}) {
    let errorMessage = "I encountered an issue while processing your request.";
    let suggestion = "";
    
    if (error.message) {
      if (error.message.includes('timeout')) {
        errorMessage = "The request took too long to process.";
        suggestion = "Please try again with a simpler question or wait a moment.";
      } else if (error.message.includes('network') || error.message.includes('connection')) {
        errorMessage = "I'm having trouble connecting to your financial data.";
        suggestion = "Please check your internet connection and try again.";
      } else if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
        errorMessage = "I need to verify your identity to access your financial information.";
        suggestion = "Please log in again or refresh your session.";
      } else if (error.message.includes('permission') || error.message.includes('access')) {
        errorMessage = "I don't have permission to access that information.";
        suggestion = "Please check your account settings or contact support.";
      } else if (error.message.includes('not found') || error.message.includes('404')) {
        errorMessage = "The information you requested wasn't found.";
        suggestion = "Please check if the account or data exists, or try a different question.";
      } else if (error.message.includes('validation') || error.message.includes('invalid')) {
        errorMessage = "There was an issue with the request format.";
        suggestion = "Please try rephrasing your question or be more specific.";
      } else if (error.message.includes('structuredLogger is not defined')) {
        errorMessage = "There's a technical issue with the logging system.";
        suggestion = "This is a backend issue that will be fixed shortly. Please try again in a few minutes.";
      } else if (error.message.includes('tool call') || error.message.includes('function')) {
        errorMessage = "I'm having trouble accessing the specific financial data you requested.";
        suggestion = "Please try asking about different information or rephrase your question.";
      } else if (error.message.includes('database') || error.message.includes('db')) {
        errorMessage = "I'm experiencing database connection issues.";
        suggestion = "Please try again in a moment or contact support if the problem persists.";
      } else if (error.message.includes('encryption') || error.message.includes('decrypt')) {
        errorMessage = "I'm having trouble securely accessing your encrypted data.";
        suggestion = "Please try again or contact support if the issue continues.";
      } else {
        // For other errors, provide a generic but helpful message
        errorMessage = "I'm experiencing technical difficulties.";
        suggestion = "Please try again in a moment or contact support if the problem persists.";
      }
    }

    const fullMessage = suggestion ? `${errorMessage} ${suggestion}` : errorMessage;

    return {
      error: true,
      text: fullMessage,
      data: {},
      errorMessage: error.message || "Unknown error occurred"
    };
  }
}

const aiService = new AIService();

export default aiService;
// Export helpers for advanced use/testing
export {
  buildScreenPrompt,
  toolFunctions,
  callLLM,
  isValidJSON,
  getCorrectedJsonResponse,
  filterTransactions,
  filterAccounts,
  formatFinancialResponse,
  AIService,
}; 
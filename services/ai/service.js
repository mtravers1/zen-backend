// Zentavos AI Service - Centralized Exports
// This module centralizes all AI-related logic for maintainability and clarity.

import { buildScreenPrompt, getProductionSystemPrompt } from "./prompts.js";
import { toolFunctions } from "./toolFunctions.js";
import { callLLM } from "./llmClient.js";
import { isValidJSON, getCorrectedJsonResponse } from "./responseUtils.js";
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
        { role: "user", content: screenPrompt },
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

      // Backend fallback: Only if the LLM did not call a tool or returned invalid JSON
      // This should be rare; the LLM is expected to handle all normal cases
      const llmDidNotCallTool = !parsedResponse || (parsedResponse && parsedResponse.data && Object.keys(parsedResponse.data).length === 0);
      if (llmDidNotCallTool) {
        console.warn('[AI][Fallback] LLM did not call a tool or returned invalid JSON. Sending generic fallback message.');
        
        // Check if we have any content from the LLM
        if (completeResponse && completeResponse.trim()) {
          // Try to extract meaningful content from the LLM response
          const fallbackResponse = {
            text: completeResponse.trim() || 'Sorry, I was unable to retrieve your financial information. Please try rephrasing your question or ask about something else.',
            data: {}
          };
          
          // Only use aiController if we have a response object for streaming
          if (res) {
            const { default: aiController } = await import("../../controllers/ai.controller.js");
            if (aiController) {
              aiController.sendToUser(uid, fallbackResponse);
              aiController.sendToUser(uid, "[DONE]");
            }
          }
          
          return fallbackResponse;
        } else {
          // No content at all from LLM
          const fallbackResponse = {
            text: 'Sorry, I was unable to retrieve your financial information. Please try rephrasing your question or ask about something else.',
            data: {}
          };
          
          // Only use aiController if we have a response object for streaming
          if (res) {
            const { default: aiController } = await import("../../controllers/ai.controller.js");
            if (aiController) {
              aiController.sendToUser(uid, fallbackResponse);
              aiController.sendToUser(uid, "[DONE]");
            }
          }
          
          return fallbackResponse;
        }
      }

      // Send the parsed response to the user (via SSE or other mechanism)
      if (parsedResponse && res) {
        const { default: aiController } = await import("../../controllers/ai.controller.js");
        if (aiController) {
          aiController.sendToUser(uid, parsedResponse);
          aiController.sendToUser(uid, "[DONE]");
        }
      } else if (parsedResponse && !res) {
        // For non-streaming requests, just log the response
        console.log("[AI] Non-streaming response:", parsedResponse);
      } else {
        const errorResponse = {
          error: "Invalid response format",
          originalResponse: completeResponse,
          details: "Could not parse or correct the JSON response.",
        };
        
        if (res) {
          const { default: aiController } = await import("../../controllers/ai.controller.js");
          if (aiController) {
            aiController.sendToUser(uid, errorResponse);
            aiController.sendToUser(uid, "[DONE]");
          }
        }
        console.error("[AI] Error response:", errorResponse);
      }
      
      console.log("[AI] Done processing response");
      console.log("[AI] Parsed response:", parsedResponse);
      
      // Ensure we always return a valid response object
      if (!parsedResponse) {
        parsedResponse = {
          text: "Response processed but no data returned",
          data: {},
          error: false
        };
      }
      
      // Ensure the response has the required structure
      if (!parsedResponse.text && !parsedResponse.response) {
        if (parsedResponse.error) {
          parsedResponse.text = parsedResponse.errorMessage || "An error occurred while processing your request";
        } else if (parsedResponse.data && Object.keys(parsedResponse.data).length > 0) {
          parsedResponse.text = "Here is your requested information";
        } else {
          parsedResponse.text = "I've processed your request but couldn't provide a specific response";
        }
      }
      
      // Normalize the response structure
      const normalizedResponse = {
        text: parsedResponse.text || parsedResponse.response || "No response received",
        data: parsedResponse.data || {},
        error: parsedResponse.error || false,
        errorMessage: parsedResponse.errorMessage || undefined
      };
      
      console.log("[AI Service] Final normalized response:", normalizedResponse);
      return normalizedResponse;
    } catch (error) {
      console.error("[AI Service] Error in makeRequest:", error);
      
      // Send error to user if possible
      if (uid && res) {
        try {
          const { default: aiController } = await import("../../controllers/ai.controller.js");
          if (aiController) {
            aiController.sendToUser(uid, {
              error: true,
              text: `Error: ${error.message}`,
              data: {}
            });
            aiController.sendToUser(uid, "[DONE]");
          }
        } catch (sendError) {
          console.error("[AI Service] Failed to send error to user:", sendError);
        }
      } else if (uid && !res) {
        // For non-streaming requests, just log the error
        console.error("[AI Service] Error in non-streaming request:", error.message);
      }
      
      // Re-throw the error so the controller can handle it
      throw error;
    }
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
  AIService,
}; 
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
    dataScreen,
    context = {}
  ) {
    try {
      // Validate required parameters
      if (!uid) throw new Error("User ID (uid) is required");
      if (!profileId) throw new Error("Profile ID is required");

      console.log("[AI Service] Starting request with:", { uid, profileId, hasPrompt: !!prompt, screen, dataScreen, hasContext: !!context, contextKeys: context ? Object.keys(context) : [] });

      // Log context details if available
      if (context) {
        console.log("🔍 [AI Service] Context received:", {
          screen: context.screen,
          device: context.device,
          time: context.time,
          user: context.user,
          chat: context.chat,
          contextSize: JSON.stringify(context).length
        });
      }

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

      console.log('\n🔍 [AI Service] ====== PROFILE LOOKUP DEBUG ======');
      console.log("[AI Service] Profile lookup details:", {
        profileId,
        userId: user._id.toString(),
        profilesCount: profiles.length,
        profileIds: profiles.map(p => ({ id: p.id, isPersonal: p.isPersonal, name: p.name }))
      });
      
      // Find the correct profile by ID (handles personal and business profiles)
      let profile = profiles.find((p) => {
        if (p.isPersonal) {
          const match = user._id.toString() === profileId;
          console.log(`[AI Service] Checking personal profile: ${p.id} (${p.name}) - user._id (${user._id}) === profileId (${profileId}) = ${match}`);
          return match;
        }
        const match = p.id.toString() === profileId;
        console.log(`[AI Service] Checking business profile: ${p.id} (${p.name}) - p.id (${p.id}) === profileId (${profileId}) = ${match}`);
        return match;
      });
      
      // Fallback for legacy/personal profile ID
      if (!profile) {
        console.log("[AI Service] No profile found with primary logic, trying fallback...");
        if (user && user._id.toString() === profileId) {
          profile = profiles.find((p) => p.isPersonal);
          console.log(`[AI Service] Fallback found personal profile:`, profile ? { id: profile.id, name: profile.name } : 'null');
        }
      }
      
      if (!profile) {
        console.error("[AI Service] Profile lookup failed completely");
        console.error("[AI Service] Available profiles:", profiles.map(p => ({ id: p.id, isPersonal: p.isPersonal, name: p.name })));
        console.error("[AI Service] Requested profileId:", profileId);
        console.error("[AI Service] User ID:", user._id.toString());
        throw new Error(`Profile with ID ${profileId} not found. Make sure the profile ID is correct.`);
      }

      console.log("[AI Service] ✅ Profile found successfully:", { 
        id: profile.id, 
        name: profile.name, 
        isPersonal: profile.isPersonal,
        hasPlaidAccounts: profile.plaidAccounts ? profile.plaidAccounts.length : 0
      });

      // Parse screen context for prompt construction
      const baseScreen = (screen || "").split("/")[0] || "";
      const currentDataScreen = dataScreen || (screen || "").split("/")[1];
      const currentScreen = baseScreen.toLowerCase().trim();

      console.log("🔍 [AI Service] Request analysis:", {
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        hasContext: !!context,
        contextKeys: context ? Object.keys(context) : [],
        screen: currentScreen,
        dataScreen: currentDataScreen
      });

      // Build the system and screen prompts
      const screenPrompt = buildScreenPrompt(currentScreen, currentDataScreen);
      const systemPrompt = getProductionSystemPrompt(currentScreen);

      // Enhance prompts with rich context from mobile
      let enhancedScreenPrompt = screenPrompt;
      if (context && Object.keys(context).length > 0) {
        console.log("🔍 [AI Service] Rich context received from mobile:", {
          contextKeys: Object.keys(context),
          screen: context.screen,
          device: context.device,
          time: context.time,
          user: context.user
        });
        
        // Build context information only for fields that have meaningful values
        const contextInfo = [];
        
        // Screen Information (only if meaningful)
        if (context.screen?.currentScreen && context.screen.currentScreen !== 'unknown') {
          contextInfo.push(`**Current Screen**: ${context.screen.currentScreen}`);
        }
        if (context.screen?.dataScreen && context.screen.dataScreen !== 'unknown' && context.screen.dataScreen !== 'overview') {
          contextInfo.push(`**Active View**: ${context.screen.dataScreen}`);
        }
        
        // Device Information (only if meaningful)
        if (context.device?.platform && context.device.platform !== 'unknown') {
          contextInfo.push(`**Platform**: ${context.device.platform}`);
        }
        if (context.device?.appVersion && context.device.appVersion !== 'unknown') {
          contextInfo.push(`**App Version**: ${context.device.appVersion}`);
        }
        
        // Time Information (only if meaningful)
        if (context.time?.dayOfWeek) {
          contextInfo.push(`**Today**: ${context.time.dayOfWeek}`);
        }
        if (context.time?.isBusinessHours !== undefined) {
          contextInfo.push(`**Business Hours**: ${context.time.isBusinessHours ? 'Yes' : 'No'}`);
        }
        
        // User Information (only if meaningful)
        if (context.user?.profileName && context.user.profileName !== 'Unknown') {
          contextInfo.push(`**Profile**: ${context.user.profileName}`);
        }
        
        // Chat Information (only if meaningful)
        if (context.chat?.messageCount > 0) {
          contextInfo.push(`**Chat History**: ${context.chat.messageCount} messages`);
        }
        
        // Only add context section if we have meaningful information
        if (contextInfo.length > 0) {
          enhancedScreenPrompt = `${screenPrompt}

## 📱 CONTEXT INFORMATION

${contextInfo.join('\n')}

**IMPORTANT**: Use this context to provide personalized responses. Answer context questions directly without tools when possible.`;
        }
      }

      // Construct the message array for the LLM
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: "user", content: `${enhancedScreenPrompt}\n\nUser question: ${prompt}` },
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

      console.log('\n🚀 [AI Service] ====== CALLING LLM ======');
      console.log("[AI] Calling LLM with messages:", messages);
      console.log("[AI Service] User question:", prompt);
      console.log("[AI Service] Screen context:", screen, dataScreen);
      
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
      
      console.log('\n📥 [AI Service] ====== LLM RESPONSE RECEIVED ======');
      console.log("[AI] LLM response:", completeResponse);
      console.log("[AI Service] Response length:", completeResponse?.length || 0);
      console.log("[AI Service] Response type:", typeof completeResponse);

      // Validate and correct the LLM response if needed
      let parsedResponse;
      if (isValidJSON(completeResponse)) {
        try {
          parsedResponse = JSON.parse(completeResponse);
        } catch (parseError) {
          console.error("[AI Service] JSON parsing failed despite validation:", parseError.message);
          console.log("[AI Service] Failed response content:", completeResponse);
          
          // Try to clean and parse again
          parsedResponse = await getCorrectedJsonResponse({
            invalidJson: completeResponse,
            groqClient: this.groqClient,
            model: this.GROQ_AI_MODEL,
          });
        }
      } else {
        console.warn("[AI Service] Response is not valid JSON, attempting correction");
        parsedResponse = await getCorrectedJsonResponse({
          invalidJson: completeResponse,
          groqClient: this.groqClient,
          model: this.GROQ_AI_MODEL,
        });
      }

      console.log('\n🔍 [AI Service] ====== VALIDATING RESPONSE ======');
      
      // Check for cut-off responses
      if (parsedResponse.text && (
        parsedResponse.text.includes('cut off') || 
        parsedResponse.text.includes('response was cut') || 
        parsedResponse.text.includes('my response was cut') ||
        parsedResponse.text.includes('I apologize, but my response was cut off')
      )) {
        console.warn('[AI Service] 🚨 CUT-OFF RESPONSE DETECTED in parsed response');
        
        // Try to fix the response by removing the cut-off part
        const fixedText = parsedResponse.text.split(/cut off|response was cut|my response was cut|I apologize, but my response was cut off/i)[0].trim();
        
        if (fixedText && fixedText.length > 10) {
          console.log('[AI Service] ✅ Fixed cut-off response:', fixedText.substring(0, 100) + '...');
          parsedResponse.text = fixedText;
        } else {
          console.warn('[AI Service] ⚠️ Could not fix cut-off response, using fallback');
          parsedResponse.text = "I'm sorry, I encountered an issue with my response. Please try asking your question again.";
          parsedResponse.error = true;
        }
      }
      
      // CRITICAL: Validate that we're returning real data, not hallucinations
      if (parsedResponse && parsedResponse.data && Object.keys(parsedResponse.data).length > 0) {
        console.log("[AI Service] Response has data with keys:", Object.keys(parsedResponse.data));
        console.log("[AI Service] Response source:", parsedResponse.source);
        
        // Check if this is marked as real tool data
        if (parsedResponse.source === 'tool_result' || 
            parsedResponse.source === 'tool_result_fallback' || 
            parsedResponse.source === 'tool_result_error_fallback') {
          console.log("[AI Service] ✅ Response contains real tool data - safe to return");
        } else if (parsedResponse.source === 'llm_general_knowledge') {
          console.log("[AI Service] ⚠️ Response is general knowledge - no financial data");
        } else {
          console.warn("[AI Service] ⚠️ Response source unclear - may contain hallucinations");
          // If we can't verify the source, be conservative and mark as potentially unreliable
          parsedResponse.warning = "This response may contain AI-generated content and should be verified";
        }
      } else {
        console.warn("[AI Service] ⚠️ Response has no data or empty data");
        if (parsedResponse) {
          console.log("[AI Service] Response structure:", {
            hasText: !!parsedResponse.text,
            hasData: !!parsedResponse.data,
            dataType: typeof parsedResponse.data,
            source: parsedResponse.source
          });
        }
      }

      // Enhanced response processing with LLM self-evaluation
      const processedResponse = await this.processLLMResponse(parsedResponse, prompt, profileId, context);

      // Handle streaming responses if res is provided
      if (res && processedResponse) {
        const { default: aiController } = await import("../../controllers/ai.controller.js");
        if (aiController) {
          aiController.sendToUser(uid, processedResponse);
          aiController.sendToUser(uid, "[DONE]");
        }
      }

      console.log('\n🎯 [AI Service] ====== NORMALIZING RESPONSE ======');
      
      // Ensure consistent response structure for mobile compatibility
      const normalizedResponse = this.normalizeResponse(processedResponse, completeResponse);
      
      // Validate and fix response structure before returning
      const finalResponse = this.ensureConsistentResponseStructure(normalizedResponse);
      
      console.log('\n🎉 [AI Service] ====== FINAL NORMALIZED RESPONSE ======');
      console.log("[AI Service] Final response structure:", {
        hasText: !!finalResponse.text,
        textLength: finalResponse.text?.length || 0,
        hasResponse: !!finalResponse.response,
        responseLength: finalResponse.response?.length || 0,
        hasData: !!finalResponse.data,
        dataKeys: finalResponse.data ? Object.keys(finalResponse.data) : [],
        source: finalResponse.source,
        hasWarning: !!finalResponse.warning,
        hasError: !!finalResponse.error,
        errorMessage: finalResponse.errorMessage
      });
      console.log("[AI Service] Final normalized response:", finalResponse);
      return finalResponse;
      
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

  // Enhanced response processing with LLM self-evaluation
  async processLLMResponse(llmResponse, userMessage, profileId, context = {}) {
    try {
      console.log("🔍 [AI Service] Processing LLM response with self-evaluation");
      console.log("🔍 [AI Service] User context received:", context);
      console.log("🔍 [AI Service] LLM Response structure:", {
        hasResponse: !!llmResponse?.response,
        hasText: !!llmResponse?.text,
        hasData: !!llmResponse?.data,
        responseType: typeof llmResponse?.response,
        textType: typeof llmResponse?.text,
        dataType: typeof llmResponse?.data,
        fullResponse: llmResponse
      });
      
      // Validate llmResponse structure
      if (!llmResponse || typeof llmResponse !== 'object') {
        console.error("❌ [AI Service] Invalid llmResponse structure:", llmResponse);
        return this.createFallbackResponse("Invalid response structure");
      }
      
      // Ensure response property exists - support both 'text' and 'response' properties
      const responseText = llmResponse.response || llmResponse.text;
      if (!responseText || typeof responseText !== 'string') {
        console.error("❌ [AI Service] Missing or invalid response property:", {
          hasResponse: !!llmResponse.response,
          hasText: !!llmResponse.text,
          responseType: typeof llmResponse.response,
          textType: typeof llmResponse.text,
          responseValue: llmResponse.response,
          textValue: llmResponse.text
        });
        return this.createFallbackResponse("Missing response content");
      }
      
      // Normalize the response structure to use 'response' property
      const normalizedResponse = {
        ...llmResponse,
        response: responseText,
        text: responseText // Ensure both properties exist
      };
      
      // Check if response contains unnecessary apologies or cut-off mentions
      const hasUnnecessaryApologies = (
        normalizedResponse.response.includes('I apologize') ||
        normalizedResponse.response.includes('I\'m sorry') ||
        normalizedResponse.response.includes('my response was cut off') ||
        normalizedResponse.response.includes('Please try asking your question again') ||
        normalizedResponse.response.includes('response was cut') ||
        normalizedResponse.response.includes('cut off') ||
        normalizedResponse.response.includes('apologize') ||
        normalizedResponse.response.includes('sorry')
      );
      
      // Check if response actually has useful content
      const hasUsefulContent = (
        // Financial data indicators
        normalizedResponse.response.includes('$') ||
        normalizedResponse.response.includes('net worth') ||
        normalizedResponse.response.includes('balance') ||
        normalizedResponse.response.includes('transactions') ||
        normalizedResponse.response.includes('accounts') ||
        normalizedResponse.response.includes('assets') ||
        normalizedResponse.response.includes('liabilities') ||
        normalizedResponse.response.includes('income') ||
        normalizedResponse.response.includes('expenses') ||
        normalizedResponse.response.includes('savings') ||
        normalizedResponse.response.includes('investments') ||
        normalizedResponse.response.includes('debt') ||
        normalizedResponse.response.includes('credit') ||
        normalizedResponse.response.includes('cash') ||
        normalizedResponse.response.includes('bank') ||
        // Numeric data
        /\d+/.test(normalizedResponse.response) ||
        // Data arrays
        (normalizedResponse.data && Array.isArray(normalizedResponse.data) && normalizedResponse.data.length > 0) ||
        // Specific financial terms
        normalizedResponse.response.includes('portfolio') ||
        normalizedResponse.response.includes('budget') ||
        normalizedResponse.response.includes('spending') ||
        normalizedResponse.response.includes('revenue') ||
        normalizedResponse.response.includes('profit') ||
        normalizedResponse.response.includes('loss') ||
        // Context information
        normalizedResponse.response.includes('screen') ||
        normalizedResponse.response.includes('dashboard') ||
        normalizedResponse.response.includes('page') ||
        normalizedResponse.response.includes('tab') ||
        normalizedResponse.response.includes('time') ||
        normalizedResponse.response.includes('day') ||
        normalizedResponse.response.includes('device') ||
        normalizedResponse.response.includes('platform') ||
        normalizedResponse.response.includes('app') ||
        normalizedResponse.response.includes('version') ||
        // General helpful content
        normalizedResponse.response.includes('You are currently') ||
        normalizedResponse.response.includes('You\'re currently') ||
        normalizedResponse.response.includes('You\'re on the') ||
        normalizedResponse.response.includes('You are on the') ||
        normalizedResponse.response.includes('The current time is') ||
        normalizedResponse.response.includes('Today is') ||
        normalizedResponse.response.includes('You\'re using the') ||
        normalizedResponse.response.includes('This screen shows') ||
        normalizedResponse.response.includes('Here is your') ||
        normalizedResponse.response.includes('Based on your') ||
        normalizedResponse.response.includes('Your account') ||
        normalizedResponse.response.includes('Your profile') ||
        normalizedResponse.response.includes('Your financial') ||
        normalizedResponse.response.includes('Your current') ||
        normalizedResponse.response.includes('Your recent') ||
        normalizedResponse.response.includes('Your total') ||
        normalizedResponse.response.includes('Your balance') ||
        normalizedResponse.response.includes('Your net worth') ||
        normalizedResponse.response.includes('Your transactions') ||
        normalizedResponse.response.includes('Your accounts') ||
        normalizedResponse.response.includes('Your assets') ||
        normalizedResponse.response.includes('Your liabilities') ||
        normalizedResponse.response.includes('Your income') ||
        normalizedResponse.response.includes('Your expenses') ||
        normalizedResponse.response.includes('Your savings') ||
        normalizedResponse.response.includes('Your investments') ||
        normalizedResponse.response.includes('Your debt') ||
        normalizedResponse.response.includes('Your credit') ||
        normalizedResponse.response.includes('Your cash') ||
        normalizedResponse.response.includes('Your bank')
      );
      
      // If response has useful content but contains unnecessary apologies, clean it up
      if (hasUsefulContent && hasUnnecessaryApologies) {
        console.log("⚠️ [AI Service] Response has useful content but unnecessary apologies - cleaning up");
        
        let cleanedResponse = normalizedResponse.response;
        
        // Remove common apology patterns - more aggressive cleaning
        const apologyPatterns = [
          /I apologize,? but my response was cut off\.? Please try asking your question again\.?/gi,
          /I'm sorry,? but my response was cut off\.? Please try asking your question again\.?/gi,
          /my response was cut off\.? Please try asking your question again\.?/gi,
          /response was cut off\.? Please try asking your question again\.?/gi,
          /cut off\.? Please try asking your question again\.?/gi,
          /Please try asking your question again\.?/gi,
          /I apologize,? but my response was cut off\.?/gi,
          /I'm sorry,? but my response was cut off\.?/gi,
          /my response was cut off\.?/gi,
          /response was cut off\.?/gi,
          /I apologize,? but/gi,
          /I'm sorry,? but/gi,
          /I apologize\.?/gi,
          /I'm sorry\.?/gi,
          /but my response was cut off/gi,
          /my response was cut off/gi,
          /response was cut off/gi,
          /was cut off/gi,
          /cut off/gi,
          // Additional patterns for complete cleanup
          /I apologize,? but/gi,
          /I'm sorry,? but/gi,
          /I apologize\.?/gi,
          /I'm sorry\.?/gi,
          /apologize,? but/gi,
          /sorry,? but/gi,
          /apologize\.?/gi,
          /sorry\.?/gi,
          /but my response was cut off/gi,
          /my response was cut off/gi,
          /response was cut off/gi,
          /was cut off/gi,
          /cut off/gi,
          /Please try asking your question again/gi,
          /try asking your question again/gi,
          /asking your question again/gi,
          /your question again/gi,
          /question again/gi,
          /again/gi
        ];
        
        // Apply each pattern to clean the response
        apologyPatterns.forEach(pattern => {
          cleanedResponse = cleanedResponse.replace(pattern, '');
        });
        
        // Clean up any double spaces, periods, or commas that might be left
        cleanedResponse = cleanedResponse
          .replace(/\s{2,}/g, ' ')  // Replace multiple spaces with single space
          .replace(/\.{2,}/g, '.')  // Replace multiple periods with single period
          .replace(/\s+\./g, '.')   // Remove spaces before periods
          .replace(/,\s*,/g, ',')   // Remove double commas
          .replace(/\.\s*,/g, '.')  // Remove comma after period
          .replace(/,\s*\./g, '.')  // Remove period after comma
          .trim();
        
        // Remove trailing commas or periods
        cleanedResponse = cleanedResponse.replace(/[,.]$/, '');
        
        // Final cleanup - remove any remaining apology-like phrases
        cleanedResponse = cleanedResponse
          .replace(/I apologize,?/gi, '')
          .replace(/I'm sorry,?/gi, '')
          .replace(/apologize,?/gi, '')
          .replace(/sorry,?/gi, '')
          .replace(/my response was cut off/gi, '')
          .replace(/response was cut off/gi, '')
          .replace(/was cut off/gi, '')
          .replace(/cut off/gi, '')
          .replace(/Please try asking your question again/gi, '')
          .replace(/try asking your question again/gi, '')
          .replace(/asking your question again/gi, '')
          .replace(/your question again/gi, '')
          .replace(/question again/gi, '')
          .replace(/again/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        
        console.log("✅ [AI Service] Cleaned response:", {
          original: normalizedResponse.response.substring(0, 100) + '...',
          cleaned: cleanedResponse.substring(0, 100) + '...'
        });
        
        // Return cleaned response with consistent structure
        return {
          ...normalizedResponse,
          response: cleanedResponse,
          text: cleanedResponse,
          error: false,
          errorMessage: null
        };
      }
      
      // Check if response is just an empty apology (no useful content)
      const isJustApology = (
        !hasUsefulContent &&
        (normalizedResponse.response.includes('I apologize') ||
         normalizedResponse.response.includes('I\'m sorry') ||
         normalizedResponse.response.includes('apologize') ||
         normalizedResponse.response.includes('sorry') ||
         normalizedResponse.response.includes('cut off') ||
         normalizedResponse.response.includes('Please try asking your question again') ||
         normalizedResponse.response.includes('try asking your question again') ||
         normalizedResponse.response.includes('asking your question again') ||
         normalizedResponse.response.includes('your question again') ||
         normalizedResponse.response.includes('question again') ||
         normalizedResponse.response.includes('again'))
      );
      
      // If response is just an apology with no useful content, provide a helpful fallback
      if (isJustApology) {
        console.log("⚠️ [AI Service] Response is just an apology with no useful content - providing fallback");
        
        // Try to provide context-based help
        if (context && context.screen) {
          const currentScreen = context.screen.currentScreen || 'dashboard';
          const dataScreen = context.screen.dataScreen;
          
          // Build a clean, direct response
          let contextResponse = `You are currently on the **${currentScreen}** screen`;
          
          // Only add dataScreen if it's meaningful and different from currentScreen
          if (dataScreen && dataScreen !== 'unknown' && dataScreen !== 'overview' && dataScreen !== currentScreen) {
            contextResponse += ` with the **${dataScreen}** view active`;
          }
          
          contextResponse += '. How can I help you with your finances today?';
          
          return {
            response: contextResponse,
            text: contextResponse,
            data: {},
            error: false,
            errorMessage: null,
            needsClarification: false,
            suggestedQuestions: [
              "What's my current net worth?",
              "Show me my recent transactions",
              "What's my account balance?",
              "How am I doing financially?"
            ]
          };
        }
        
        // Generic helpful response
        return {
          response: "I'm here to help you with your finances! What would you like to know?",
          text: "I'm here to help you with your finances! What would you like to know?",
          data: {},
          error: false,
          errorMessage: null,
          needsClarification: false,
          suggestedQuestions: [
            "What's my current net worth?",
            "Show me my recent transactions",
            "What's my account balance?",
            "How am I doing financially?"
          ]
        };
      }
      
      // If no cleaning needed, return normalized response with consistent structure
      return {
        ...normalizedResponse,
        error: false,
        errorMessage: null,
        needsClarification: false,
        suggestedQuestions: []
      };

    } catch (error) {
      console.error("❌ [AI Service] Error in LLM response processing:", error);
      return this.createFallbackResponse("Error processing response");
    }
  }
  
  // Helper method to create consistent fallback responses
  createFallbackResponse(errorMessage) {
    return {
      response: "I encountered an issue processing your request. Please try again.",
      text: "I encountered an issue processing your request. Please try again.",
      data: {},
      error: true,
      errorMessage: errorMessage,
      needsClarification: false,
      suggestedQuestions: [],
      source: "error_fallback"
    };
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
      console.warn("[AI Service] No parsed response available, creating fallback");
      return {
        text: "I'm having trouble processing your request. Please try again.",
        response: "I'm having trouble processing your request. Please try again.",
        data: {},
        error: true,
        errorMessage: "Failed to parse AI response",
        source: "normalization_fallback",
        needsClarification: false,
        suggestedQuestions: []
      };
    }

    // CRITICAL: Always prioritize real tool data over any other data
    let text = parsedResponse.text || parsedResponse.response || "";
    let data = parsedResponse.data || {};
    let error = parsedResponse.error || false;
    let errorMessage = parsedResponse.errorMessage || undefined;
    let source = parsedResponse.source || "unknown";
    let warning = parsedResponse.warning || undefined;

    // If we have real tool data, ensure it's the primary data
    if (source.includes('tool_result') && data && Object.keys(data).length > 0) {
      console.log("[AI Service] ✅ Using real tool data as primary data source");
      
      // Ensure text is appropriate for the real data
      if (!text || text.trim() === '') {
        text = "Here is your requested information based on your actual financial data.";
      }
      
      // Mark this as verified real data
      source = "verified_tool_result";
      warning = undefined; // Clear any warnings since we have real data
    } else if (source === 'llm_general_knowledge') {
      console.log("[AI Service] ⚠️ Response is general knowledge - no financial data");
      warning = "This response is based on general knowledge and may not be specific to your financial data";
    } else if (!source.includes('tool_result')) {
      console.warn("[AI Service] ⚠️ Response source unclear - may contain hallucinations");
      warning = "This response may contain AI-generated content and should be verified";
    }

    // Validate data structure
    if (data && typeof data === 'object') {
      // Check for common data corruption issues
      const dataKeys = Object.keys(data);
      if (dataKeys.length > 0) {
        // Validate that data values are not corrupted
        for (const [key, value] of Object.entries(data)) {
          if (value === null || value === undefined) {
            console.warn(`[AI Service] Data field '${key}' has null/undefined value, removing to prevent corruption`);
            delete data[key];
          }
        }
      }
    }

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

    // Clean up the text to remove any remaining "unknown" or empty references
    if (text) {
      text = text
        .replace(/with the \*\*unknown\*\* view active/g, '')
        .replace(/with the \*\*overview\*\* view active/g, '')
        .replace(/view active\./g, '.')
        .replace(/view active\?/g, '?')
        .replace(/view active!/g, '!')
        .replace(/view active$/g, '')
        .replace(/on the \*\*unknown\*\* screen/g, 'on the dashboard screen')
        .replace(/on the \*\*overview\*\* screen/g, 'on the dashboard screen')
        .replace(/\*\*unknown\*\*/g, '')
        .replace(/\*\*overview\*\*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      // Remove trailing punctuation that might be left after cleanup
      text = text.replace(/[,.]$/, '');
    }

    // Ensure data is always an object or array
    if (data === null || data === undefined) {
      data = {};
    }

    return {
      text,
      response: text, // Ensure both text and response exist
      data,
      error,
      errorMessage,
      source,
      warning,
      needsClarification: false,
      suggestedQuestions: []
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

  // Helper method to ensure consistent response structure for mobile compatibility
  ensureConsistentResponseStructure(response) {
    // Ensure 'text' and 'response' are the same
    if (response.text && response.response && response.text !== response.response) {
      response.response = response.text;
    }

    // Ensure 'data' is always an object, even if null
    if (response.data === null || response.data === undefined) {
      response.data = {};
    }

    // Ensure 'error' is a boolean
    if (response.error === null || response.error === undefined) {
      response.error = false;
    }

    // Ensure 'errorMessage' is a string or null
    if (response.errorMessage === null || response.errorMessage === undefined) {
      response.errorMessage = null;
    }

    // Ensure 'needsClarification' is a boolean
    if (response.needsClarification === null || response.needsClarification === undefined) {
      response.needsClarification = false;
    }

    // Ensure 'suggestedQuestions' is an array
    if (response.suggestedQuestions === null || response.suggestedQuestions === undefined) {
      response.suggestedQuestions = [];
    }

    // Ensure 'warning' is a string or null
    if (response.warning === null || response.warning === undefined) {
      response.warning = null;
    }

    // Ensure 'source' is a string
    if (response.source === null || response.source === undefined) {
      response.source = "unknown";
    }

    return response;
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
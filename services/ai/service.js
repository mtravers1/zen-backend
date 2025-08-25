// Zentavos AI Service - Centralized Exports
// This module centralizes all AI-related logic for maintainability and clarity.

import { buildScreenPrompt, getProductionSystemPrompt, getSimplifiedSystemPrompt } from "./prompts.js";
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
    
    console.log(`[AI Service] 🔧 Constructor - Environment variables:`, {
      hasModel: !!this.GROQ_AI_MODEL,
      model: this.GROQ_AI_MODEL,
      hasApiKey: !!this.GROQ_API_KEY,
      apiKeyPreview: this.GROQ_API_KEY ? `${this.GROQ_API_KEY.substring(0, 10)}...` : 'none'
    });
    
    if (!this.GROQ_API_KEY) {
      console.error(`[AI Service] ❌ GROQ_API_KEY not found in environment variables`);
      console.error(`[AI Service] Available env vars:`, Object.keys(process.env).filter(key => key.includes('GROQ')));
    }
    
    if (!this.GROQ_AI_MODEL) {
      console.error(`[AI Service] ❌ GROQ_AI_MODEL not found in environment variables`);
    }
    
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
  // Validate request parameters
  validateRequestParams(params) {
    const {
      prompt,
      uid,
      profileId,
      incomingMessages,
      screen,
      dataScreen
    } = params;

    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Required fields
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      validation.isValid = false;
      validation.errors.push('Prompt is required and must be a non-empty string');
    }

    if (!uid) {
      validation.isValid = false;
      validation.errors.push('User ID is required');
    }

    if (!profileId) {
      validation.isValid = false;
      validation.errors.push('Profile ID is required');
    }

    // Optional fields with type validation
    if (incomingMessages !== undefined && !Array.isArray(incomingMessages)) {
      validation.warnings.push('Messages should be an array');
    }

    if (screen !== undefined && typeof screen !== 'string') {
      validation.warnings.push('Screen should be a string');
    }

    if (dataScreen !== undefined && typeof dataScreen !== 'string') {
      validation.warnings.push('Data screen should be a string');
    }

    return validation;
  }

  async makeRequest(
    prompt,
    uid,
    profileId,
    incomingMessages,
    screen,
    res = null,
    dataScreen,
    context = {},
    requestId = null
  ) {
    const startTime = Date.now();
    
    console.log('\n🚀 [AI Service] ====== STARTING AI CHAT PROCESS ======');
    console.log(`[AI Service] Request ID: ${requestId || 'not_provided'}`);
    console.log(`[AI Service] Timestamp: ${new Date().toISOString()}`);
    console.log(`[AI Service] Input parameters:`, {
      hasPrompt: !!prompt,
      promptLength: prompt?.length,
      promptPreview: prompt ? prompt.substring(0, 100) + '...' : 'NO_PROMPT',
      hasUid: !!uid,
      uid,
      hasProfileId: !!profileId,
      profileId,
      hasMessages: !!incomingMessages,
      messagesCount: incomingMessages?.length || 0,
      hasScreen: !!screen,
      screen,
      hasDataScreen: !!dataScreen,
      dataScreen,
      hasContext: !!context,
      contextKeys: context ? Object.keys(context) : [],
      contextSize: context ? JSON.stringify(context).length : 0
    });

    // STEP 1: PREPARING USER CONTEXT
    console.log('\n🔍 [AI Service] ====== STEP 1: PREPARING USER CONTEXT ======');
    
    // Validate request parameters
    const validation = this.validateRequestParams({
      prompt,
      uid,
      profileId,
      incomingMessages,
      screen,
      dataScreen
    });

    console.log(`[AI Service] Parameter validation result:`, validation);

    if (!validation.isValid) {
      console.error(`[AI Service] ❌ Parameter validation failed:`, validation.errors);
      return {
        text: `Invalid request parameters: ${validation.errors.join(', ')}`,
        data: { validationErrors: validation.errors },
        error: true,
        errorMessage: `Parameter validation failed: ${validation.errors.join(', ')}`,
        source: 'validation_error',
        requestId: requestId,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`[AI Service] ✅ Parameter validation passed`);

    try {
      // Get user DEK for encryption/decryption
      console.log(`[AI Service] 🔐 Getting user DEK for UID: ${uid}`);
      const keyData = await getUserDek(uid);
      
      if (!keyData || !keyData.dek) {
        console.error(`[AI Service] ❌ Failed to get user DEK for UID: ${uid}`);
        console.log(`[AI Service] keyData received:`, keyData);
        return {
          text: "Unable to access your encrypted data. Please try again or contact support.",
          data: { error: "DEK retrieval failed" },
          error: true,
          errorMessage: "Failed to get user DEK",
          source: 'dek_error',
          requestId: requestId,
          timestamp: new Date().toISOString()
        };
      }

      console.log(`[AI Service] ✅ User DEK retrieved successfully`);

      // Get user and profile information
      console.log(`[AI Service] 👤 Getting user information for UID: ${uid}`);
      const user = await User.findOne({ authUid: uid });
      
      if (!user) {
        console.error(`[AI Service] ❌ User not found for UID: ${uid}`);
        return {
          text: "User account not found. Please sign in again.",
          data: { error: "User not found" },
          error: true,
          errorMessage: "User not found",
          source: 'user_error',
          requestId: requestId,
          timestamp: new Date().toISOString()
        };
      }

      console.log(`[AI Service] ✅ User found:`, {
        userId: user._id,
        hasEmail: !!user.email?.length
      });

      // Get user profiles using the business service
      console.log(`[AI Service] 👥 Getting user profiles for UID: ${uid}`);
      const userEmail = user.email?.find(e => e.isPrimary)?.email || user.email?.[0]?.email;
      
      if (!userEmail) {
        console.error(`[AI Service] ❌ No email found for user UID: ${uid}`);
        return {
          text: "User email not found. Please contact support.",
          data: { error: "Email not found" },
          error: true,
          errorMessage: "Email not found",
          source: 'email_error',
          requestId: requestId,
          timestamp: new Date().toISOString()
        };
      }

      const profiles = await businessService.getUserProfiles(userEmail, uid);
      console.log(`[AI Service] ✅ Profiles retrieved:`, {
        profileCount: profiles.length,
        profileIds: profiles.map(p => ({ id: p.id, name: p.name }))
      });

      // Find the specific profile
      const profile = profiles.find(p => p.id.toString() === profileId);
      
      if (!profile) {
        console.error(`[AI Service] ❌ Profile not found for ID: ${profileId}`);
        console.log(`[AI Service] Available profiles:`, profiles.map(p => ({ id: p.id.toString(), name: p.name })));
        return {
          text: "Profile not found. Please select a valid profile.",
          data: { error: "Profile not found" },
          error: true,
          errorMessage: "Profile not found",
          source: 'profile_error',
          requestId: requestId,
          timestamp: new Date().toISOString()
        };
      }

      console.log(`[AI Service] ✅ Profile found:`, {
        profileId: profile.id.toString(),
        profileName: profile.name
      });

      // STEP 2: Build system prompt and prepare LLM call
      console.log('\n🔧 [AI Service] ====== STEP 2: BUILDING PROMPTS AND TOOLS ======');
      
      // Build system prompt based on screen context
      const systemPrompt = buildScreenPrompt(screen, dataScreen);
      console.log(`[AI Service] System prompt built:`, {
        hasSystemPrompt: !!systemPrompt,
        systemPromptLength: systemPrompt?.length || 0,
        systemPromptPreview: systemPrompt ? systemPrompt.substring(0, 200) + '...' : 'NO_SYSTEM_PROMPT'
      });

      // Enhanced system prompt with tool instructions
      const enhancedSystemPrompt = `${systemPrompt}

## CRITICAL INSTRUCTIONS FOR FINANCIAL DATA REQUESTS

When a user asks for specific financial data, you MUST use the available tools:

**MANDATORY TOOL USAGE:**
- "What's my net worth?" → CALL getNetWorth()
- "What's my balance?" → CALL getAccountsByProfile()
- "Show my transactions" → CALL getProfileTransactions()
- "What's my cash flow?" → CALL getCashFlows()

**RESPONSE FORMAT:**
Always return JSON in this exact format:
{
  "response": "Your answer using real data from tools",
  "data": [tool results],
  "source": "tool_result",
  "error": false
}

**EXAMPLE:**
User: "What's my net worth?"
1. Call getNetWorth() with uid
2. Use the real data returned
3. Format response as JSON above

DO NOT ask for user ID - you already have it in the uid parameter.`;
      console.log(`[AI Service] Enhanced system prompt built:`, {
        hasEnhancedPrompt: !!enhancedSystemPrompt,
        enhancedPromptLength: enhancedSystemPrompt?.length || 0,
        enhancedPromptPreview: enhancedSystemPrompt ? enhancedSystemPrompt.substring(0, 200) + '...' : 'NO_ENHANCED_PROMPT'
      });

      // Get tool definitions and implementations
      const tools = toolDefinitions;
      const toolsImpl = toolFunctions({ user, profile, uid, profileId });
      
      console.log(`[AI Service] Tools prepared:`, {
        hasTools: !!tools,
        toolsCount: tools?.length || 0,
        hasToolsImpl: !!toolsImpl,
        toolsImplKeys: toolsImpl ? Object.keys(toolsImpl) : [],
        toolNames: tools?.map(t => t.function.name) || [],
        toolImplNames: toolsImpl ? Object.keys(toolsImpl) : []
      });

      // Validate tools
      const finalTools = tools.filter(tool => {
        const hasImplementation = toolsImpl[tool.function.name];
        if (!hasImplementation) {
          console.warn(`[AI Service] ⚠️ Tool ${tool.function.name} has no implementation`);
        }
        return hasImplementation;
      });

      console.log(`[AI Service] Final tools after validation:`, {
        originalCount: tools?.length || 0,
        finalCount: finalTools.length,
        validatedTools: finalTools.map(t => t.function.name),
        toolDetails: finalTools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          hasImpl: !!toolsImpl[t.function.name]
        }))
      });

      // Prepare messages for LLM
      const messages = [
        { role: 'system', content: enhancedSystemPrompt },
        ...(incomingMessages || []),
        { role: 'user', content: prompt }
      ];

      console.log(`[AI Service] Messages prepared for LLM:`, {
        totalMessages: messages.length,
        systemMessage: !!messages[0]?.content,
        userMessages: messages.filter(m => m.role === 'user').length,
        lastUserMessage: messages[messages.length - 1]?.content?.substring(0, 100) + '...'
      });

      // STEP 3: Call LLM to evaluate what functions are needed
      console.log('\n🚀 [AI Service] ====== STEP 4: CALLING LLM TO EVALUATE FUNCTIONS ======');
      
      let completeResponse;
      let usedFallbackMode = false;
      
      try {
        console.log(`[AI Service] 🔄 Calling LLM with:`, {
          model: this.GROQ_AI_MODEL,
          hasApiKey: !!this.GROQ_API_KEY,
          messagesCount: messages.length,
          toolsCount: finalTools.length,
          requestId: requestId,
          toolsPreview: finalTools.map(t => t.function.name),
          firstMessagePreview: messages[0]?.content?.substring(0, 100) + '...',
          lastMessagePreview: messages[messages.length - 1]?.content?.substring(0, 100) + '...'
        });

        completeResponse = await callLLM({
          apiKey: this.GROQ_API_KEY,
          model: this.GROQ_AI_MODEL,
          messages,
          tools: finalTools, // Using validated tools
          toolFunctions: toolsImpl, // Using proper tool implementations
          uid,
          aiController: null, // No controller for direct streaming here
        });

        console.log(`[AI Service] ✅ LLM call successful:`, {
          hasResponse: !!completeResponse,
          responseType: typeof completeResponse,
          hasText: !!completeResponse?.text,
          textLength: completeResponse?.text?.length,
          hasData: !!completeResponse?.data,
          hasError: completeResponse?.error,
          errorMessage: completeResponse?.errorMessage
        });

      } catch (error) {
        console.error(`[AI Service] ❌ LLM call failed:`, error);
        console.error(`[AI Service] Error details:`, {
          message: error.message,
          stack: error.stack,
          name: error.name
        });

        // Fallback mode - try without tools
        console.log(`[AI Service] 🔄 Attempting fallback mode without tools`);
        usedFallbackMode = true;

        try {
          const fallbackMessages = [
            { role: 'system', content: getSimplifiedSystemPrompt() },
            { role: 'user', content: prompt }
          ];

          completeResponse = await callLLM({
            apiKey: this.GROQ_API_KEY,
            model: this.GROQ_AI_MODEL,
            messages: fallbackMessages,
            tools: [],
            toolFunctions: {},
            uid,
            aiController: null,
          });

          console.log(`[AI Service] ✅ Fallback LLM call successful:`, {
            hasResponse: !!completeResponse,
            hasText: !!completeResponse?.text
          });

        } catch (fallbackError) {
          console.error(`[AI Service] ❌ Fallback LLM call also failed:`, fallbackError);
          
          return {
            text: "I'm experiencing technical difficulties. Please try again in a moment.",
            data: { error: "LLM service unavailable" },
            error: true,
            errorMessage: "LLM service failed",
            source: 'llm_fallback_error',
            requestId: requestId,
            timestamp: new Date().toISOString()
          };
        }
      }

      // STEP 4: Process and format the response
      console.log('\n📝 [AI Service] ====== STEP 5: PROCESSING RESPONSE ======');
      
      // Parse the response if it's a string
      let parsedResponse = completeResponse;
      if (typeof completeResponse === 'string') {
        try {
          parsedResponse = JSON.parse(completeResponse);
        } catch (parseError) {
          console.warn(`[AI Service] ⚠️ Response is not JSON, treating as plain text:`, parseError.message);
          parsedResponse = { response: completeResponse, text: completeResponse };
        }
      }
      
      // Check if we have a valid response with either text or response field
      if (!parsedResponse || (!parsedResponse.text && !parsedResponse.response)) {
        console.error(`[AI Service] ❌ Invalid LLM response:`, parsedResponse);
        return {
          text: "I received an invalid response. Please try again.",
          data: { error: "Invalid LLM response" },
          error: true,
          errorMessage: "Invalid LLM response",
          source: 'invalid_llm_response',
          requestId: requestId,
          timestamp: new Date().toISOString()
        };
      }

      // Extract text from either text or response field
      const responseText = parsedResponse.text || parsedResponse.response;
      
      console.log(`[AI Service] ✅ LLM response validated:`, {
        textLength: responseText.length,
        textPreview: responseText.substring(0, 100) + '...',
        hasData: !!parsedResponse.data,
        dataKeys: parsedResponse.data ? Object.keys(parsedResponse.data) : [],
        source: parsedResponse.source,
        isError: parsedResponse.error
      });

      // Format financial data if present
      let formattedData = parsedResponse.data;
      if (parsedResponse.data && typeof parsedResponse.data === 'object') {
        try {
          formattedData = formatFinancialResponse(parsedResponse.data);
          console.log(`[AI Service] ✅ Financial data formatted successfully`);
        } catch (formatError) {
          console.warn(`[AI Service] ⚠️ Financial data formatting failed:`, formatError);
          // Continue with unformatted data
        }
      }

      // STEP 5: Prepare final response
      console.log('\n🎯 [AI Service] ====== STEP 6: PREPARING FINAL RESPONSE ======');
      
      const finalResponse = {
        text: responseText || "I'm sorry, but I couldn't generate a proper response. Please try again.",
        data: formattedData || null,
        error: parsedResponse.error || false,
        errorMessage: parsedResponse.errorMessage || undefined,
        source: parsedResponse.source || 'ai_response',
        usedFallback: usedFallbackMode,
        requestId: requestId,
        timestamp: new Date().toISOString()
      };

      const duration = Date.now() - startTime;
      console.log(`[AI Service] 🏁 Final response prepared in ${duration}ms:`, {
        hasText: !!finalResponse.text,
        textLength: finalResponse.text?.length,
        hasData: !!finalResponse.data,
        hasError: finalResponse.error,
        usedFallback: finalResponse.usedFallback,
        requestId: finalResponse.requestId
      });

      return finalResponse;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[AI Service] ❌ Critical error after ${duration}ms:`, error);
      console.error(`[AI Service] Error stack:`, error.stack);
      
      return {
        text: "An unexpected error occurred. Please try again or contact support.",
        data: { error: error.message },
        error: true,
        errorMessage: error.message,
        source: 'critical_error',
        requestId: requestId,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Determine response source based on content analysis
  determineResponseSource(response) {
    if (!response) return 'unknown';
    
    // Financial data patterns
    const financialPatterns = [
      /\$\d+/,                    // Dollar amounts
      /net worth/i,               // Net worth mentions
      /balance/i,                 // Balance mentions
      /transaction/i,             // Transaction mentions
      /account/i                  // Account mentions
    ];
    
    // Navigation/UI patterns
    const uiPatterns = [
      /screen/i,                  // Screen mentions
      /click/i,                   // UI interactions
      /button/i,                  // UI elements
      /menu/i,                    // Navigation elements
      /section/i                  // UI sections
    ];
    
    // Form/feature patterns
    const featurePatterns = [
      /form/i,                    // Form mentions
      /fill out/i,                // Form interactions
      /enter/i,                   // Data entry
      /upload/i,                  // File operations
      /settings/i                 // Settings mentions
    ];
    
    // Check patterns
    const hasFinancialData = financialPatterns.some(pattern => pattern.test(response));
    const hasUIElements = uiPatterns.some(pattern => pattern.test(response));
    const hasFeatures = featurePatterns.some(pattern => pattern.test(response));
    
    // Determine source
    if (hasFinancialData && !hasUIElements) {
      return 'financial_advice';  // General financial advice
    } else if (hasUIElements) {
      return 'app_guidance';      // UI/navigation help
    } else if (hasFeatures) {
      return 'feature_help';      // Feature/form help
    }
    
    return 'general_response';    // Default source
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
      // Only flag if the response is actually incomplete or just an apology
      const hasUnnecessaryApologies = (
        // Check for exact cut-off patterns from screenshot
        normalizedResponse.response.includes('I apologize, but my response was cut off. Please try asking your question again.') ||
        normalizedResponse.response.includes("I'm sorry, but my response was cut off. Please try asking your question again.") ||
        normalizedResponse.response.includes('my response was cut off. Please try asking your question again.') ||
        normalizedResponse.response.includes('response was cut off. Please try asking your question again.') ||
        normalizedResponse.response.includes('was cut off. Please try asking your question again.') ||
        normalizedResponse.response.includes('cut off. Please try asking your question again.') ||
        
        // General cut-off indicators
        normalizedResponse.response.includes('my response was cut off') ||
        normalizedResponse.response.includes('response was cut') ||
        normalizedResponse.response.includes('cut off') ||
        
        // Retry prompts
        normalizedResponse.response.includes('Please try asking your question again') ||
        normalizedResponse.response.includes('try asking your question again') ||
        normalizedResponse.response.includes('asking your question again') ||
        normalizedResponse.response.includes('your question again') ||
        
        // Apology patterns with cutoff context
        (normalizedResponse.response.includes('I apologize') && normalizedResponse.response.includes('cut off')) ||
        (normalizedResponse.response.includes('I\'m sorry') && normalizedResponse.response.includes('cut off')) ||
        
        // Check for apologies ONLY if they're the main content (short responses)
        (normalizedResponse.response.includes('I apologize') && normalizedResponse.response.length < 100) ||
        (normalizedResponse.response.includes('I\'m sorry') && normalizedResponse.response.length < 100) ||
        (normalizedResponse.response.includes('apologize') && normalizedResponse.response.length < 100) ||
        (normalizedResponse.response.includes('sorry') && normalizedResponse.response.length < 100)
      );
      
      // Check if response actually has useful content
      const hasUsefulContent = (
        // Financial data indicators (high priority)
        normalizedResponse.response.includes('$') ||
        /\d+/.test(normalizedResponse.response) ||
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
        normalizedResponse.response.includes('Your bank') ||
        // Business and investment guidance
        normalizedResponse.response.includes('LLC') ||
        normalizedResponse.response.includes('business') ||
        normalizedResponse.response.includes('company') ||
        normalizedResponse.response.includes('investment') ||
        normalizedResponse.response.includes('strategy') ||
        normalizedResponse.response.includes('growth') ||
        normalizedResponse.response.includes('cash flow') ||
        normalizedResponse.response.includes('expenses') ||
        normalizedResponse.response.includes('revenue') ||
        normalizedResponse.response.includes('profit') ||
        normalizedResponse.response.includes('tax') ||
        normalizedResponse.response.includes('IRS') ||
        normalizedResponse.response.includes('professional') ||
        // Form and procedure guidance
        normalizedResponse.response.includes('form') ||
        normalizedResponse.response.includes('fill out') ||
        normalizedResponse.response.includes('required') ||
        normalizedResponse.response.includes('information') ||
        normalizedResponse.response.includes('address') ||
        normalizedResponse.response.includes('management') ||
        normalizedResponse.response.includes('structure') ||
        normalizedResponse.response.includes('consult') ||
        normalizedResponse.response.includes('website')
      );
      
      // If response has useful content but contains unnecessary apologies, clean it up
      if (hasUsefulContent && hasUnnecessaryApologies) {
        console.log(" [AI Service] Response has useful content but unnecessary apologies - cleaning up");
        
        let cleanedResponse = normalizedResponse.response;
        
        // Remove common apology patterns - more intelligent cleaning
        const apologyPatterns = [
          // Exact cut-off patterns from screenshot (highest priority)
          /I apologize, but my response was cut off\. Please try asking your question again\./gi,
          /I'm sorry, but my response was cut off\. Please try asking your question again\./gi,
          /my response was cut off\. Please try asking your question again\./gi,
          /response was cut off\. Please try asking your question again\./gi,
          /was cut off\. Please try asking your question again\./gi,
          /cut off\. Please try asking your question again\./gi,
          
          // General cut-off patterns (always remove)
          /I apologize,? but my response was cut off\.? Please try asking your question again\.?/gi,
          /I'm sorry,? but my response was cut off\.? Please try asking your question again\.?/gi,
          /my response was cut off\.? Please try asking your question again\.?/gi,
          /response was cut off\.? Please try asking your question again\.?/gi,
          /cut off\.? Please try asking your question again\.?/gi,
          /Please try asking your question again\.?/gi,
          /try asking your question again\.?/gi,
          /asking your question again\.?/gi,
          /your question again\.?/gi,
          /question again\.?/gi,
          
          // Cut-off indicators (always remove)
          /I apologize,? but my response was cut off\.?/gi,
          /I'm sorry,? but my response was cut off\.?/gi,
          /my response was cut off\.?/gi,
          /response was cut off\.?/gi,
          /was cut off\.?/gi,
          /cut off\.?/gi,
          
          // Apologies only if they're standalone (not part of useful content)
          /^I apologize,?\s*$/gi,
          /^I'm sorry,?\s*$/gi,
          /^sorry,?\s*$/gi,
          /^apologize,?\s*$/gi
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
        
        // Final cleanup - remove any remaining standalone apologies
        cleanedResponse = cleanedResponse
          .replace(/^I apologize,?\s*$/gi, '')
          .replace(/^I'm sorry,?\s*$/gi, '')
          .replace(/^sorry,?\s*$/gi, '')
          .replace(/^apologize,?\s*$/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        
        console.log(" [AI Service] Cleaned response:", {
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
        console.log(" [AI Service] Response is just an apology with no useful content - providing fallback");
        
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
   */
  normalizeResponse(parsedResponse, completeResponse) {
    if (!parsedResponse) {
      return {
        text: "I'm having trouble processing your request. Please try again.",
        response: "I'm having trouble processing your request. Please try again.",
        data: {},
        error: true,
        errorMessage: "Failed to parse AI response",
        source: "error_fallback"
      };
    }

    // Get the main response text
    let text = parsedResponse.response || parsedResponse.text || "";
    
    // Ensure we have some response
    if (!text) {
      text = parsedResponse.error ? 
        (parsedResponse.errorMessage || "An error occurred.") : 
        "I processed your request.";
    }

    // Ensure data is always an object
    let data = parsedResponse.data;
    if (data === null || data === undefined) {
      data = {};
    }

    return {
      text,
      response: text,
      data,
      error: parsedResponse.error || false,
      errorMessage: parsedResponse.errorMessage || null,
      source: parsedResponse.source || "general_response",
      needsClarification: false,
      suggestedQuestions: parsedResponse.suggestedQuestions || []
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

  // Intelligent question classifier for comprehensive response handling
  classifyUserQuestion(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return { category: 'general_advice', subcategory: 'unknown', confidence: 0 };
    }
    
    const lowerPrompt = prompt.toLowerCase();
    
    // Define comprehensive keyword patterns for different categories
    const patterns = {
      financial_data: {
        net_worth: ['net worth', 'patrimônio', 'wealth', 'total value', 'valor total', 'quanto tenho'],
        balance: ['balance', 'saldo', 'money', 'cash', 'current balance', 'account balance'],
        transactions: ['transaction', 'transação', 'spending', 'gastos', 'purchases', 'compras', 'payments', 'pagamentos'],
        accounts: ['account', 'conta', 'bank account', 'savings', 'poupança', 'checking'],
        cash_flow: ['cash flow', 'fluxo de caixa', 'income', 'revenue', 'receita', 'expenses', 'despesas'],
        debts: ['debt', 'dívida', 'loan', 'empréstimo', 'credit card', 'cartão de crédito', 'liability']
      },
      
      financial_forms: {
        add_account: ['add account', 'adicionar conta', 'connect bank', 'conectar banco', 'new account'],
        upload_documents: ['upload', 'document', 'documento', 'file', 'arquivo', 'receipt', 'recibo'],
        categorize: ['category', 'categoria', 'categorize', 'categorizar', 'organize', 'organizar'],
        budget_setup: ['budget', 'orçamento', 'goal', 'meta', 'target', 'objetivo', 'plan', 'plano']
      },
      
      business_advice: {
        cash_flow: ['business cash flow', 'fluxo de caixa empresarial', 'company finances'],
        growth: ['business growth', 'crescimento', 'expand', 'expandir', 'scale', 'escalar'],
        metrics: ['kpi', 'metrics', 'métricas', 'performance', 'desempenho', 'analytics'],
        expenses: ['business expenses', 'custos empresariais', 'reduce costs', 'reduzir custos'],
        strategy: ['business strategy', 'estratégia', 'planning', 'planejamento empresarial']
      },
      
      investment_advice: {
        portfolio: ['investment', 'investimento', 'portfolio', 'portfólio', 'stocks', 'ações'],
        diversification: ['diversify', 'diversificar', 'risk', 'risco', 'allocation', 'alocação'],
        strategy: ['investment strategy', 'estratégia de investimento', 'when to invest', 'quando investir'],
        tracking: ['track investment', 'acompanhar investimento', 'performance', 'rentabilidade']
      },
      
      platform_navigation: {
        navigation: ['how to', 'como', 'where', 'onde', 'find', 'encontrar', 'navigate', 'navegar'],
        settings: ['settings', 'configurações', 'config', 'setup', 'configure'],
        reports: ['report', 'relatório', 'export', 'exportar', 'download', 'baixar'],
        connection: ['connect', 'conectar', 'sync', 'sincronizar', 'link', 'vincular']
      }
    };
    
    let bestMatch = { category: 'general_advice', subcategory: 'unknown', confidence: 0 };
    
    // Check each category for matches
    for (const [category, subcategories] of Object.entries(patterns)) {
      for (const [subcategory, keywords] of Object.entries(subcategories)) {
        let matchCount = 0;
        let totalKeywords = keywords.length;
        
        for (const keyword of keywords) {
          if (lowerPrompt.includes(keyword)) {
            matchCount++;
          }
        }
        
        // Calculate confidence based on keyword matches
        const confidence = matchCount / totalKeywords;
        
        // Also check for exact phrase matches (higher weight)
        const exactMatches = keywords.filter(keyword => lowerPrompt.includes(keyword)).length;
        const adjustedConfidence = confidence + (exactMatches * 0.1);
        
        if (adjustedConfidence > bestMatch.confidence) {
          bestMatch = { category, subcategory, confidence: adjustedConfidence };
        }
      }
    }
    
    // Additional context-based classification
    if (bestMatch.confidence < 0.3) {
      // Check for question words and financial context
      const hasQuestionWords = ['what', 'how', 'where', 'when', 'why', 'qual', 'como', 'onde', 'quando', 'por que']
        .some(word => lowerPrompt.includes(word));
      
      const hasFinancialContext = ['money', 'financial', 'finance', 'banco', 'conta', 'dinheiro']
        .some(word => lowerPrompt.includes(word));
      
      if (hasQuestionWords && hasFinancialContext) {
        bestMatch = { 
          category: 'platform_navigation', 
          subcategory: 'general_help', 
          confidence: 0.5 
        };
      }
    }
    
    // Log classification for debugging
    console.log('\n🧠 [AI Service] ====== QUESTION CLASSIFICATION ======', {
      prompt: prompt.substring(0, 100),
      classification: bestMatch,
      confidence: Math.round(bestMatch.confidence * 100) + '%'
    });
    
    return bestMatch;
  }

  // Build fallback system prompt based on question classification
  buildFallbackSystemPrompt(questionClassification) {
    const basePrompt = `You are Zentavos, a helpful financial assistant. You are currently in fallback mode due to technical issues accessing real financial data.`;
    
    switch (questionClassification.category) {
      case 'financial_data':
        return `${basePrompt}

FINANCIAL DATA REQUEST DETECTED
The user is asking for specific financial information that requires real-time data access.

GUIDANCE STRATEGY:
- Acknowledge that you cannot access their real financial data right now
- Direct them to the specific dashboard section where they can find this information
- Provide context about what they'll find in that section
- Be encouraging and helpful despite the limitation

SPECIFIC GUIDANCE:
- Net Worth → "Navigate to the 'Net Worth' section on your dashboard"
- Account Balances → "Check the 'Accounts' section for detailed balance information"
- Transactions → "Visit the 'Transactions' section for recent activity and history"
- Cash Flow → "Review the 'Cash Flow' analytics in your dashboard"

Be direct, specific, and always end with actionable next steps.`;

      case 'financial_forms':
        return `${basePrompt}

FINANCIAL FORMS & PROCEDURES QUESTION
The user needs help with forms, data entry, or platform procedures.

GUIDANCE STRATEGY:
- Provide clear, step-by-step instructions
- Mention specific UI elements when possible (buttons, menus, sections)
- Offer alternatives if the primary method isn't available
- Be detailed and practical

COMMON SCENARIOS:
- Adding accounts → Guide to connection process and security considerations
- Document uploads → Explain accepted formats and where to find upload features
- Categorization → Describe the categorization system and benefits
- Budget setup → Walk through the goal-setting process

Focus on being a helpful tutorial guide.`;

      case 'business_advice':
        return `${basePrompt}

BUSINESS ADVICE REQUEST
The user is seeking business-related financial guidance and strategies.

GUIDANCE STRATEGY:
- Provide professional, actionable business advice
- Focus on practical strategies they can implement
- Reference relevant business financial principles
- Connect advice to features available in their Zentavos platform

KEY AREAS TO COVER:
- Cash flow management and optimization
- Business expense tracking and reduction
- Growth strategies and financial planning
- Key performance indicators (KPIs) to monitor
- Risk management and financial stability

Be professional, insightful, and strategic in your advice.`;

      case 'investment_advice':
        return `${basePrompt}

INVESTMENT GUIDANCE REQUEST
The user is asking for investment-related advice and information.

GUIDANCE STRATEGY:
- Provide educational, general investment principles
- Emphasize the importance of professional financial advice for specific investments
- Focus on portfolio management concepts available in the platform
- Include appropriate disclaimers about investment risks

TOPICS TO COVER:
- Diversification principles and strategies
- Risk assessment and tolerance
- Investment tracking and performance monitoring
- General market education and concepts
- How to use Zentavos' investment tracking features

Always include disclaimer: "This is educational information only. Consult with a qualified financial advisor for personalized investment advice."`;

      case 'platform_navigation':
        return `${basePrompt}

PLATFORM NAVIGATION HELP
The user needs help navigating or using features of the Zentavos platform.

GUIDANCE STRATEGY:
- Provide clear, step-by-step navigation instructions
- Mention specific menu items, buttons, and interface elements
- Offer multiple ways to accomplish the same task when possible
- Include helpful tips for efficient platform usage

NAVIGATION ASSISTANCE:
- Dashboard overview and main sections
- Menu structure and how to access different features
- Settings and customization options
- Report generation and data export
- Account connection and management

Be like a friendly platform expert helping them master the interface.`;

      default: // general_advice
        return `${basePrompt}

GENERAL FINANCIAL ADVICE
The user is seeking general financial guidance and education.

GUIDANCE STRATEGY:
- Provide helpful, actionable financial advice
- Keep advice practical and implementable
- Reference how they can track progress using Zentavos features
- Be encouraging and supportive of their financial journey

ADVICE AREAS:
- Budgeting strategies and techniques
- Saving tips and goal-setting
- Debt management and reduction strategies
- Financial planning and goal achievement
- Money management best practices

Focus on empowering them with knowledge and practical steps they can take today.`;
    }
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
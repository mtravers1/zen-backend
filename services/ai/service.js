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
    console.log('\n🚀 [AI Service] ====== STARTING AI CHAT PROCESS ======');
    console.log('[AI Service] Request ID:', requestId || 'NOT_PROVIDED');
    console.log('[AI Service] User prompt:', prompt);
    console.log('[AI Service] UI Context:', JSON.stringify(context, null, 2));

    // Validate request parameters
    const validation = this.validateRequestParams({
      prompt,
      uid,
      profileId,
      incomingMessages,
      screen,
      dataScreen
    });

    // Log validation results
    console.log('\n🔍 [AI Service] ====== REQUEST VALIDATION ======', {
      timestamp: new Date().toISOString(),
      requestId: requestId || 'NOT_PROVIDED',
      validation,
      requestParams: {
        hasPrompt: !!prompt,
        hasUid: !!uid,
        hasProfile: !!profileId,
        messageCount: Array.isArray(incomingMessages) ? incomingMessages.length : 0,
        screen: screen || 'unknown',
        dataScreen: dataScreen || 'none'
      }
    });

    // Return early if validation fails
    if (!validation.isValid) {
      console.error('[AI Service] Validation failed:', validation.errors);
      return {
        text: "I cannot process your request due to missing or invalid parameters.",
        data: null,
        error: true,
        errorMessage: validation.errors.join('. '),
        requestId: requestId
      };
    }

    try {
      // Validate required parameters again for safety
      if (!uid) {
        console.error('[AI Service] UID is missing after validation');
        throw new Error("User ID (uid) is required");
      }
      if (!profileId) {
        console.error('[AI Service] Profile ID is missing after validation');
        throw new Error("Profile ID is required");
      }

      console.log('\n🎯 [AI Service] ====== STEP 1: PREPARING USER CONTEXT ======');
      console.log("[AI Service] Starting request with:", { 
        requestId: requestId || 'NOT_PROVIDED',
        uid, 
        profileId, 
        hasPrompt: !!prompt, 
        prompt: prompt,
        promptLength: prompt ? prompt.length : 0,
        screen, 
        dataScreen, 
        hasContext: !!context, 
        contextKeys: context ? Object.keys(context) : [],
        fullContext: context
      });

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

      // STEP 1: Retrieve user and profile context for tool calls
      console.log('\n🔑 [AI Service] ====== STEP 2: GETTING USER DATA ======');
      console.log("[AI Service] Getting user DEK for uid:", uid);
      const keyData = await getUserDek(uid);
      if (!keyData || !keyData.dek) {
        console.error("[AI Service] Failed to get DEK for user:", uid);
        throw new Error("Failed to retrieve user encryption keys");
      }
  const dek = keyData.dek;
      
      console.log("[AI Service] Getting user data for uid:", uid);
      const user = await User.findOne({ authUid: uid }).lean();
      if (!user) {
        console.error("[AI Service] User not found for uid:", uid);
        throw new Error("User not found");
      }
      if (!user?.email?.[0]?.email) {
        console.error("[AI Service] User email not found for uid:", uid);
        throw new Error("User email not found");
      }
      
      const email = user.email[0].email;
      console.log("[AI Service] Getting user profiles for email:", email);
      const profiles = await businessService.getUserProfiles(email, uid);
      if (!profiles?.length) {
        console.error("[AI Service] No profiles found for user:", uid);
        throw new Error("No profiles found for user");
      }

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

      console.log("[AI Service] Profile found successfully:", { 
        id: profile.id, 
        name: profile.name, 
        isPersonal: profile.isPersonal,
        hasPlaidAccounts: profile.plaidAccounts ? profile.plaidAccounts.length : 0
      });

      // STEP 2: Build system prompt and prepare LLM call
      console.log('\n🧠 [AI Service] ====== STEP 3: PREPARING LLM CALL ======');

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
      let screenPrompt = '';
      let enhancedScreenPrompt = '';
      
      // Always build system prompt (it's lightweight and doesn't include screen-specific data)
      const systemPrompt = getProductionSystemPrompt(currentScreen);
      
      // Let the LLM intelligently determine the type of question
      // No hardcoded classification - the LLM will analyze the context
      console.log('[AI Service] 🎯 Letting LLM intelligently classify question type');
      
      // Build screen context for all questions - the LLM will decide how to use it
      screenPrompt = buildScreenPrompt(currentScreen, currentDataScreen, context);
      enhancedScreenPrompt = screenPrompt;

      // Construct the message array for the LLM
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: "user", content: `${enhancedScreenPrompt}\n\nUser question: ${prompt}\n\nRespond in JSON format as specified.` },
      ];

      // Check total prompt length to prevent LLM confusion
      const totalPromptLength = systemPrompt.length + enhancedScreenPrompt.length + prompt.length;
      console.log('[AI Service] Total prompt length:', totalPromptLength, 'characters');
      
      if (totalPromptLength > 25000) {
        console.warn('[AI Service] Total prompt length is very long, using simplified system prompt to prevent LLM confusion');
        
        // Use simplified prompt for very long requests
        const simplifiedSystemPrompt = getSimplifiedSystemPrompt(currentScreen);
        messages[0] = { role: 'system', content: simplifiedSystemPrompt };
        
        console.log('[AI Service] Switched to simplified system prompt');
      }

      // Use the tool definitions for function calling
      const tools = toolDefinitions;

      // Validate tool configuration
      if (!tools || !Array.isArray(tools) || tools.length === 0) {
        console.error('[AI Service] 🚨 No tools available for function calling');
        return {
          text: "I encountered a technical issue - no tools are available for processing your request. Please contact support.",
          data: null,
          error: true,
          errorMessage: "No tools available",
          source: 'no_tools'
        };
      }

      // Validate each tool definition for Groq compatibility
      const validatedTools = tools.filter(tool => {
        if (!tool || !tool.function || !tool.function.name) {
          console.warn('[AI Service] Invalid tool found - missing function or name:', tool);
          return false;
        }
        
        if (!tool.function.parameters || typeof tool.function.parameters !== 'object') {
          console.warn('[AI Service] Invalid tool parameters:', tool.function.name);
          return false;
        }
        
        return true;
      });

      console.log('[AI Service] Tool configuration validated:', {
        totalTools: tools.length,
        validTools: validatedTools.length,
        invalidTools: tools.length - validatedTools.length,
        toolNames: validatedTools.map(t => t.function?.name).filter(Boolean)
      });
      
      // Use validated tools
      const finalTools = validatedTools;
      
      // Enable full functionality with robust fallback system
      console.log('\n✅ [AI Service] ====== TOOLS ENABLED WITH FALLBACK PROTECTION ======');
      console.log('[AI Service] Using validated tools with intelligent fallback system');
      console.log('[AI Service] Available tools:', finalTools.length);

      // Prepare the context for tool functions (injects user/profile info)
      const toolContext = {
        email,
        profile,
        filterAccounts,
        filterTransactions,
      };
      const toolsImpl = toolFunctions(toolContext);

      // STEP 3: Call LLM to evaluate what functions are needed
      console.log('\n🚀 [AI Service] ====== STEP 4: CALLING LLM TO EVALUATE FUNCTIONS ======');
      console.log("[AI Service] User question:", prompt);
      console.log("[AI Service] Screen context:", screen, dataScreen);
      console.log("[AI Service] Messages being sent to LLM:");
      messages.forEach((msg, index) => {
        console.log(`  [${index}] Role: ${msg.role}`);
        console.log(`  [${index}] Content length: ${msg.content ? msg.content.length : 0}`);
        console.log(`  [${index}] Content preview: ${msg.content ? msg.content.substring(0, 200) + '...' : 'No content'}`);
        if (msg.content && msg.content.length < 500) {
          console.log(`  [${index}] Full content: ${msg.content}`);
        }
      });
      
      // Log message details for debugging
      console.log('[AI Service] Message details:', {
        systemPromptLength: systemPrompt.length,
        screenPromptLength: enhancedScreenPrompt.length,
        userQuestionLength: prompt.length,
        totalMessages: messages.length,
        firstMessageRole: messages[0]?.role,
        firstMessageLength: messages[0]?.content?.length,
        secondMessageRole: messages[1]?.role,
        secondMessageLength: messages[1]?.content?.length
      });
      
      // Initialize request context with safe defaults
      const requestContext = {
        id: requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        userId: uid || 'anonymous',
        profileId: profileId || 'unknown',
        screen: screen || 'unknown',
        dataScreen: dataScreen || 'none',
        messageCount: Array.isArray(incomingMessages) ? incomingMessages.length : 0,
        toolCount: Array.isArray(finalTools) ? finalTools.length : 0,
        promptLength: typeof prompt === 'string' ? prompt.length : 0,
        requestType: 'ai_chat',
        environment: process.env.NODE_ENV || 'development',
        validationStatus: {
          hasUid: !!uid,
          hasProfile: !!profileId,
          hasScreen: !!screen,
          hasMessages: Array.isArray(incomingMessages) && incomingMessages.length > 0,
          hasTools: Array.isArray(finalTools) && finalTools.length > 0,
          hasPrompt: typeof prompt === 'string' && prompt.length > 0
        }
      };

      // Log request context
      console.log('\n📝 [AI Service] ====== REQUEST CONTEXT ======', {
        ...requestContext,
        stage: 'init',
        context: {
          hasScreen: !!screen,
          hasDataScreen: !!dataScreen,
          hasProfile: !!profileId,
          hasMessages: incomingMessages.length > 0
        }
      });

      // Call the LLM (Groq/vLLM) with all context and tool functions
      let completeResponse;
      let usedFallbackMode = false;
      
      try {
        console.log('\n🧠 [AI Service] ====== LLM PROCESSING ======');
        console.log('[AI Service] Calling LLM to evaluate functions needed...');
        
        completeResponse = await callLLM({
          apiKey: this.GROQ_API_KEY,
          model: this.GROQ_AI_MODEL,
          messages,
          tools: finalTools, // Using validated tools
          toolFunctions: toolsImpl, // Using proper tool implementations
          uid,
          aiController: res ? (await import("../../controllers/ai.controller.js")).default : null,
        });
        
        console.log('\n📥 [AI Service] ====== LLM RESPONSE RECEIVED ======', {
          ...requestContext,
          stage: 'response',
          status: 'success',
          responseLength: completeResponse?.length || 0,
          responseType: typeof completeResponse
        });
        
        console.log('[AI Service] LLM response:', completeResponse);
        
      } catch (error) {
        // Log error with validation status
        console.error('\n❌ [AI Service] ====== LLM ERROR ======', {
          ...requestContext,
          stage: 'error',
          error: {
            message: error.message || 'Unknown error',
            code: error.code || 'NO_CODE',
            type: error.type || 'UNKNOWN',
            stack: error.stack || new Error().stack,
            timestamp: new Date().toISOString()
          },
          context: {
            modelName: this.GROQ_AI_MODEL || 'unknown',
            hasApiKey: !!this.GROQ_API_KEY,
            messageCount: requestContext.messageCount,
            toolCount: requestContext.toolCount,
            validationStatus: requestContext.validationStatus
          }
        });
        
        // Check if this is a function call error and try fallback without tools
        console.log('\n🔍 [AI Service] ====== ERROR ANALYSIS ======');
        console.log('[AI Service] Error message:', error.message);
        console.log('[AI Service] Error stack:', error.stack);
        console.log('[AI Service] Full error object:', JSON.stringify(error, null, 2));
        console.log('[AI Service] Checking for function call error...');
        console.log('[AI Service] Contains "Failed to call a function":', error.message?.includes('Failed to call a function'));
        console.log('[AI Service] Contains "tool_use_failed":', error.message?.includes('tool_use_failed'));
        
        if (error.message?.includes('Failed to call a function') || error.message?.includes('tool_use_failed')) {
          console.log('\n🔄 [AI Service] ====== TRYING FALLBACK WITHOUT TOOLS ======');
          console.log('[AI Service] Function call error detected, activating fallback mode');
          
          try {
            // Classify the question for intelligent fallback response
            const questionClassification = this.classifyUserQuestion(prompt);
            
            // Create a simplified prompt without tools based on question type
            const simplifiedMessages = [
              { 
                role: 'system', 
                content: this.buildFallbackSystemPrompt(questionClassification)
              },
              { 
                role: 'user', 
                content: `User question: "${prompt}"

Question type detected: ${questionClassification.category} (${questionClassification.subcategory})
Confidence: ${Math.round(questionClassification.confidence * 100)}%

Please provide a helpful response based on the question type. If this is a financial question that requires data, explain what information would be needed and suggest how the user might access it.` 
              }
            ];
            
            console.log('[AI Service] Fallback messages prepared:', {
              systemPrompt: simplifiedMessages[0].content.substring(0, 200) + '...',
              userPrompt: simplifiedMessages[1].content.substring(0, 200) + '...'
            });
            
            // Call LLM without tools for fallback response
            completeResponse = await callLLM({
              apiKey: this.GROQ_API_KEY,
              model: this.GROQ_AI_MODEL,
              messages: simplifiedMessages,
              tools: [], // No tools for fallback
              toolFunctions: {}, // No tool functions
              uid,
              aiController: null, // No controller for fallback
            });
            
            usedFallbackMode = true;
            console.log('[AI Service] Fallback response received:', completeResponse);
            
          } catch (fallbackError) {
            console.error('[AI Service] Fallback mode also failed:', fallbackError);
            
            // Return a generic helpful response
            completeResponse = {
              text: `I understand you're asking about "${prompt}". I'm experiencing some technical difficulties right now, but I'd be happy to help you with this question. Could you try rephrasing your question or ask me again in a moment?`,
              data: null,
              error: false,
              source: 'fallback_generic'
            };
            
            usedFallbackMode = true;
          }
        } else {
          // Non-function call error, return helpful message
          completeResponse = {
            text: `I'm sorry, but I'm having trouble processing your request right now. The error was: ${error.message}. Please try again in a moment, or if the problem persists, contact support.`,
            data: null,
            error: true,
            errorMessage: error.message,
            source: 'llm_error'
          };
        }
      }

      // STEP 4: Process and format the response
      console.log('\n📝 [AI Service] ====== STEP 5: PROCESSING RESPONSE ======');
      
      // Validate the response structure
      if (!completeResponse) {
        console.error('[AI Service] No response received from LLM');
        completeResponse = {
          text: "I'm sorry, but I didn't receive a response from the AI system. Please try again.",
          data: null,
          error: true,
          errorMessage: "No response received",
          source: 'no_response'
        };
      }

      // Ensure we have a text field
      if (!completeResponse.text && completeResponse.response) {
        completeResponse.text = completeResponse.response;
      }

      if (!completeResponse.text) {
        console.error('[AI Service] No text in response:', completeResponse);
        completeResponse.text = "I received a response but it doesn't contain the expected text. Please try again.";
      }

      // Format financial response if data is present
      if (completeResponse.data && Object.keys(completeResponse.data).length > 0) {
        console.log('[AI Service] Formatting financial response with data');
        try {
          const formattedResponse = formatFinancialResponse(completeResponse.text, completeResponse.data, currentScreen);
          completeResponse.text = formattedResponse.text;
          completeResponse.data = formattedResponse.data;
        } catch (formatError) {
          console.warn('[AI Service] Financial response formatting failed:', formatError);
          // Keep original response if formatting fails
        }
      }

      // STEP 5: Prepare final response
      console.log('\n🎯 [AI Service] ====== STEP 6: PREPARING FINAL RESPONSE ======');
      
      const finalResponse = {
        text: completeResponse.text || "I'm sorry, but I couldn't generate a proper response. Please try again.",
        data: completeResponse.data || null,
        error: completeResponse.error || false,
        errorMessage: completeResponse.errorMessage || undefined,
        source: completeResponse.source || 'ai_response',
        usedFallback: usedFallbackMode,
        requestId: requestId,
        timestamp: new Date().toISOString()
      };

      console.log('\n✅ [AI Service] ====== RESPONSE READY ======');
      console.log('[AI Service] Final response prepared:', {
        hasText: !!finalResponse.text,
        textLength: finalResponse.text ? finalResponse.text.length : 0,
        hasData: !!finalResponse.data,
        dataKeys: finalResponse.data ? Object.keys(finalResponse.data) : [],
        error: finalResponse.error,
        usedFallback: finalResponse.usedFallback,
        source: finalResponse.source
      });

      if (finalResponse.text && finalResponse.text.length > 200) {
        console.log('[AI Service] Full response text:', finalResponse.text);
      }

      return finalResponse;
      
    } catch (error) {
      console.error('\n💥 [AI Service] ====== CRITICAL ERROR ======');
      console.error('[AI Service] Critical error in makeRequest:', error);
      console.error('[AI Service] Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: requestId
      });

      // Return a user-friendly error response
      return {
        text: "I'm experiencing technical difficulties right now. Please try again in a moment, or contact support if the problem persists.",
        data: null,
        error: true,
        errorMessage: error.message || "Unknown error occurred",
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
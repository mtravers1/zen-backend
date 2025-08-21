import { LimitedMap } from "../lib/limitedMap.js";
import aiService from "../services/ai/service.js";

const makeRequest = async (req, res) => {
  console.log('\n🎯 [AI Controller] ====== REQUEST RECEIVED ======');
  console.log("[AI Controller] 🚀 ENDPOINT HIT - makeRequest called");
  console.log("[AI Controller] Request method:", req.method);
  console.log("[AI Controller] Request URL:", req.url);
  console.log("[AI Controller] Request path:", req.path);
  console.log("[AI Controller] Headers:", Object.keys(req.headers));
  console.log("[AI Controller] Timestamp:", new Date().toISOString());
  
  try {
    const { uid } = req.user || {};
    const { prompt, profileId, messages, screen, dataScreen, context } = req.body || {};
    
    console.log('\n🔍 [AI Controller] ====== DETAILED INPUT ANALYSIS ======');
    console.log("[AI Controller] RAW REQUEST BODY:", JSON.stringify(req.body, null, 2));
    console.log("[AI Controller] RAW USER OBJECT:", JSON.stringify(req.user, null, 2));
    console.log("[AI Controller] EXTRACTED VALUES:");
    console.log("  - prompt:", `"${prompt}"`);
    console.log("  - prompt type:", typeof prompt);
    console.log("  - prompt length:", prompt ? prompt.length : 0);
    console.log("  - uid:", `"${uid}"`);
    console.log("  - profileId:", `"${profileId}"`);
    console.log("  - messages:", messages);
    console.log("  - screen:", `"${screen}"`);
    console.log("  - dataScreen:", `"${dataScreen}"`);
    console.log("  - context:", JSON.stringify(context, null, 2));
    
    console.log('\n📋 [AI Controller] ====== REQUEST VALIDATION ======');
    console.log("[AI Controller] Received request:", { 
      uid, 
      profileId, 
      hasPrompt: !!prompt, 
      hasMessages: !!messages, 
      promptPreview: prompt ? prompt.substring(0, 100) + '...' : 'NO_PROMPT',
      messagesCount: messages ? messages.length : 0,
      screen,
      dataScreen,
      hasContext: !!context,
      contextKeys: context ? Object.keys(context) : [],
      contextDetails: context ? {
        screen: context.screen,
        device: context.device,
        time: context.time,
        user: context.user,
        chat: context.chat
      } : 'NO_CONTEXT',
      bodyKeys: req.body ? Object.keys(req.body) : [],
      bodySize: req.body ? JSON.stringify(req.body).length : 0,
      userKeys: req.user ? Object.keys(req.user) : [],
      hasUser: !!req.user
    });
    
    if (!uid) {
      console.error("[AI Controller] No UID found in req.user. User keys:", req.user ? Object.keys(req.user) : 'no user object');
      return res.status(401).json({ 
        text: "Authentication error. Please sign in again.",
        data: null,
        error: true,
        errorMessage: "User ID not found in token"
      });
    }
    
    if (!profileId) {
      console.error("[AI Controller] No profileId in request body. Body keys:", req.body ? Object.keys(req.body) : 'no body');
      return res.status(400).json({ 
        text: "Profile ID is required to process your request.",
        data: null,
        error: true,
        errorMessage: "Profile ID is required"
      });
    }
    
    if (!prompt) {
      console.error("[AI Controller] No prompt in request body");
      return res.status(400).json({ 
        text: "Please provide a question or request for the AI to process.",
        data: null,
        error: true,
        errorMessage: "Prompt is required"
      });
    }
    
    console.log('\n🚀 [AI Controller] ====== CALLING AI SERVICE ======');
    console.log("[AI Controller] Calling AI service with params:", {
      prompt,
      uid,
      profileId,
      messages: messages || [],
      screen,
      dataScreen
    });
    console.log("[AI Controller] AI Service call timestamp:", new Date().toISOString());
    
    const result = await aiService.makeRequest(
      prompt,
      uid,
      profileId,
      messages || [],
      screen,
      null, // Don't pass res object to avoid circular references
      dataScreen,
      context || {} // Pass context to AI service
    );
    
    console.log('\n📥 [AI Controller] ====== AI SERVICE RESPONSE ======');
    console.log("[AI Controller] AI service returned:", {
      resultType: typeof result,
      resultKeys: result ? Object.keys(result) : [],
      hasText: result ? !!result.text : false,
      textValue: result ? result.text || 'NO_TEXT' : 'NO_RESULT',
      hasResponse: result ? !!result.response : false,
      responseValue: result ? result.response || 'NO_RESPONSE' : 'NO_RESULT',
      hasData: result ? !!result.data : false,
      dataKeys: result && result.data ? Object.keys(result.data) : [],
      hasError: result ? !!result.error : false,
      errorMessage: result ? result.errorMessage || 'NO_ERROR' : 'NO_RESULT'
    });
    
    if (result && result.text) {
      console.log("[AI Controller] Response text length:", result.text.length);
      console.log("[AI Controller] Response text preview:", result.text.substring(0, 200) + '...');
    }
    
    // Ensure we return a proper response structure
    const response = {
      text: result.text || result.response || "No response received",
      data: result.data || null,
      error: result.error || false,
      errorMessage: result.errorMessage || undefined,
    };
    
    console.log('\n🎉 [AI Controller] ====== FINAL RESPONSE ======');
    console.log("[AI Controller] Final response being sent to client:", {
      text: response.text,
      textLength: response.text ? response.text.length : 0,
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : [],
      error: response.error,
      errorMessage: response.errorMessage
    });
    
    if (response.text && response.text.length > 200) {
      console.log("[AI Controller] Full response text:", response.text);
    }
    
    return res.status(200).json(response);
  } catch (error) {
    console.error("[AI Controller] Error:", error);
    
    // Return a proper error response with clear message
    const errorResponse = {
      text: "Sorry, there was an error processing your request. Please try again or contact support if the problem persists.",
      data: null,
      error: true,
      errorMessage: error.message || "Unknown error occurred",
    };
    
    console.log("[AI Controller] Sending error response to client:", errorResponse);
    return res.status(500).json(errorResponse);
  }
};

const stream = async (req, res) => {
  const { uid } = req.user;
  console.log("Received request to stream AI response for user:", uid);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  addConnection(uid, res);

  const keepAlive = setInterval(() => {
    res.write(":\n\n");
  }, 15000);

  req.on("close", () => {
    console.log("Closed SSE connection for user:", uid);
    clearInterval(keepAlive);
    removeConnection(uid);
    res.end();
  });
};

const sseConnections = new LimitedMap(1000); // Limit to 1000 connections

function addConnection(uid, res) {
  sseConnections.set(uid, res);
}

function removeConnection(uid) {
  sseConnections.delete(uid);
}

function sendToUser(uid, data) {
  const res = sseConnections.get(uid);
  if (res) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

const test = async (req, res) => {
  try {
    console.log("[AI Controller] Test endpoint called");
    
    // Check environment variables
    const hasGroqKey = !!process.env.GROQ_API_KEY;
    const hasGroqModel = !!process.env.GROQ_AI_MODEL;
    const groqKeyLength = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.length : 0;
    const groqModel = process.env.GROQ_AI_MODEL || "NOT_SET";
    
    // Test AI service initialization
    let aiServiceStatus = "Not tested";
    let promptTestStatus = "Not tested";
    try {
      const aiService = (await import("../services/ai/service.js")).default;
      aiServiceStatus = "Service loaded successfully";
      
      // Test prompt building
      try {
        const { buildScreenPrompt, getProductionSystemPrompt } = await import("../services/ai/prompts.js");
        const systemPrompt = getProductionSystemPrompt();
        const screenPrompt = buildScreenPrompt("dashboard", "overview");
        
        promptTestStatus = {
          hasSystemPrompt: !!systemPrompt,
          systemPromptLength: systemPrompt ? systemPrompt.length : 0,
          hasScreenPrompt: !!screenPrompt,
          screenPromptLength: screenPrompt ? screenPrompt.length : 0
        };
      } catch (promptError) {
        promptTestStatus = `Prompt test failed: ${promptError.message}`;
      }
    } catch (error) {
      aiServiceStatus = `Service load failed: ${error.message}`;
    }
    
    const testResponse = {
      status: "AI Service Test",
      timestamp: new Date().toISOString(),
      environment: {
        hasGroqKey,
        hasGroqModel,
        groqKeyLength,
        groqModel,
        nodeEnv: process.env.NODE_ENV || "NOT_SET"
      },
      aiServiceStatus,
      promptTestStatus,
      message: "AI service test completed"
    };
    
    console.log("[AI Controller] Test response:", testResponse);
    return res.status(200).json(testResponse);
  } catch (error) {
    console.error("[AI Controller] Test error:", error);
    return res.status(500).json({ 
      error: "Test failed", 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const aiController = {
  makeRequest,
  stream,
  sendToUser,
  test,
};

export default aiController;

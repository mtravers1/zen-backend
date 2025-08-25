import { LimitedMap } from "../lib/limitedMap.js";
import aiService from "../services/ai/service.js";

// Cache to control active requests and prevent duplicates
const activeRequests = new LimitedMap(1000); // Limit of 1000 simultaneous requests
const requestTimeouts = new LimitedMap(1000); // Timeouts for each request

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
    const { prompt, profileId, messages, screen, dataScreen, context, requestId } = req.body || {};
    
    console.log('\n🔍 [AI Controller] ====== DETAILED INPUT ANALYSIS ======');
    console.log("[AI Controller] RAW REQUEST BODY:", JSON.stringify(req.body, null, 2));
    console.log("[AI Controller] RAW USER OBJECT:", JSON.stringify(req.user, null, 2));
    console.log("[AI Controller] EXTRACTED VALUES:");
    console.log("  - prompt:", `"${prompt}"`);
    console.log("  - prompt type:", typeof prompt);
    console.log("  - prompt length:", prompt ? prompt.length : 0);
    console.log("  - uid:", `"${uid}"`);
    console.log("  - profileId:", `"${profileId}"`);
    console.log("  - requestId:", requestId || 'NOT_PROVIDED');
    console.log("  - messages:", messages);
    console.log("  - screen:", `"${screen}"`);
    console.log("  - dataScreen:", `"${dataScreen}"`);
    console.log("  - context:", JSON.stringify(context, null, 2));
    
    // Generate unique request ID if not provided
    const uniqueRequestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('\n🆔 [AI Controller] ====== REQUEST ID VALIDATION ======');
    console.log("[AI Controller] Request ID:", uniqueRequestId);
    
    // Check if there's already an active request for this user
    const userRequestKey = `${uid}_${uniqueRequestId}`;
    const existingRequest = activeRequests.get(userRequestKey);
    
    if (existingRequest) {
      console.log("[AI Controller] ⚠️ Duplicate request detected:", {
        requestId: uniqueRequestId,
        uid,
        existingRequestStatus: existingRequest.status,
        existingRequestTimestamp: existingRequest.timestamp
      });
      
      // If request is still processing, return status
      if (existingRequest.status === 'processing') {
        return res.status(200).json({
          text: "Your request is already being processed. Please wait for the response.",
          data: {
            status: 'processing',
            requestId: uniqueRequestId,
            message: 'Request in progress'
          },
          error: false,
          errorMessage: undefined,
          isDuplicate: true
        });
      }
      
      // If request was completed, return the result
      if (existingRequest.status === 'completed') {
        console.log("[AI Controller] ✅ Returning cached result for duplicate request");
        return res.status(200).json(existingRequest.result);
      }
    }
    
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
      hasUser: !!req.user,
      requestId: uniqueRequestId
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
    
    // Register request as processing
    const requestInfo = {
      status: 'processing',
      timestamp: new Date().toISOString(),
      prompt,
      uid,
      profileId,
      screen,
      dataScreen
    };
    
    activeRequests.set(userRequestKey, requestInfo);
    
    // Set timeout for request (5 minutes)
    const requestTimeout = setTimeout(() => {
      console.log("[AI Controller] ⏰ Request timeout reached:", userRequestKey);
      activeRequests.delete(userRequestKey);
      requestTimeouts.delete(userRequestKey);
    }, 5 * 60 * 1000);
    
    requestTimeouts.set(userRequestKey, requestTimeout);
    
    console.log('\n🚀 [AI Controller] ====== CALLING AI SERVICE ======');
    console.log("[AI Controller] Calling AI service with params:", {
      prompt,
      uid,
      profileId,
      messages: messages || [],
      screen,
      dataScreen,
      requestId: uniqueRequestId
    });
    console.log("[AI Controller] AI Service call timestamp:", new Date().toISOString());
    
    // Call AI service
    const result = await aiService.makeRequest(
      prompt,
      uid,
      profileId,
      messages || [],
      screen,
      null, // Don't pass res object to avoid circular references
      dataScreen,
      context || {}, // Pass context to AI service
      uniqueRequestId // Pass request ID for tracking
    );
    
    // Clear timeout
    if (requestTimeouts.has(userRequestKey)) {
      clearTimeout(requestTimeouts.get(userRequestKey));
      requestTimeouts.delete(userRequestKey);
    }
    
    // Update request status to completed
    const completedRequestInfo = {
      ...requestInfo,
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: result
    };
    
    activeRequests.set(userRequestKey, completedRequestInfo);
    
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
      errorMessage: result ? result.errorMessage || 'NO_ERROR' : 'NO_RESULT',
      requestId: uniqueRequestId
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
      requestId: uniqueRequestId,
      status: 'completed'
    };
    
    console.log('\n🎉 [AI Controller] ====== FINAL RESPONSE ======');
    console.log("[AI Controller] Final response being sent to client:", {
      text: response.text,
      textLength: response.text ? response.text.length : 0,
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : [],
      error: response.error,
      errorMessage: response.errorMessage,
      requestId: uniqueRequestId
    });
    
    if (response.text && response.text.length > 200) {
      console.log("[AI Controller] Full response text:", response.text);
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error("[AI Controller] Error:", error);
    
    // If there's an error, clean up active request
    if (req.user && req.body) {
      const { uid } = req.user;
      const { requestId } = req.body;
      const userRequestKey = `${uid}_${requestId || 'unknown'}`;
      
      if (activeRequests.has(userRequestKey)) {
        console.log("[AI Controller] 🧹 Cleaning up failed request:", userRequestKey);
        activeRequests.delete(userRequestKey);
        
        if (requestTimeouts.has(userRequestKey)) {
          clearTimeout(requestTimeouts.get(userRequestKey));
          requestTimeouts.delete(userRequestKey);
        }
      }
    }
    
    // Return a proper error response with clear message
    const errorResponse = {
      text: "Sorry, there was an error processing your request. Please try again or contact support if the problem persists.",
      data: null,
      error: true,
      errorMessage: error.message || "Unknown error occurred",
      status: 'error'
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
  const connection = sseConnections.get(uid);
  if (connection) {
    try {
      connection.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`[AI Controller] Error sending data to user ${uid}:`, error);
      removeConnection(uid);
    }
  }
}

const test = async (req, res) => {
  console.log('\n🧪 [AI Controller] ====== TEST ENDPOINT ======');
  console.log("[AI Controller] Test endpoint hit");
  
  try {
    const { uid } = req.user || {};
    const { prompt, profileId, messages, screen, dataScreen, context } = req.body || {};
    
    console.log("[AI Controller] Test - User object:", {
      hasUser: !!req.user,
      userKeys: req.user ? Object.keys(req.user) : [],
      uid: uid || 'NOT_FOUND',
      uidType: typeof uid
    });
    
    console.log("[AI Controller] Test - Request body:", {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      prompt: prompt || 'NOT_PROVIDED',
      profileId: profileId || 'NOT_PROVIDED',
      screen: screen || 'NOT_PROVIDED'
    });
    
    console.log("[AI Controller] Test - Headers:", {
      hasAuth: !!req.headers.authorization,
      authHeader: req.headers.authorization ? req.headers.authorization.substring(0, 50) + '...' : 'NOT_FOUND',
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent']
    });
    
    // Test authentication
    if (!uid) {
      return res.status(401).json({
        status: "authentication_failed",
        message: "No UID found in request",
        details: {
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : [],
          hasAuthHeader: !!req.headers.authorization
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Test parameter passing
    const testParams = {
      prompt: prompt || "test prompt",
      uid: uid,
      profileId: profileId || "test_profile",
      messages: messages || [],
      screen: screen || "test_screen",
      dataScreen: dataScreen || "test_data_screen",
      context: context || {}
    };
    
    console.log("[AI Controller] Test - Parameters to pass to service:", testParams);
    
    // Test service call with minimal parameters
    try {
      const result = await aiService.makeRequest(
        testParams.prompt,
        testParams.uid,
        testParams.profileId,
        testParams.messages,
        testParams.screen,
        null,
        testParams.dataScreen,
        testParams.context
      );
      
      console.log("[AI Controller] Test - Service call successful:", {
        hasResult: !!result,
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : [],
        hasError: result ? !!result.error : false,
        errorMessage: result ? result.errorMessage : 'none'
      });
      
      return res.status(200).json({
        status: "test_successful",
        message: "AI service test completed",
        authentication: {
          uid: uid,
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : []
        },
        parameters: testParams,
        serviceResult: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (serviceError) {
      console.error("[AI Controller] Test - Service call failed:", serviceError);
      
      return res.status(500).json({
        status: "service_test_failed",
        message: "AI service test failed",
        authentication: {
          uid: uid,
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : []
        },
        parameters: testParams,
        error: {
          message: serviceError.message,
          stack: serviceError.stack
        },
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error("[AI Controller] Test - General error:", error);
    
    return res.status(500).json({
      status: "test_failed",
      message: "Test endpoint failed",
      error: {
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    });
  }
};

const checkRequestStatus = async (req, res) => {
  console.log('\n📊 [AI Controller] ====== CHECK REQUEST STATUS ======');
  
  try {
    const { uid } = req.user || {};
    const { requestId } = req.params || {};
    
    if (!uid) {
      return res.status(401).json({
        status: "authentication_failed",
        message: "User ID not found in token",
        timestamp: new Date().toISOString()
      });
    }
    
    if (!requestId) {
      return res.status(400).json({
        status: "bad_request",
        message: "Request ID is required",
        timestamp: new Date().toISOString()
      });
    }
    
    const userRequestKey = `${uid}_${requestId}`;
    const requestInfo = activeRequests.get(userRequestKey);
    
    if (!requestInfo) {
      return res.status(404).json({
        status: "not_found",
        message: "Request not found or expired",
        requestId,
        uid,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log("[AI Controller] Request status found:", {
      requestId,
      uid,
      status: requestInfo.status,
      timestamp: requestInfo.timestamp,
      completedAt: requestInfo.completedAt
    });
    
    const response = {
      status: requestInfo.status,
      requestId,
      timestamp: requestInfo.timestamp,
      completedAt: requestInfo.completedAt,
      prompt: requestInfo.prompt,
      screen: requestInfo.screen,
      dataScreen: requestInfo.dataScreen
    };
    
    // If request was completed, include the result
    if (requestInfo.status === 'completed' && requestInfo.result) {
      response.result = requestInfo.result;
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error("[AI Controller] Error checking request status:", error);
    
    return res.status(500).json({
      status: "error",
      message: "Failed to check request status",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

const getActiveRequests = async (req, res) => {
  console.log('\n📋 [AI Controller] ====== GET ACTIVE REQUESTS ======');
  
  try {
    const { uid } = req.user || {};
    
    if (!uid) {
      return res.status(401).json({
        status: "authentication_failed",
        message: "User ID not found in token",
        timestamp: new Date().toISOString()
      });
    }
    
    // Filter active requests for this user
    const userRequests = [];
    for (const [key, requestInfo] of activeRequests.entries()) {
      if (key.startsWith(`${uid}_`)) {
        const requestId = key.replace(`${uid}_`, '');
        userRequests.push({
          requestId,
          status: requestInfo.status,
          timestamp: requestInfo.timestamp,
          completedAt: requestInfo.completedAt,
          prompt: requestInfo.prompt,
          screen: requestInfo.screen,
          dataScreen: requestInfo.dataScreen
        });
      }
    }
    
    console.log("[AI Controller] Found active requests for user:", {
      uid,
      count: userRequests.length
    });
    
    return res.status(200).json({
      status: "success",
      message: "Active requests retrieved",
      uid,
      requests: userRequests,
      count: userRequests.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("[AI Controller] Error getting active requests:", error);
    
    return res.status(500).json({
      status: "error",
      message: "Failed to get active requests",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

const cancelRequest = async (req, res) => {
  console.log('\n❌ [AI Controller] ====== CANCEL REQUEST ======');
  
  try {
    const { uid } = req.user || {};
    const { requestId } = req.params || {};
    
    if (!uid) {
      return res.status(401).json({
        status: "authentication_failed",
        message: "User ID not found in token",
        timestamp: new Date().toISOString()
      });
    }
    
    if (!requestId) {
      return res.status(400).json({
        status: "bad_request",
        message: "Request ID is required",
        timestamp: new Date().toISOString()
      });
    }
    
    const userRequestKey = `${uid}_${requestId}`;
    const requestInfo = activeRequests.get(userRequestKey);
    
    if (!requestInfo) {
      return res.status(404).json({
        status: "not_found",
        message: "Request not found or already completed",
        requestId,
        uid,
        timestamp: new Date().toISOString()
      });
    }
    
    if (requestInfo.status === 'completed') {
      return res.status(400).json({
        status: "bad_request",
        message: "Cannot cancel completed request",
        requestId,
        uid,
        status: requestInfo.status,
        timestamp: new Date().toISOString()
      });
    }
    
    // Cancel the request
    activeRequests.delete(userRequestKey);
    
    // Clear timeout if exists
    if (requestTimeouts.has(userRequestKey)) {
      clearTimeout(requestTimeouts.get(userRequestKey));
      requestTimeouts.delete(userRequestKey);
    }
    
    console.log("[AI Controller] Request cancelled:", {
      requestId,
      uid,
      status: requestInfo.status,
      timestamp: requestInfo.timestamp
    });
    
    return res.status(200).json({
      status: "success",
      message: "Request cancelled successfully",
      requestId,
      uid,
      cancelledAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("[AI Controller] Error cancelling request:", error);
    
    return res.status(500).json({ 
      status: "error",
      message: "Failed to cancel request",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

const aiController = {
  makeRequest,
  stream,
  sendToUser,
  test,
  checkRequestStatus,
  getActiveRequests,
  cancelRequest
};

export default aiController;

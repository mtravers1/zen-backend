import { LimitedMap } from "../lib/limitedMap.js";
import aiService from "../services/ai/service.js";

const makeRequest = async (req, res) => {
  const startTime = Date.now();
  const requestId = req.body.requestId;
  
  try {
    console.log('\n🚀 [AI Controller] ====== STARTING AI REQUEST ======');
    console.log(`[AI Controller] Request ID: ${requestId || 'not_provided'}`);
    console.log(`[AI Controller] Timestamp: ${new Date().toISOString()}`);
    console.log(`[AI Controller] Request body:`, JSON.stringify(req.body, null, 2));
    
    // Extract parameters from request body
    const { prompt, profileId, messages, screen, dataScreen, context } = req.body;
    
    // Get UID from authenticated user
    const uid = req.user?.uid;
    
    console.log(`[AI Controller] Extracted parameters:`, {
      hasPrompt: !!prompt,
      promptLength: prompt?.length,
      hasProfileId: !!profileId,
      profileId,
      hasUid: !!uid,
      uid,
      hasMessages: !!messages,
      messagesCount: messages?.length || 0,
      hasScreen: !!screen,
      screen,
      hasDataScreen: !!dataScreen,
      dataScreen,
      hasContext: !!context,
      contextKeys: context ? Object.keys(context) : []
    });

    // 🔍 SCREEN IDENTIFICATION DEBUG LOGS
    console.error(`[SCREEN DEBUG] ====== SCREEN IDENTIFICATION FLOW ======`);
    console.error(`[SCREEN DEBUG] Raw screen parameter received: "${screen}"`);
    console.error(`[SCREEN DEBUG] Raw dataScreen parameter received: "${dataScreen}"`);
    console.error(`[SCREEN DEBUG] Context object received:`, JSON.stringify(context, null, 2));
    console.error(`[SCREEN DEBUG] Context screen info:`, context?.screen ? {
      currentScreen: context.screen.currentScreen,
      dataScreen: context.screen.dataScreen,
      isMainScreen: context.screen.isMainScreen,
      isFinancialScreen: context.screen.isFinancialScreen
    } : 'NO SCREEN CONTEXT');
    console.error(`[SCREEN DEBUG] ==========================================`);

    // Log detailed message structure for debug
    if (messages && messages.length > 0) {
      console.log(`[AI Controller] 📝 Detailed message structure:`, {
        messagesCount: messages.length,
        messageDetails: messages.map((msg, index) => ({
          index,
          hasRole: !!msg?.role,
          hasContent: !!msg?.content,
          hasMessage: !!msg?.message,
          hasResponse: !!msg?.response,
          role: msg?.role,
          contentLength: msg?.content?.length || 0,
          messageLength: msg?.message?.length || 0,
          responseLength: msg?.response?.length || 0,
          messagePreview: msg?.message?.substring(0, 100) + '...',
          responsePreview: msg?.response?.substring(0, 100) + '...',
          fullMessage: msg
        }))
      });
    }

    // Validate required parameters
    if (!prompt) {
      console.error(`[AI Controller] ❌ Missing prompt`);
      return res.status(400).json({
        text: "Prompt is required",
        data: { error: "Missing prompt" },
        error: true,
        errorMessage: "Prompt is required"
      });
    }

    if (!uid) {
      console.error(`[AI Controller] ❌ Missing UID from req.user`);
      console.log(`[AI Controller] req.user object:`, req.user);
      return res.status(401).json({
        text: "Authentication required",
        data: { error: "Missing UID" },
        error: true,
        errorMessage: "Authentication required"
      });
    }

    if (!profileId) {
      console.error(`[AI Controller] ❌ Missing profileId`);
      return res.status(400).json({
        text: "Profile ID is required",
        data: { error: "Missing profileId" },
        error: true,
        errorMessage: "Profile ID is required"
      });
    }

    console.log(`[AI Controller] ✅ All required parameters validated successfully`);

    // Cache to control active requests and prevent duplicates
    const activeRequests = new LimitedMap(1000); // Limit of 1000 simultaneous requests
    const requestTimeouts = new LimitedMap(1000); // Timeouts for each request

    const uniqueRequestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userRequestKey = `${uid}_${uniqueRequestId}`;
    const existingRequest = activeRequests.get(userRequestKey);

    console.log(`[AI Controller] Request control:`, {
      uniqueRequestId,
      userRequestKey,
      hasExistingRequest: !!existingRequest,
      existingRequestStatus: existingRequest?.status
    });

    if (existingRequest) {
      if (existingRequest.status === 'processing') {
        console.log(`[AI Controller] ⚠️ Duplicate request detected - already processing`);
        return res.status(200).json({
          text: "Your request is already being processed. Please wait for the response.",
          data: { status: 'processing', requestId: uniqueRequestId, message: 'Request in progress' },
          error: false, errorMessage: undefined, isDuplicate: true
        });
      }
      if (existingRequest.status === 'completed') {
        console.log(`[AI Controller] ✅ Returning cached result for duplicate request`);
        return res.status(200).json(existingRequest.result);
      }
    }

    // Register request as processing
    const requestInfo = { status: 'processing', timestamp: new Date().toISOString(), prompt, uid, profileId, screen, dataScreen };
    activeRequests.set(userRequestKey, requestInfo);

    console.log(`[AI Controller] 📝 Registered request as processing:`, requestInfo);

    // Set timeout for request (5 minutes)
    const requestTimeout = setTimeout(() => {
      console.log(`[AI Controller] ⏰ Request timeout reached for: ${userRequestKey}`);
      activeRequests.delete(userRequestKey);
      requestTimeouts.delete(userRequestKey);
    }, 5 * 60 * 1000);
    requestTimeouts.set(userRequestKey, requestTimeout);

    console.log(`[AI Controller] 🚀 Calling AI Service with parameters:`, {
      prompt,
      uid,
      profileId,
      messagesCount: messages?.length || 0,
      screen,
      dataScreen,
      contextKeys: context ? Object.keys(context) : [],
      requestId: uniqueRequestId
    });

    const result = await aiService.makeRequest(
      prompt, uid, profileId, messages || [], screen, null, dataScreen, context || {}, uniqueRequestId
    );

    console.log(`[AI Controller] ✅ AI Service returned result:`, {
      hasResult: !!result,
      resultType: typeof result,
      hasText: !!result?.text,
      textLength: result?.text?.length,
      hasData: !!result?.data,
      hasError: result?.error,
      errorMessage: result?.errorMessage,
      requestId: uniqueRequestId
    });

    // Clear timeout and update status
    if (requestTimeouts.has(userRequestKey)) {
      clearTimeout(requestTimeouts.get(userRequestKey));
      requestTimeouts.delete(userRequestKey);
    }
    activeRequests.set(userRequestKey, { ...requestInfo, status: 'completed', completedAt: new Date().toISOString(), result: result });

    const duration = Date.now() - startTime;
    console.log(`[AI Controller] 🏁 Request completed in ${duration}ms`);

    // Send response
    return res.status(200).json({
      ...result,
      requestId: uniqueRequestId,
      processingTime: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[AI Controller] ❌ Error in makeRequest after ${duration}ms:`, error);
    console.error(`[AI Controller] Error stack:`, error.stack);
    
    return res.status(500).json({
      text: "An error occurred while processing your request",
      data: { error: error.message },
      error: true,
      errorMessage: error.message,
      requestId: requestId || 'unknown',
      processingTime: duration
    });
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

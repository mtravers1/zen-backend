import { LimitedMap } from "../lib/limitedMap.js";
import aiService from "../services/ai/service.js";

const makeRequest = async (req, res) => {
  try {
    const { uid } = req.user;
    const { prompt, profileId, messages, screen } = req.body;
    
    console.log("[AI Controller] Received request:", { 
      uid, 
      profileId, 
      hasPrompt: !!prompt, 
      hasMessages: !!messages, 
      screen,
      body: req.body,
      user: req.user 
    });
    
    if (!uid) {
      console.error("[AI Controller] No UID found in req.user:", req.user);
      return res.status(401).json({ error: "User ID not found in token" });
    }
    
    if (!profileId) {
      console.error("[AI Controller] No profileId in request body:", req.body);
      return res.status(400).json({ error: "Profile ID is required" });
    }
    
    if (!prompt) {
      console.error("[AI Controller] No prompt in request body:", req.body);
      return res.status(400).json({ error: "Prompt is required" });
    }
    
    console.log("[AI Controller] Calling AI service with params:", {
      prompt,
      uid,
      profileId,
      messages: messages || [],
      screen
    });
    
    const result = await aiService.makeRequest(
      prompt,
      uid,
      profileId,
      messages || [],
      screen,
      res
    );
    
    console.log("[AI Controller] AI service returned:", result);
    return res.status(200).json(result);
  } catch (error) {
    console.error("[AI Controller] Error:", error);
    return res.status(500).json({ error: error.message });
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

const aiController = {
  makeRequest,
  stream,
  sendToUser,
};

export default aiController;

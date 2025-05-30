import { LimitedMap } from "../lib/limitedMap.js";
import aiService from "../services/ai.service.js";

const makeRequest = async (req, res) => {
  try {
    const { prompt, profileId, messages, screen } = req.body;
    const { uid } = req.user;
    if (!prompt || !profileId || !messages || !screen) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    await aiService.makeRequest(prompt, uid, profileId, messages, screen, res);
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({ error: "Internal server error" })}\n\n`
    );
    res.end();
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

import { response } from "express";
import aiService from "../services/ai.service.js";

const makeRequest = async (req, res) => {
  const { prompt, profile, messages, screen } = req.body;
  const { uid } = req.user;
  if (!prompt || !profile || !messages || !screen) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const response = await aiService.makeRequest(
    prompt,
    uid,
    profile,
    messages,
    screen
  );
  res.status(200).json(response);
};

const aiController = {
  makeRequest,
};

export default aiController;

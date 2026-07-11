import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

// Helper — returns 503 if bot manager not ready yet
const getBotManager = (req: any, res: any) => {
  const botManager = req.app.botManager;
  if (!botManager) {
    res.status(503).json({ error: "Service Unavailable", message: "Bot manager is initializing, please retry in a moment." });
    return null;
  }
  return botManager;
};

// These routes delegate to the BotManager singleton attached to the app
router.get("/sessions", (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  res.json(botManager.getSessionList());
});

router.post("/connect", async (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId, phoneNumber, method } = req.body;

  if (!sessionId || !phoneNumber || !method) {
    res.status(400).json({ error: "Bad Request", message: "sessionId, phoneNumber, and method are required" });
    return;
  }

  if (!["qr", "pairing"].includes(method)) {
    res.status(400).json({ error: "Bad Request", message: "method must be 'qr' or 'pairing'" });
    return;
  }

  if (botManager.hasSession(sessionId)) {
    res.status(409).json({ error: "Conflict", message: `Session '${sessionId}' already exists` });
    return;
  }

  try {
    await botManager.createSession(sessionId, phoneNumber, method);
    res.json({ success: true, message: "Session created", sessionId });
  } catch (err: any) {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: "Bad Request", message: "sessionId is required" });
    return;
  }

  if (!botManager.hasSession(sessionId)) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }

  try {
    await botManager.removeSession(sessionId);
    res.json({ success: true, message: "Session disconnected" });
  } catch (err: any) {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

router.get("/status/:sessionId", (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.params;

  const session = botManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }

  res.json(session.getStatus());
});

router.post("/sessions/:sessionId/reconnect", async (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.params;

  if (!botManager.hasSession(sessionId)) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }

  try {
    await botManager.resetSessionCreds(sessionId);
    res.json({ success: true, message: "Session reset. Scan QR or use pairing code." });
  } catch (err: any) {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

router.post("/sessions/:sessionId/logo", (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.params;
  const { imageData } = req.body;

  if (!imageData || typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
    res.status(400).json({ error: "Bad Request", message: "imageData must be a valid image data URL (data:image/...)" });
    return;
  }

  const session = botManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }

  session.meta.logo = imageData;
  const metaPath = path.join(botManager.sessionsDir, sessionId, "meta.json");
  fs.writeFileSync(metaPath, JSON.stringify(session.meta, null, 2));

  res.json({ success: true, logo: imageData.substring(0, 50) + "..." });
});

router.patch("/sessions/:sessionId/logo-url", (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.params;
  const { url } = req.body;

  if (!url || typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    res.status(400).json({ error: "Bad Request", message: "url must be a valid http/https URL" });
    return;
  }

  const session = botManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }

  session.meta.logo = url;
  const metaPath = path.join(botManager.sessionsDir, sessionId, "meta.json");
  fs.writeFileSync(metaPath, JSON.stringify(session.meta, null, 2));

  res.json({ success: true, logo: url });
});

router.get("/sessions/:sessionId/settings", (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.params;
  const settings = botManager.getSessionSettings(sessionId);
  if (!settings) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }
  res.json(settings);
});

router.patch("/sessions/:sessionId/settings", (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.params;
  const result = botManager.updateSessionSettings(sessionId, req.body);
  if (!result) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }
  res.json({ success: true, settings: result });
});

router.post("/sessions/:sessionId/owner", (req, res) => {
  const botManager = getBotManager(req, res);
  if (!botManager) return;
  const { sessionId } = req.params;
  const { ownerNumber } = req.body;

  if (!ownerNumber) {
    res.status(400).json({ error: "Bad Request", message: "ownerNumber is required" });
    return;
  }

  if (!botManager.hasSession(sessionId)) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }

  const success = botManager.setSessionOwner(sessionId, ownerNumber);
  if (!success) {
    res.status(400).json({ error: "Bad Request", message: "Invalid owner number" });
    return;
  }

  res.json({ success: true, message: "Owner updated", ownerNumber: ownerNumber.replace(/\D/g, '') });
});

export default router;

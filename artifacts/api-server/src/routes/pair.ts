import { Router, type IRouter } from "express";

const router: IRouter = Router();

const getBotManager = (req: any, res: any) => {
  const bm = req.app.botManager;
  if (!bm) {
    res.status(503).json({ error: "Service Unavailable", message: "Bot manager initializing, retry shortly." });
    return null;
  }
  return bm;
};

// POST /api/pair/code
// body: { number, sessionId? }
// Creates a pairing-code session and returns the code once available
router.post("/code", async (req, res) => {
  const bm = getBotManager(req, res);
  if (!bm) return;

  const { number, sessionId } = req.body;
  if (!number) {
    res.status(400).json({ error: "Bad Request", message: "number is required" });
    return;
  }

  const sid = sessionId || `pair-${Date.now()}`;

  if (bm.hasSession(sid)) {
    res.status(409).json({ error: "Conflict", message: `Session '${sid}' already exists` });
    return;
  }

  try {
    await bm.createSession(sid, number, "pairing");
    res.json({ success: true, sessionId: sid, message: "Pairing session started. Poll /api/pair/status/:sessionId for the code." });
  } catch (err: any) {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

// POST /api/pair/qr
// body: { sessionId?, phoneNumber? }
// Creates a QR session
router.post("/qr", async (req, res) => {
  const bm = getBotManager(req, res);
  if (!bm) return;

  const { sessionId, phoneNumber } = req.body;
  const sid = sessionId || `qr-${Date.now()}`;

  if (bm.hasSession(sid)) {
    res.status(409).json({ error: "Conflict", message: `Session '${sid}' already exists` });
    return;
  }

  try {
    await bm.createSession(sid, phoneNumber || "", "qr");
    res.json({ success: true, sessionId: sid, message: "QR session started. Poll /api/pair/status/:sessionId for the QR." });
  } catch (err: any) {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

// GET /api/pair/status/:sessionId
// Returns { status, qrCode, pairingCode, ... }
router.get("/status/:sessionId", (req, res) => {
  const bm = getBotManager(req, res);
  if (!bm) return;

  const session = bm.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Not Found", message: `Session '${req.params.sessionId}' not found` });
    return;
  }
  res.json(session.getStatus());
});

// DELETE /api/pair/cancel/:sessionId
// Cancels a pairing session
router.delete("/cancel/:sessionId", async (req, res) => {
  const bm = getBotManager(req, res);
  if (!bm) return;

  const { sessionId } = req.params;
  if (!bm.hasSession(sessionId)) {
    res.status(404).json({ error: "Not Found", message: `Session '${sessionId}' not found` });
    return;
  }
  try {
    await bm.removeSession(sessionId);
    res.json({ success: true, message: "Session cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;

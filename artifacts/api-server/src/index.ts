import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";

// ── Suppress noisy Baileys/libsignal-node internal protocol messages ─────────
// These appear from libsignal's pre-captured console reference — intercept at
// process.stdout / stderr write level so they cannot be bypassed.
const SUPPRESS_PATTERNS = [
  'Closing session:',
  'Closing open session',
  'Removing old closed session',
  'Session error:',
  'Failed to decrypt message',
  'Decrypted message with closed session',
  'Bad MAC',
  'pendingPreKey',
  'currentRatchet',
  'ephemeralKeyPair',
  'registrationId:',
  'indexInfo:',
  'baseKeyType:',
];

const _shouldSuppressChunk = (chunk: any): boolean => {
  try {
    const s = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
    return SUPPRESS_PATTERNS.some(p => s.includes(p));
  } catch (_) { return false; }
};

// Intercept stdout
const _origStdoutWrite = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (chunk: any, ...rest: any[]) => {
  if (_shouldSuppressChunk(chunk)) return true;
  return _origStdoutWrite(chunk, ...rest);
};

// Intercept stderr  
const _origStderrWrite = process.stderr.write.bind(process.stderr);
(process.stderr as any).write = (chunk: any, ...rest: any[]) => {
  if (_shouldSuppressChunk(chunk)) return true;
  return _origStderrWrite(chunk, ...rest);
};
// ─────────────────────────────────────────────────────────────────────────────

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
  path: "/api/socket.io"
});

io.on("connection", (socket) => {
  socket.on("join-session", (sessionId: string) => {
    socket.join(`session-${sessionId}`);
    const botManager = (app as any).botManager;
    if (botManager) {
      const session = botManager.getSession(sessionId);
      if (session) {
        socket.emit("session-update", session.getStatus());
      }
    }
  });

  socket.on("leave-session", (sessionId: string) => {
    socket.leave(`session-${sessionId}`);
  });
});

// Dynamically import BotManager (it's a CommonJS-style ESM module)
async function startBot() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const sessionsDir = path.join(__dirname, "..", "sessions");

  // Dynamic import for JS bot files
  const { BotManager } = await import("./bot/BotManager.js" as any);
  const botManager = new BotManager(io, sessionsDir);
  (app as any).botManager = botManager;
  (app as any).io = io;

  await botManager.restoreAllSessions();

  logger.info("🤖 Bot manager initialized");

  console.log(`
  ██████╗  █████╗ ██████╗ ██╗  ██╗    ████████╗██╗  ██╗██╗██╗      █████╗ 
  ██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝    ╚══██╔══╝██║  ██║██║██║     ██╔══██╗
  ██║  ██║███████║██████╔╝█████╔╝        ██║   ███████║██║██║     ███████║
  ██║  ██║██╔══██║██╔══██╗██╔═██╗        ██║   ██╔══██║██║██║     ██╔══██║
  ██████╔╝██║  ██║██║  ██║██║  ██╗       ██║   ██║  ██║██║███████╗██║  ██║
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝
                    🖤 MULTI-USER WHATSAPP BOT 🖤
  `);
}

function startListening() {
  httpServer.listen(port, async () => {
    logger.info({ port }, "Server listening");
    await startBot();
  });
}

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.warn({ port }, "Port in use, retrying in 2s...");
    setTimeout(() => {
      httpServer.close();
      startListening();
    }, 2000);
  } else {
    logger.error({ err }, "Server error");
    process.exit(1);
  }
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

// Prevent unhandled promise rejections from crashing the server
process.on("unhandledRejection", (reason: unknown) => {
  logger.warn({ reason }, "Unhandled promise rejection (suppressed)");
});

process.on("uncaughtException", (err: Error) => {
  // Log but don't crash — Baileys sometimes emits protocol-level errors
  logger.warn({ err: err.message }, "Uncaught exception (suppressed)");
});

// ── Self-ping keepalive ───────────────────────────────────────────────────
// Pings the server every 4 minutes to prevent the Replit container from sleeping
// and to detect + recover from any TCP-level stalls early.
function startKeepalive() {
  const PING_INTERVAL = 4 * 60 * 1000; // 4 minutes
  setInterval(async () => {
    try {
      const { default: http } = await import("http");
      const req = http.get(`http://localhost:${port}/api/healthz`, (res) => {
        res.resume(); // drain response
      });
      req.on("error", () => {}); // ignore errors silently
      req.setTimeout(10000, () => req.destroy());
    } catch (_) {}
  }, PING_INTERVAL);
}

startListening();
startKeepalive();

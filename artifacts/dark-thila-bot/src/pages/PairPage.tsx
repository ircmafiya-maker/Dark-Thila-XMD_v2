import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Smartphone, QrCode, Link2, ArrowLeft, CheckCircle2,
  Loader2, RefreshCw, Copy, X, Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/use-socket";

// ── Types ──────────────────────────────────────────────────────────────────
type Tab = "code" | "qr";
type PairStatus = "idle" | "starting" | "waiting" | "connected" | "error";

interface SessionState {
  sessionId: string | null;
  status: PairStatus;
  pairingCode: string | null;
  qrCode: string | null;
  errorMsg: string | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── API helpers ────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiPost(path: string, body: Record<string, string>) {
  const r = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}

async function apiDelete(path: string) {
  const r = await fetch(`${BASE}/api${path}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
    credentials: "include",
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || "Delete failed");
  }
  return r.json();
}

async function getStatus(sessionId: string) {
  const r = await fetch(`${BASE}/api/pair/status/${sessionId}`, {
    headers: { ...authHeaders() },
    credentials: "include",
  });
  if (!r.ok) throw new Error("Status fetch failed");
  return r.json();
}

// ── Animated background (matches dashboard) ────────────────────────────────
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-zinc-900/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-900/15 blur-[100px] animate-pulse" style={{ animationDelay: "1.5s" }} />
      <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px] rounded-full bg-zinc-900/10 blur-[80px] animate-pulse" style={{ animationDelay: "3s" }} />
    </div>
  );
}

// ── Copy button ─────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Copied!", description: "Pairing code copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={handleCopy} className="text-zinc-200 hover:text-zinc-100 transition-colors p-1">
      {copied ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
    </button>
  );
}

// ── Success overlay ──────────────────────────────────────────────────────────
function SuccessOverlay({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 flex flex-col items-center justify-center z-30 rounded-2xl bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0.5, delay: 0.15 }}
        className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mb-5"
      >
        <CheckCircle2 className="w-10 h-10 text-green-400" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-2xl font-bold text-green-400 mb-2"
      >
        Connected Successfully!
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="text-zinc-400 text-sm mb-8"
      >
        Your bot is now live on WhatsApp
      </motion.p>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <Button onClick={onDone} className="bg-green-600 hover:bg-green-500 text-white font-mono uppercase tracking-widest">
          Go to Dashboard →
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ── PairPage ─────────────────────────────────────────────────────────────────
export default function PairPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("code");
  const [phone, setPhone] = useState("");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [qrRefreshKey, setQrRefreshKey] = useState(0);

  const [state, setState] = useState<SessionState>({
    sessionId: null,
    status: "idle",
    pairingCode: null,
    qrCode: null,
    errorMsg: null,
  });

  const { socket, joinSession } = useSocket();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [qrCountdown, setQrCountdown] = useState(30);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrTimerRef.current) { clearInterval(qrTimerRef.current); qrTimerRef.current = null; }
  }, []);

  const cancelSession = useCallback(async (sid: string) => {
    try { await apiDelete(`/pair/cancel/${sid}`); } catch (_) {}
  }, []);

  const reset = useCallback(async () => {
    clearTimers();
    if (state.sessionId && state.status !== "connected") {
      await cancelSession(state.sessionId);
    }
    setState({ sessionId: null, status: "idle", pairingCode: null, qrCode: null, errorMsg: null });
    setQrCountdown(30);
    setQrRefreshKey(k => k + 1);
  }, [state.sessionId, state.status, clearTimers, cancelSession]);

  // ── Socket.io live updates ───────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (data: any) => {
      setState(prev => {
        if (prev.sessionId !== data.sessionId) return prev;
        const next: SessionState = {
          ...prev,
          qrCode: data.qrCode || prev.qrCode,
          pairingCode: data.pairingCode || prev.pairingCode,
        };
        if (data.status === "connected") {
          next.status = "connected";
          clearTimers();
        } else if (data.status === "qr" || data.status === "pairing") {
          next.status = "waiting";
        } else if (data.status === "disconnected") {
          next.status = "error";
          next.errorMsg = "Session disconnected unexpectedly.";
          clearTimers();
        }
        return next;
      });
    };
    socket.on("session-update", handler);
    return () => { socket.off("session-update", handler); };
  }, [socket, clearTimers]);

  // ── Polling fallback ─────────────────────────────────────────────────────
  const startPolling = useCallback((sid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await getStatus(sid);
        setState(prev => {
          if (prev.sessionId !== sid) return prev;
          if (data.status === "connected") {
            clearTimers();
            return { ...prev, status: "connected", qrCode: data.qrCode || prev.qrCode, pairingCode: data.pairingCode || prev.pairingCode };
          }
          if (data.status === "qr" && data.qrCode) {
            return { ...prev, status: "waiting", qrCode: data.qrCode };
          }
          if (data.status === "pairing" && data.pairingCode) {
            return { ...prev, status: "waiting", pairingCode: data.pairingCode };
          }
          return prev;
        });
      } catch (_) {}
    }, 3000);
  }, [clearTimers]);

  // ── QR auto-refresh countdown ────────────────────────────────────────────
  const startQrCountdown = useCallback(() => {
    setQrCountdown(30);
    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    qrTimerRef.current = setInterval(() => {
      setQrCountdown(c => {
        if (c <= 1) { setQrRefreshKey(k => k + 1); return 30; }
        return c - 1;
      });
    }, 1000);
  }, []);

  // ── Start pairing ────────────────────────────────────────────────────────
  const startPairCode = async () => {
    if (!phone.trim()) { toast({ title: "Phone required", description: "Enter your WhatsApp number with country code.", variant: "destructive" }); return; }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 7) { toast({ title: "Invalid number", description: "Include country code, e.g. 94771234567", variant: "destructive" }); return; }
    const sid = sessionIdInput.trim() || `pair-${cleanPhone}-${Date.now()}`;
    setState({ sessionId: sid, status: "starting", pairingCode: null, qrCode: null, errorMsg: null });
    joinSession(sid);
    try {
      await apiPost("/pair/code", { number: cleanPhone, sessionId: sid });
      setState(prev => ({ ...prev, status: "waiting" }));
      startPolling(sid);
    } catch (err: any) {
      setState(prev => ({ ...prev, status: "error", errorMsg: err.message }));
    }
  };

  const startQr = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    const sid = sessionIdInput.trim() || `qr-${Date.now()}`;
    setState({ sessionId: sid, status: "starting", pairingCode: null, qrCode: null, errorMsg: null });
    joinSession(sid);
    try {
      await apiPost("/pair/qr", { sessionId: sid, phoneNumber: cleanPhone });
      setState(prev => ({ ...prev, status: "waiting" }));
      startPolling(sid);
      startQrCountdown();
    } catch (err: any) {
      setState(prev => ({ ...prev, status: "error", errorMsg: err.message }));
    }
  };

  const handleStart = () => activeTab === "code" ? startPairCode() : startQr();

  // ── Format pair code nicely ──────────────────────────────────────────────
  const formatCode = (code: string | null) => {
    if (!code) return null;
    const clean = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    return code;
  };

  const isActive = state.status !== "idle" && state.status !== "error";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans relative overflow-hidden">
      <AnimatedBackground />

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30 gap-1.5 text-xs font-mono"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Button>
        <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-700/40 rounded-lg px-3 py-1.5">
          <Wifi className="w-3.5 h-3.5 text-zinc-200" />
          <span className="text-xs text-zinc-300 font-mono">PAIR STATION</span>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-[85vh] px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="relative inline-block mb-4">
            <div className="absolute -inset-3 bg-white/10 blur-2xl rounded-full" />
            <div className="absolute -inset-1 bg-white/5 blur-md rounded-full" />
            <img
              src="https://files.catbox.moe/du1eul.jpeg"
              alt="Dark Thila Bot"
              className="w-20 h-20 rounded-full border border-white/20 relative z-10 mx-auto"
              style={{ boxShadow: "0 0 20px rgba(255,255,255,0.15), 0 0 40px rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.08)" }}
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">
            Dark Thila X MD
          </h1>
          <p className="text-zinc-500 text-sm font-mono">Connect your WhatsApp account</p>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md relative"
        >
          <div className="relative bg-zinc-900/80 border border-zinc-800/40 rounded-2xl backdrop-blur-md overflow-hidden shadow-2xl shadow-black/30">
            {/* Top glow line */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />

            {/* Success overlay */}
            <AnimatePresence>
              {state.status === "connected" && (
                <SuccessOverlay onDone={() => navigate("/")} />
              )}
            </AnimatePresence>

            <div className="p-6">
              {/* Tab selector */}
              <div className="flex bg-zinc-800/60 rounded-xl p-1 mb-6">
                {(["code", "qr"] as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { if (!isActive) setActiveTab(tab); }}
                    disabled={isActive}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-mono font-medium transition-all duration-200 ${
                      activeTab === tab
                        ? "bg-zinc-700 text-white shadow-lg shadow-black/50"
                        : "text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    }`}
                  >
                    {tab === "code" ? <Smartphone className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                    {tab === "code" ? "Pair Code" : "QR Code"}
                  </button>
                ))}
              </div>

              {/* Idle / form state */}
              <AnimatePresence mode="wait">
                {state.status === "idle" && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    {/* Instructions */}
                    <div className="bg-zinc-900/30 border border-zinc-700/30 rounded-xl p-3 text-xs text-zinc-300 space-y-1 font-mono">
                      {activeTab === "code" ? (
                        <>
                          <p>1. Enter your WhatsApp number with country code</p>
                          <p>2. Click <strong>Generate Pair Code</strong></p>
                          <p>3. Open WhatsApp → Linked Devices → Link with phone number</p>
                          <p>4. Enter the 8-digit code shown below</p>
                        </>
                      ) : (
                        <>
                          <p>1. Click <strong>Show QR Code</strong></p>
                          <p>2. Open WhatsApp → Linked Devices → Link a Device</p>
                          <p>3. Scan the QR code with your camera</p>
                          <p>4. QR refreshes every 30 seconds automatically</p>
                        </>
                      )}
                    </div>

                    {activeTab === "code" && (
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-widest text-zinc-500 font-mono">Phone Number</label>
                        <div className="flex gap-2">
                          <span className="flex items-center px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 text-sm font-mono">+</span>
                          <Input
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="94771234567"
                            className="font-mono bg-zinc-800/60 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-zinc-400"
                          />
                        </div>
                        <p className="text-xs text-zinc-600 font-mono">Include country code, no spaces or dashes</p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs uppercase tracking-widest text-zinc-500 font-mono">Session Name <span className="text-zinc-600">(optional)</span></label>
                      <Input
                        value={sessionIdInput}
                        onChange={e => setSessionIdInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                        placeholder="my-bot-session"
                        className="font-mono bg-zinc-800/60 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-zinc-400"
                      />
                    </div>

                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        onClick={handleStart}
                        className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-mono uppercase tracking-widest h-11"
                      >
                        <Link2 className="w-4 h-4 mr-2" />
                        {activeTab === "code" ? "Generate Pair Code" : "Show QR Code"}
                      </Button>
                    </motion.div>
                  </motion.div>
                )}

                {/* Starting / loading */}
                {state.status === "starting" && (
                  <motion.div
                    key="starting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center py-10 gap-4"
                  >
                    <Loader2 className="w-10 h-10 animate-spin text-zinc-200" />
                    <p className="text-zinc-400 font-mono text-sm">Initializing session...</p>
                  </motion.div>
                )}

                {/* Waiting — show code or QR */}
                {state.status === "waiting" && (
                  <motion.div
                    key="waiting"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-5"
                  >
                    {/* Pair code display */}
                    {activeTab === "code" && (
                      <div className="text-center space-y-3">
                        {state.pairingCode ? (
                          <>
                            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Your Pair Code</p>
                            <motion.div
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", bounce: 0.4 }}
                              className="relative inline-flex items-center gap-3"
                            >
                              <div className="bg-zinc-800 border border-zinc-500/40 rounded-2xl px-8 py-5 shadow-xl shadow-black/40">
                                <span className="text-4xl font-bold font-mono tracking-[0.25em] text-zinc-300">
                                  {formatCode(state.pairingCode)}
                                </span>
                              </div>
                              <div className="absolute -top-2 -right-2">
                                <CopyBtn text={state.pairingCode} />
                              </div>
                            </motion.div>
                            <p className="text-xs text-zinc-500 font-mono">
                              WhatsApp → Linked Devices → Link with phone number
                            </p>
                          </>
                        ) : (
                          <div className="flex flex-col items-center py-6 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-zinc-200" />
                            <p className="text-zinc-400 font-mono text-sm">Generating pair code...</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* QR display */}
                    {activeTab === "qr" && (
                      <div className="text-center space-y-3">
                        {state.qrCode ? (
                          <>
                            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Scan with WhatsApp</p>
                            <motion.div
                              key={qrRefreshKey}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex justify-center"
                            >
                              <div className="p-3 bg-white rounded-2xl shadow-xl shadow-black/40 border-2 border-zinc-500/30">
                                <img
                                  src={state.qrCode}
                                  alt="QR Code"
                                  className="w-52 h-52"
                                />
                              </div>
                            </motion.div>
                            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                              <RefreshCw className="w-3 h-3" />
                              <span>Refreshing in <span className="text-zinc-200 font-bold">{qrCountdown}s</span></span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center py-6 gap-3">
                            <div className="w-52 h-52 bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-700">
                              <div className="text-center">
                                <Loader2 className="w-8 h-8 animate-spin text-zinc-200 mx-auto mb-2" />
                                <p className="text-zinc-500 text-xs font-mono">Loading QR...</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Waiting status bar */}
                    <div className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-2 text-xs text-zinc-500 font-mono">
                      <motion.div
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-yellow-400"
                      />
                      Waiting for WhatsApp to connect...
                    </div>

                    <Button
                      onClick={reset}
                      variant="outline"
                      className="w-full border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-800/50 hover:bg-red-950/20 font-mono text-xs uppercase tracking-widest"
                    >
                      <X className="w-3.5 h-3.5 mr-2" />
                      Cancel
                    </Button>
                  </motion.div>
                )}

                {/* Error state */}
                {state.status === "error" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-6 space-y-4"
                  >
                    <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
                      <X className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <p className="text-red-400 font-mono font-semibold">Connection Failed</p>
                      <p className="text-zinc-500 text-xs mt-1 font-mono">{state.errorMsg}</p>
                    </div>
                    <Button
                      onClick={reset}
                      variant="outline"
                      className="border-zinc-600 text-zinc-200 hover:bg-zinc-900/30 font-mono text-xs uppercase tracking-widest"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-2" />
                      Try Again
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Help text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-zinc-600 text-xs font-mono mt-6 text-center max-w-xs"
        >
          Session will be saved automatically after connecting. You can manage it from the dashboard.
        </motion.p>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props { onSwitchToRegister: () => void; }

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 3 + 1,
  duration: Math.random() * 12 + 8,
  delay: Math.random() * 6,
}));

// Falling snowflakes — denser, drift down with slight wobble
const SNOWFLAKES = Array.from({ length: 60 }, (_, i) => {
  const size = Math.random() * 4 + 2;
  return {
    id: i,
    left: Math.random() * 100,
    size,
    duration: Math.random() * 10 + 8,
    delay: Math.random() * 12,
    drift: Math.random() * 80 - 40,
    opacity: Math.random() * 0.5 + 0.3,
    blur: size > 4 ? 1 : 0,
  };
});

const LOGO_URL = "https://files.catbox.moe/du1eul.jpeg";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

export default function LoginPage({ onSwitchToRegister }: Props) {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [glowPulse, setGlowPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setGlowPulse(p => !p), 2500);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">

      {/* 📺 CRT scan lines + flicker overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-[60] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)",
          opacity: 0.6,
        }}
      />
      {/* Slow rolling scan beam */}
      <motion.div
        className="absolute inset-x-0 h-32 pointer-events-none z-[61]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 60%, transparent 100%)",
        }}
        animate={{ y: ["-15vh", "115vh"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
      />
      {/* Subtle screen flicker */}
      <motion.div
        className="absolute inset-0 bg-white/5[0.015] pointer-events-none z-[59]"
        animate={{ opacity: [0, 0.6, 0.1, 0.4, 0] }}
        transition={{ duration: 0.18, repeat: Infinity, repeatDelay: 4.5 }}
      />

      {/* Animated background orbs */}
      <motion.div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        animate={{ scale: [1, 1.12, 1], opacity: [0.18, 0.28, 0.18] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)", filter: "blur(80px)" }}
      />
      <motion.div
        className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
        animate={{ scale: [1, 1.08, 1], opacity: [0.1, 0.18, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)", filter: "blur(100px)" }}
      />
      <motion.div
        className="absolute top-0 left-0 w-[350px] h-[350px] rounded-full pointer-events-none"
        animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.15, 0.08] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)", filter: "blur(80px)" }}
      />

      {/* ❄️ Snow rain — falling top → bottom with horizontal drift */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {SNOWFLAKES.map(f => (
          <motion.div
            key={`snow-${f.id}`}
            className="absolute rounded-full"
            style={{
              left: `${f.left}%`,
              top: -10,
              width: f.size,
              height: f.size,
              background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(180,180,180,0.8) 60%, transparent 100%)",
              boxShadow: `0 0 ${f.size * 2}px rgba(255,255,255,0.25)`,
              filter: f.blur ? `blur(${f.blur}px)` : undefined,
              opacity: f.opacity,
            }}
            animate={{
              y: ["0vh", "110vh"],
              x: [0, f.drift, 0, -f.drift / 2, 0],
              opacity: [0, f.opacity, f.opacity, f.opacity, 0],
            }}
            transition={{
              duration: f.duration,
              repeat: Infinity,
              delay: f.delay,
              ease: "linear",
              x: { duration: f.duration, repeat: Infinity, delay: f.delay, ease: "easeInOut" },
              opacity: { duration: f.duration, repeat: Infinity, delay: f.delay, times: [0, 0.1, 0.5, 0.9, 1] },
            }}
          />
        ))}
      </div>

      {/* Floating particles */}
      {PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white/10 pointer-events-none"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Animated border glow */}
        <motion.div
          className="absolute -inset-[1px] rounded-2xl pointer-events-none"
          animate={{ opacity: glowPulse ? 0.7 : 0.3 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.10), transparent, rgba(255,255,255,0.08))",
            borderRadius: "1rem",
          }}
        />

        <div className="bg-zinc-950/95 border border-zinc-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-md relative">

          {/* Logo section */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="flex flex-col items-center mb-8"
          >
            <motion.div
              variants={fadeUp}
              className="relative mb-4"
            >
              {/* Outer slow rotating conic gradient ring */}
              <motion.div
                className="absolute -inset-3 rounded-full pointer-events-none"
                style={{
                  background:
                    "conic-gradient(from 0deg, rgba(255,255,255,0), rgba(255,255,255,0.7), rgba(255,255,255,0.9), rgba(255,255,255,0.8), rgba(255,255,255,0), rgba(255,255,255,0.8))",
                  filter: "blur(8px)",
                  opacity: 0.55,
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              />

              {/* Pulsing glow ring behind logo */}
              <motion.div
                className="absolute -inset-2 rounded-full pointer-events-none"
                animate={{
                  boxShadow: [
                    "0 0 14px 4px rgba(255,255,255,0.12), 0 0 40px 10px rgba(255,255,255,0.05)",
                    "0 0 32px 12px rgba(255,255,255,0.25), 0 0 70px 22px rgba(255,255,255,0.10)",
                    "0 0 14px 4px rgba(255,255,255,0.12), 0 0 40px 10px rgba(255,255,255,0.05)",
                  ],
                  scale: [1, 1.04, 1],
                }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Logo */}
              <motion.div
                className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-white/40 relative z-10 shadow-xl shadow-black/40"
                whileHover={{ scale: 1.08, rotate: 2 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                animate={{
                  boxShadow: [
                    "0 0 0 0 rgba(255,255,255,0), 0 10px 30px -10px rgba(255,255,255,0.2)",
                    "0 0 0 6px rgba(255,255,255,0.06), 0 14px 36px -10px rgba(255,255,255,0.35)",
                    "0 0 0 0 rgba(255,255,255,0), 0 10px 30px -10px rgba(255,255,255,0.2)",
                  ],
                }}
              >
                <img
                  src={LOGO_URL}
                  alt="Dark Thila Bot"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = `${import.meta.env.BASE_URL}bot-logo.png`;
                  }}
                />
              </motion.div>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="relative text-2xl font-bold tracking-tight font-mono"
              style={{ color: "#fff" }}
            >
              {/* Cyan layer (offset left) */}
              <motion.span
                aria-hidden
                className="absolute inset-0 text-cyan-400 mix-blend-screen"
                animate={{ x: [0, -2, 1, -1, 0, 2, 0], opacity: [0.7, 0.9, 0.7] }}
                transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
              >
                Dark Thila X MD
              </motion.span>
              {/* Magenta layer (offset right) */}
              <motion.span
                aria-hidden
                className="absolute inset-0 text-fuchsia-500 mix-blend-screen"
                animate={{ x: [0, 2, -1, 1, 0, -2, 0], opacity: [0.7, 0.9, 0.7] }}
                transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut", delay: 0.05 }}
              >
                Dark Thila X MD
              </motion.span>
              {/* Main white layer with clip-path glitch */}
              <motion.span
                className="relative inline-block"
                animate={{
                  clipPath: [
                    "inset(0 0 0 0)",
                    "inset(40% 0 35% 0)",
                    "inset(0 0 0 0)",
                    "inset(10% 0 75% 0)",
                    "inset(0 0 0 0)",
                  ],
                  x: [0, -1, 0, 2, 0],
                }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3.5, ease: "easeInOut" }}
              >
                Dark Thila X MD
              </motion.span>
            </motion.h1>

            {/* Hacker-style status line */}
            <motion.p
              variants={fadeUp}
              className="text-zinc-400/80 text-xs mt-2 font-mono tracking-wider flex items-center gap-2"
            >
              <motion.span
                className="inline-block w-1.5 h-1.5 rounded-full bg-white/30"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              {"> SYSTEM_READY :: AWAITING_AUTH"}
            </motion.p>
          </motion.div>

          {/* Form */}
          <motion.form
            onSubmit={handleSubmit}
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-5"
          >
            <motion.div variants={fadeUp} className="space-y-2">
              <Label htmlFor="email" className="text-zinc-400 text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-white/30 h-11 transition-all duration-200 hover:border-zinc-600"
              />
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-2">
              <Label htmlFor="password" className="text-zinc-400 text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-white/30 h-11 pr-10 transition-all duration-200 hover:border-zinc-600"
                />
                <motion.button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  whileTap={{ scale: 0.88 }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </motion.button>
              </div>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="bg-red-950/50 border border-red-800/50 rounded-lg px-4 py-2.5 text-red-400 text-sm overflow-hidden"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div variants={fadeUp}>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-zinc-700 to-zinc-900 hover:from-zinc-600 hover:to-zinc-800 text-white font-semibold rounded-xl shadow-lg shadow-black/40 transition-all"
                >
                  <AnimatePresence mode="wait">
                    {loading ? (
                      <motion.span
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 className="w-4 h-4 animate-spin" /> Signing in...
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        Sign In
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </motion.div>
            </motion.div>
          </motion.form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-6 text-center"
          >
            <span className="text-zinc-500 text-sm">Don't have an account? </span>
            <motion.button
              onClick={onSwitchToRegister}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-zinc-200 hover:text-zinc-300 text-sm font-medium transition-colors"
            >
              Register here
            </motion.button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

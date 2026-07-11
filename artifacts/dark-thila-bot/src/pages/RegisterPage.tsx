import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { HackerFx, GlitchText, PulseLogo, DARK_THILA_LOGO_URL } from "@/components/HackerFx";

interface Props { onSwitchToLogin: () => void; }

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

export default function RegisterPage({ onSwitchToLogin }: Props) {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
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
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await register(username, email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">

      <HackerFx />

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

          {/* Logo */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="flex flex-col items-center mb-6"
          >
            <motion.div variants={fadeUp} className="relative mb-5">
              <PulseLogo
                src={DARK_THILA_LOGO_URL}
                fallback={`${import.meta.env.BASE_URL}bot-logo.png`}
                size={88}
              />
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="text-2xl font-bold tracking-tight"
              style={{ color: "#fff" }}
            >
              <GlitchText>CREATE ACCOUNT</GlitchText>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-zinc-400/80 text-xs mt-2 font-mono tracking-wider flex items-center gap-2"
            >
              <motion.span
                className="inline-block w-1.5 h-1.5 rounded-full bg-white/30"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              {"> NEW_USER :: INIT_REGISTRATION"}
            </motion.p>
          </motion.div>

          {/* Admin notice */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex items-start gap-2.5 bg-zinc-900/40 border border-zinc-700/40 rounded-xl px-4 py-3 mb-6"
          >
            <ShieldCheck className="w-4 h-4 text-zinc-200 mt-0.5 shrink-0" />
            <p className="text-zinc-300 text-xs leading-relaxed">
              The <strong>first registered account</strong> automatically becomes Admin and gets full dashboard access.
            </p>
          </motion.div>

          {/* Form */}
          <motion.form
            onSubmit={handleSubmit}
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            <motion.div variants={fadeUp} className="space-y-2">
              <Label className="text-zinc-400 text-sm font-medium">Username</Label>
              <Input
                type="text"
                placeholder="darkthila"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-white/30 h-11 transition-all duration-200 hover:border-zinc-600"
              />
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-2">
              <Label className="text-zinc-400 text-sm font-medium">Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-white/30 h-11 transition-all duration-200 hover:border-zinc-600"
              />
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-2">
              <Label className="text-zinc-400 text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Min. 6 characters"
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

            <motion.div variants={fadeUp} className="space-y-2">
              <Label className="text-zinc-400 text-sm font-medium">Confirm Password</Label>
              <Input
                type="password"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-white/30 h-11 transition-all duration-200 hover:border-zinc-600"
              />
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
                  className="w-full h-11 bg-gradient-to-r from-zinc-700 to-zinc-900 hover:from-zinc-600 hover:to-zinc-800 text-white font-semibold rounded-xl shadow-lg shadow-black/40 transition-all mt-2"
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
                        <Loader2 className="w-4 h-4 animate-spin" /> Creating account...
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        Create Account
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
            transition={{ delay: 0.8 }}
            className="mt-6 text-center"
          >
            <span className="text-zinc-500 text-sm">Already have an account? </span>
            <motion.button
              onClick={onSwitchToLogin}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-zinc-200 hover:text-zinc-300 text-sm font-medium transition-colors"
            >
              Sign in
            </motion.button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

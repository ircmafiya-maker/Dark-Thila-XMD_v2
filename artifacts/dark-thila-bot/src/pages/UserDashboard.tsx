import { useAuth } from "@/context/AuthContext";
import { ConnectForm } from "@/components/ConnectForm";
import { SessionCard } from "@/components/SessionCard";
import { useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useSocket } from "@/hooks/use-socket";
import { motion } from "framer-motion";
import { LogOut, User, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HackerFx, GlitchText, DARK_THILA_LOGO_URL } from "@/components/HackerFx";

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const { data: sessions, isLoading } = useListSessions({
    query: {
      queryKey: getListSessionsQueryKey(),
      refetchInterval: (q) => {
        const list = q.state.data as { status?: string }[] | undefined;
        if (!list || list.length === 0) return 4000;
        const transient = list.some((s) =>
          ["qr", "pairing", "reconnecting", "idle"].includes(s.status || "")
        );
        return transient ? 3000 : false;
      },
    },
  });
  useSocket();

  // Normal users only see sessions matching their username as sessionId prefix
  const mySessions = sessions?.filter(
    (s) => s.sessionId.startsWith(user?.username ?? "__none__")
  ) ?? [];

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <HackerFx orbs particles={false} />

      {/* Navbar */}
      <header className="relative z-10 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <motion.div
                className="absolute -inset-1 rounded-full pointer-events-none"
                animate={{
                  boxShadow: [
                    "0 0 8px 2px rgba(255,255,255,0.12)",
                    "0 0 18px 6px rgba(255,255,255,0.25)",
                    "0 0 8px 2px rgba(255,255,255,0.12)",
                  ],
                }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.img
                src={DARK_THILA_LOGO_URL}
                alt="Dark Thila Bot"
                className="w-10 h-10 rounded-full object-cover ring-2 ring-white/30 relative z-10"
                whileHover={{ scale: 1.1, rotate: 4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = `${import.meta.env.BASE_URL}bot-logo.png`;
                }}
              />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white font-mono">
                <GlitchText>Dark Thila X MD</GlitchText>
              </h1>
              <p className="text-[10px] text-zinc-400/80 font-mono tracking-wider">{"> USER_PANEL"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
              <User className="w-3.5 h-3.5 text-zinc-200" />
              <span className="text-sm text-zinc-300 font-medium">{user?.username}</span>
            </div>
            <Button
              onClick={logout}
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-red-400 hover:bg-red-950/30 transition-colors gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-2"
        >
          <h2 className="text-3xl font-bold text-white">
            Welcome back, <span className="text-zinc-200">{user?.username}</span> 👋
          </h2>
          <p className="text-zinc-500 text-sm">Connect your WhatsApp bot and manage your session.</p>
        </motion.div>

        {/* Connect Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <ConnectForm />
        </motion.div>

        {/* My Sessions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="space-y-4"
        >
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-zinc-200" />
            My Bot Sessions
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-200" />
            </div>
          ) : mySessions.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/50 border border-zinc-800/60 rounded-2xl">
              <Bot className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">No active sessions yet.</p>
              <p className="text-zinc-600 text-xs mt-1">Connect your WhatsApp bot above to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mySessions.map((session) => (
                <SessionCard key={session.sessionId} session={session} />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

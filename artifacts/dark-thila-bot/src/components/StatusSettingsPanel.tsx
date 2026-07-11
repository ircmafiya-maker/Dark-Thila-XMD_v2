import { useState, useEffect, useCallback } from "react";
import { Eye, Zap, MessageSquare, BookOpen, Loader2, RefreshCw, Power, Keyboard, Wifi, ShieldAlert, Bell, Ghost, Star, Bot, BotMessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

interface BotSettings {
  autoStatusView: boolean;
  autoStatusReact: boolean;
  autoStatusReply: boolean;
  autoReadMessages: boolean;
  botEnabled: boolean;
  alwaysOnline: boolean;
  autoTyping: boolean;
  connectMsgEnabled: boolean;
  antiDeletePrivate: boolean;
  antiViewOnce: boolean;
  xpEnabled: boolean;
  aiEnabled: boolean;
  aiAutoReply: boolean;
}

interface StatusSettingsPanelProps {
  sessionId: string;
  isConnected: boolean;
}

interface ToggleItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (val: boolean) => void;
  color: string;
}

function ToggleItem({ icon, label, description, checked, disabled, onChange, color }: ToggleItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-mono font-semibold text-foreground leading-tight">{label}</p>
          <p className="text-[10px] text-muted-foreground leading-tight truncate">{description}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
          ${checked ? "bg-red-600" : "bg-zinc-700"}`}
        aria-checked={checked}
        role="switch"
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200
            ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

interface SectionConfig {
  key: keyof BotSettings;
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
}

const STATUS_ITEMS: SectionConfig[] = [
  {
    key: "autoStatusView",
    icon: <Eye className="w-3.5 h-3.5 text-blue-400" />,
    label: "Auto Status View",
    description: "Automatically view all contact statuses",
    color: "bg-blue-500/10 border border-blue-500/20",
  },
  {
    key: "autoStatusReact",
    icon: <Zap className="w-3.5 h-3.5 text-yellow-400" />,
    label: "Auto Status React",
    description: "React with random emoji ❤️ 🔥 😍 👍 💯 ✨",
    color: "bg-yellow-500/10 border border-yellow-500/20",
  },
  {
    key: "autoStatusReply",
    icon: <MessageSquare className="w-3.5 h-3.5 text-green-400" />,
    label: "Auto Status Reply",
    description: "Auto-send private reply to status posters",
    color: "bg-green-500/10 border border-green-500/20",
  },
  {
    key: "autoReadMessages",
    icon: <BookOpen className="w-3.5 h-3.5 text-zinc-300" />,
    label: "Auto Read Messages",
    description: "Mark all incoming messages as read",
    color: "bg-zinc-800/50 border border-zinc-700/40",
  },
];

const AI_ITEMS: SectionConfig[] = [
  {
    key: "aiEnabled",
    icon: <Bot className="w-3.5 h-3.5 text-sky-400" />,
    label: "AI Chat (.ai)",
    description: "Enable AI chat — users can use .ai <question>",
    color: "bg-sky-500/10 border border-sky-500/20",
  },
  {
    key: "aiAutoReply",
    icon: <BotMessageSquare className="w-3.5 h-3.5 text-teal-400" />,
    label: "AI Auto-Reply",
    description: "Auto-reply with AI in private chats (no prefix needed)",
    color: "bg-teal-500/10 border border-teal-500/20",
  },
];

const BOT_ITEMS: SectionConfig[] = [
  {
    key: "botEnabled",
    icon: <Power className="w-3.5 h-3.5 text-emerald-400" />,
    label: "Bot Commands",
    description: "Enable / disable all bot commands globally",
    color: "bg-emerald-500/10 border border-emerald-500/20",
  },
  {
    key: "alwaysOnline",
    icon: <Wifi className="w-3.5 h-3.5 text-cyan-400" />,
    label: "Always Online",
    description: "Keep bot presence as online at all times",
    color: "bg-cyan-500/10 border border-cyan-500/20",
  },
  {
    key: "autoTyping",
    icon: <Keyboard className="w-3.5 h-3.5 text-orange-400" />,
    label: "Auto Typing",
    description: "Show typing indicator while processing commands",
    color: "bg-orange-500/10 border border-orange-500/20",
  },
  {
    key: "connectMsgEnabled",
    icon: <Bell className="w-3.5 h-3.5 text-zinc-200" />,
    label: "Connect Notification",
    description: "Broadcast message to users when bot connects",
    color: "bg-white/5 border border-zinc-400/20",
  },
  {
    key: "antiDeletePrivate",
    icon: <ShieldAlert className="w-3.5 h-3.5 text-red-400" />,
    label: "Anti-Delete",
    description: "Recover deleted messages in private chats",
    color: "bg-red-500/10 border border-red-500/20",
  },
  {
    key: "antiViewOnce",
    icon: <Ghost className="w-3.5 h-3.5 text-pink-400" />,
    label: "Anti View-Once",
    description: "Forward view-once media to owner privately",
    color: "bg-pink-500/10 border border-pink-500/20",
  },
  {
    key: "xpEnabled",
    icon: <Star className="w-3.5 h-3.5 text-amber-400" />,
    label: "XP System",
    description: "Level up & ranking system in groups",
    color: "bg-amber-500/10 border border-amber-500/20",
  },
];

interface SectionProps {
  title: string;
  accent: string;
  borderColor: string;
  bgColor: string;
  items: SectionConfig[];
  settings: BotSettings | null;
  loading: boolean;
  saving: string | null;
  isConnected: boolean;
  onUpdate: (key: keyof BotSettings, value: boolean) => void;
  showRefresh?: boolean;
  onRefresh?: () => void;
}

function SettingsSection({ title, accent, borderColor, bgColor, items, settings, loading, saving, isConnected, onUpdate, showRefresh, onRefresh }: SectionProps) {
  return (
    <div className={`rounded-md border ${borderColor} ${bgColor} overflow-hidden`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${borderColor} bg-black/20`}>
        <span className={`text-[10px] font-mono font-bold tracking-widest ${accent} uppercase`}>
          {title}
        </span>
        {showRefresh && onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            title="Refresh settings"
          >
            {loading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
          </button>
        )}
      </div>

      <div className="px-3 divide-y divide-border/30">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : !settings ? (
          <p className="text-[10px] font-mono text-muted-foreground py-4 text-center">
            Settings unavailable
          </p>
        ) : (
          items.map(item => (
            <ToggleItem
              key={item.key}
              icon={saving === item.key
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                : item.icon
              }
              label={item.label}
              description={item.description}
              color={item.color}
              checked={settings[item.key]}
              disabled={!isConnected || saving !== null}
              onChange={val => onUpdate(item.key, val)}
            />
          ))
        )}
      </div>

      {!isConnected && (
        <p className="text-[10px] font-mono text-zinc-600 text-center pb-2">
          Connect bot to enable controls
        </p>
      )}
    </div>
  );
}

export function StatusSettingsPanel({ sessionId, isConnected }: StatusSettingsPanelProps) {
  const { toast } = useToast();
  const { token } = useAuth();
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/settings`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings(data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (key: keyof BotSettings, value: boolean) => {
    if (!settings) return;
    setSaving(key);
    const prev = settings[key];
    setSettings(s => s ? { ...s, [key]: value } : s);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/settings`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Settings Saved", description: `${key} ${value ? "enabled" : "disabled"}.` });
    } catch (err: any) {
      setSettings(s => s ? { ...s, [key]: prev } : s);
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const sharedProps = { settings, loading, saving, isConnected, onUpdate: updateSetting };

  return (
    <div className="mt-3 space-y-2">
      <SettingsSection
        title="⚙ Status Controls"
        accent="text-red-400"
        borderColor="border-red-900/30"
        bgColor="bg-red-950/10"
        items={STATUS_ITEMS}
        showRefresh
        onRefresh={() => { setLoading(true); fetchSettings(); }}
        {...sharedProps}
      />
      <SettingsSection
        title="🤖 Bot Controls"
        accent="text-zinc-200"
        borderColor="border-zinc-800/30"
        bgColor="bg-zinc-900/10"
        items={BOT_ITEMS}
        {...sharedProps}
      />
      <SettingsSection
        title="🧠 AI Controls"
        accent="text-sky-400"
        borderColor="border-sky-900/30"
        bgColor="bg-sky-950/10"
        items={AI_ITEMS}
        {...sharedProps}
      />
    </div>
  );
}

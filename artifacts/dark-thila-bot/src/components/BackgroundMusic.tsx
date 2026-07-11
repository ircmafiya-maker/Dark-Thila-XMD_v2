import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const TRACK_URL = "https://files.catbox.moe/nscs4m.mp3";
const STORAGE_KEY = "dt_bgm_muted";

export default function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useEffect(() => {
    const audio = new Audio(TRACK_URL);
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";
    audioRef.current = audio;

    if (!muted) {
      audio.play().catch(() => {
        setNeedsUnlock(true);
        const unlock = () => {
          audio.play().catch(() => {});
          setNeedsUnlock(false);
          window.removeEventListener("click", unlock);
          window.removeEventListener("keydown", unlock);
          window.removeEventListener("touchstart", unlock);
        };
        window.addEventListener("click", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
        window.addEventListener("touchstart", unlock, { once: true });
      });
    }

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      audio.pause();
    } else {
      audio.play().catch(() => setNeedsUnlock(true));
    }
    try { localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"); } catch {}
  }, [muted]);

  const toggle = () => {
    setMuted((m) => !m);
    setNeedsUnlock(false);
  };

  return (
    <button
      onClick={toggle}
      title={muted ? "Play background music" : "Mute background music"}
      className={`fixed bottom-4 right-4 z-[9999] w-11 h-11 rounded-full
        bg-black/70 backdrop-blur-md border border-zinc-500/40
        text-zinc-300 hover:text-zinc-50 hover:border-zinc-400
        hover:shadow-[0_0_20px_rgba(139,92,246,0.6)]
        flex items-center justify-center transition-all duration-200
        ${needsUnlock ? "animate-pulse ring-2 ring-white/30" : ""}`}
      data-testid="button-bgm-toggle"
    >
      {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
    </button>
  );
}

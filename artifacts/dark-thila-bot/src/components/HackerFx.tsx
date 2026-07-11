import { useMemo } from "react";
import { motion } from "framer-motion";

const SNOW_COUNT = 55;
const PARTICLE_COUNT = 12;

interface HackerFxProps {
  /** Show full-screen orbs */
  orbs?: boolean;
  /** Show falling white snow */
  snow?: boolean;
  /** Show CRT scan lines + flicker + scan beam */
  scanLines?: boolean;
  /** Show floating particles */
  particles?: boolean;
  /** Z-index for scan-line overlay (default 60) */
  scanZ?: number;
}

/**
 * Reusable hacker / cyber visual effects layer.
 * Renders absolute-positioned children — drop inside a `relative overflow-hidden` parent.
 */
export function HackerFx({
  orbs = true,
  snow = true,
  scanLines = true,
  particles = true,
  scanZ = 60,
}: HackerFxProps) {
  const snowflakes = useMemo(
    () =>
      Array.from({ length: SNOW_COUNT }, (_, i) => {
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
      }),
    [],
  );

  const particleList = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 12 + 8,
        delay: Math.random() * 6,
      })),
    [],
  );

  return (
    <>
      {/* Animated background orbs */}
      {orbs && (
        <>
          <motion.div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
            animate={{ scale: [1, 1.12, 1], opacity: [0.18, 0.28, 0.18] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background: "radial-gradient(circle, #ffffff18 0%, transparent 70%)",
              filter: "blur(80px)",
            }}
          />
          <motion.div
            className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
            animate={{ scale: [1, 1.08, 1], opacity: [0.1, 0.18, 0.1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            style={{
              background: "radial-gradient(circle, #ffffff10 0%, transparent 70%)",
              filter: "blur(100px)",
            }}
          />
          <motion.div
            className="absolute top-0 left-0 w-[350px] h-[350px] rounded-full pointer-events-none"
            animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.15, 0.08] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 4 }}
            style={{
              background: "radial-gradient(circle, #ffffff0c 0%, transparent 70%)",
              filter: "blur(80px)",
            }}
          />
        </>
      )}

      {/* CRT scan lines + flicker overlay */}
      {scanLines && (
        <>
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay"
            style={{
              zIndex: scanZ,
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)",
              opacity: 0.55,
            }}
          />
          <motion.div
            className="absolute inset-x-0 h-32 pointer-events-none"
            style={{
              zIndex: scanZ + 1,
              background:
                "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 60%, transparent 100%)",
            }}
            animate={{ y: ["-15vh", "115vh"] }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-0 bg-white/5[0.015] pointer-events-none"
            style={{ zIndex: scanZ - 1 }}
            animate={{ opacity: [0, 0.6, 0.1, 0.4, 0] }}
            transition={{ duration: 0.18, repeat: Infinity, repeatDelay: 4.5 }}
          />
        </>
      )}

      {/* Falling white snow */}
      {snow && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {snowflakes.map((f) => (
            <motion.div
              key={`snow-${f.id}`}
              className="absolute rounded-full"
              style={{
                left: `${f.left}%`,
                top: -10,
                width: f.size,
                height: f.size,
                background:
                  "radial-gradient(circle, #ffffff 0%, #aaaaaa 60%, transparent 100%)",
                boxShadow: `0 0 ${f.size * 2}px rgba(255,255,255,0.4)`,
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
                x: {
                  duration: f.duration,
                  repeat: Infinity,
                  delay: f.delay,
                  ease: "easeInOut",
                },
                opacity: {
                  duration: f.duration,
                  repeat: Infinity,
                  delay: f.delay,
                  times: [0, 0.1, 0.5, 0.9, 1],
                },
              }}
            />
          ))}
        </div>
      )}

      {/* Floating particles */}
      {particles &&
        particleList.map((p) => (
          <motion.div
            key={`p-${p.id}`}
            className="absolute rounded-full bg-white/10 pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
            }}
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
    </>
  );
}

interface GlitchTextProps {
  children: string;
  className?: string;
}

/**
 * Glitch / RGB-split text effect with periodic scanline cuts.
 */
export function GlitchText({ children, className = "" }: GlitchTextProps) {
  return (
    <span className={`relative inline-block font-mono ${className}`}>
      {/* Cyan ghost */}
      <motion.span
        aria-hidden
        className="absolute inset-0 text-cyan-400 mix-blend-screen"
        animate={{ x: [0, -2, 1, -1, 0, 2, 0], opacity: [0.7, 0.9, 0.7] }}
        transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
      >
        {children}
      </motion.span>
      {/* Magenta ghost */}
      <motion.span
        aria-hidden
        className="absolute inset-0 text-fuchsia-500 mix-blend-screen"
        animate={{ x: [0, 2, -1, 1, 0, -2, 0], opacity: [0.7, 0.9, 0.7] }}
        transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut", delay: 0.05 }}
      >
        {children}
      </motion.span>
      {/* Main */}
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
        {children}
      </motion.span>
    </span>
  );
}

interface PulseLogoProps {
  src: string;
  fallback?: string;
  size?: number;
}

/**
 * Circular logo with rotating conic ring, pulsing glow halo, and hover lift.
 */
export function PulseLogo({ src, fallback, size = 96 }: PulseLogoProps) {
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {/* Rotating conic outer ring */}
      <motion.div
        className="absolute -inset-3 rounded-full pointer-events-none"
        style={{
          background:
            "conic-gradient(from 0deg, #00000000, #ffffff, #cccccc, #888888, #ffffff00, #ffffff)",
          filter: "blur(8px)",
          opacity: 0.45,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
      {/* Pulsing glow halo */}
      <motion.div
        className="absolute -inset-2 rounded-full pointer-events-none"
        animate={{
          boxShadow: [
            "0 0 14px 4px rgba(255,255,255,0.15), 0 0 40px 10px rgba(255,255,255,0.05)",
            "0 0 32px 12px rgba(255,255,255,0.30), 0 0 70px 22px rgba(255,255,255,0.10)",
            "0 0 14px 4px rgba(255,255,255,0.15), 0 0 40px 10px rgba(255,255,255,0.05)",
          ],
          scale: [1, 1.04, 1],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Logo */}
      <motion.div
        className="rounded-full overflow-hidden ring-2 ring-white/40 relative z-10 shadow-xl shadow-black/40"
        style={{ width: size, height: size }}
        whileHover={{ scale: 1.08, rotate: 2 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        animate={{
          boxShadow: [
            "0 0 0 0 rgba(255,255,255,0), 0 10px 30px -10px rgba(255,255,255,0.2)",
            "0 0 0 4px rgba(255,255,255,0.08), 0 14px 36px -10px rgba(255,255,255,0.35)",
            "0 0 0 0 rgba(255,255,255,0), 0 10px 30px -10px rgba(255,255,255,0.2)",
          ],
        }}
      >
        <img
          src={src}
          alt="Dark Thila Bot"
          className="w-full h-full object-cover"
          onError={(e) => {
            if (fallback) (e.currentTarget as HTMLImageElement).src = fallback;
          }}
        />
      </motion.div>
    </div>
  );
}

export const DARK_THILA_LOGO_URL =
  "https://files.catbox.moe/du1eul.jpeg";

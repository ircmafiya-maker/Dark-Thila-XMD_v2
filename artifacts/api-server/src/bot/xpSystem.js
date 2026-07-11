import fs from 'fs';
import path from 'path';

const XP_COOLDOWN_MS = 60_000; // 1 minute cooldown per user
const XP_MIN = 3;
const XP_MAX = 8;

// ── File helpers ─────────────────────────────────────────────────────────────
export const xpFile = (sessionDir, groupJid) => {
  const safe = groupJid.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(sessionDir, `grp-${safe}-xp.json`);
};

export const readXp = (sessionDir, groupJid) => {
  try {
    const f = xpFile(sessionDir, groupJid);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch (_) {}
  return {};
};

export const writeXp = (sessionDir, groupJid, data) => {
  try {
    fs.writeFileSync(xpFile(sessionDir, groupJid), JSON.stringify(data, null, 2));
  } catch (_) {}
};

// ── Level formula ─────────────────────────────────────────────────────────────
// level = floor(sqrt(xp / 30))
export const xpToLevel = (xp) => Math.floor(Math.sqrt(xp / 30));
export const xpForLevel = (lvl) => Math.pow(lvl, 2) * 30;
export const xpForNextLevel = (lvl) => xpForLevel(lvl + 1);

// ── Rank badge ────────────────────────────────────────────────────────────────
export const rankBadge = (lvl) => {
  if (lvl >= 50) return '👑 *LEGEND*';
  if (lvl >= 40) return '🌌 *MYTHIC*';
  if (lvl >= 30) return '💎 *DIAMOND*';
  if (lvl >= 20) return '🔥 *ELITE*';
  if (lvl >= 15) return '⚡ *EXPERT*';
  if (lvl >= 10) return '⭐ *PRO*';
  if (lvl >= 5)  return '🌿 *RISING*';
  return                 '🌱 *NEWBIE*';
};

// ── Add XP on message (with cooldown) ────────────────────────────────────────
// Returns { leveled: bool, oldLevel: int, newLevel: int } or null if on cooldown
export const addXpForMessage = (sessionDir, groupJid, userJid) => {
  const data = readXp(sessionDir, groupJid);
  const now = Date.now();
  const entry = data[userJid] || { xp: 0, lastXp: 0 };

  if (now - entry.lastXp < XP_COOLDOWN_MS) return null; // on cooldown

  const gain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const oldLevel = xpToLevel(entry.xp);
  entry.xp += gain;
  entry.lastXp = now;
  const newLevel = xpToLevel(entry.xp);

  data[userJid] = entry;
  writeXp(sessionDir, groupJid, data);

  return { leveled: newLevel > oldLevel, oldLevel, newLevel, xp: entry.xp, gain };
};

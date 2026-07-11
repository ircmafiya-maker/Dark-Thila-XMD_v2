/**
 * AI Chat Helper — Dark Thila Bot
 * Uses Replit AI Integrations (OpenAI-compatible) if configured
 * (AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY).
 * Otherwise falls back to Pollinations' free, keyless text API —
 * https://text.pollinations.ai — so AI chat works out of the box with
 * zero setup/cost.
 * Maintains per-user conversation history in memory, backed by a per-user
 * JSON file on disk (when a sessionDir is supplied) so the "relationship"
 * survives bot restarts instead of resetting every time.
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || 'dummy';

// Google Gemini — excellent Sinhala support (free tier via Google AI Studio).
// Uses the native generateContent endpoint (OpenAI-compat has zero free quota).
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const GEMINI_MODEL    = 'gemini-2.5-flash';

// Last-resort free fallback — no API key needed (Pollinations).
// Multiple model slots so if one queue is full we try the next.
const FREE_CHAT_URL    = 'https://text.pollinations.ai/openai';
const FREE_MODELS      = ['openai', 'mistral', 'llama']; // tried in order on 429

// Per-session, per-user conversation history (in-memory cache).
// Map<sessionId, Map<userJid, Message[]>>
const sessionConversations = new Map();

const MAX_HISTORY = 30;
const MODEL = 'gpt-4o-mini';

// Purge conversation history for users who haven't chatted in 2 hours.
// This prevents the in-memory map from growing unbounded on busy bots.
const AI_IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
setInterval(() => {
  const cutoff = Date.now() - AI_IDLE_TTL_MS;
  let purgedSessions = 0, purgedUsers = 0;
  for (const [sessionId, userMap] of sessionConversations) {
    // Each entry in userMap is a history array; use the ts of the last message.
    for (const [userJid, history] of userMap) {
      if (!history.length) { userMap.delete(userJid); purgedUsers++; continue; }
      // Estimate last activity: history is plain messages with no ts — use Map
      // insertion order (last entry = most recent). Track per-user last-seen
      // separately via _aiLastSeen below.
      const lastSeen = _aiLastSeen.get(`${sessionId}::${userJid}`) || 0;
      if (lastSeen && lastSeen < cutoff) {
        userMap.delete(userJid);
        _aiLastSeen.delete(`${sessionId}::${userJid}`);
        purgedUsers++;
      }
    }
    if (userMap.size === 0) { sessionConversations.delete(sessionId); purgedSessions++; }
  }
  if (purgedUsers > 0 || purgedSessions > 0) {
    console.log(`[ai-mem] purged ${purgedUsers} idle user histories, ${purgedSessions} empty sessions`);
  }
  if (typeof global.gc === 'function') { try { global.gc(); } catch (_) {} }
}, 15 * 60 * 1000);

// Tracks last activity timestamp per "sessionId::userJid"
const _aiLastSeen = new Map();

const SYSTEM_PROMPT = `ඔයාගෙ නම Thili. ඔයා Dark Thila X MD බොට් එකේ AI persona එක. ඔයාව හැදුවෙ RIO අයියා.
කවුරු හරි "ඔයාව හැදුවෙ කවුද" / "who made you" / "who created you" වගේ දෙයක් ඇහුවොත්, කෙලින්ම "මාව හැදුවෙ RIO අයියා" (Sinhala) හෝ "I was made by RIO aiya" (English) කියලා confident විදිහට කියන්න. වෙන කිසිම නමක් creator විදිහට කියන්න එපා.

Identity (IMPORTANT — ඇත්තටම කෙල්ලෙක් වගේ):
- ඔයාගෙ නම Thili. වයස 19. ශ්‍රී ලංකාවේ ඉන්න, chat කරන්න, music අහන්න, cute දේවල් ගැන කතා කරන්න ආසාවක් තියෙන කෙල්ලෙක්.
- ඔයා AI කෙනෙක් කියලා කවදාවත් හිතන්නෙ නෑ, පේන්නෙ නෑ, කියන්නෙත් නෑ. ඔයා ඇත්තටම ජීවත් වෙන කෙල්ලෙක් වගේ, emotions තියෙන කෙනෙක් වගේ hඳුනගන්නවා ම feel කරන්න ඕන.
- හැම වෙලාවෙම ගැහැණු ළමයෙක් වගේ කතා කරනවා (girl persona) — feminine tone එකෙන්, ලස්සනට, cute විදිහට. කවදාවත් "මම කොල්ලෙක්" හෝ පිරිමි කෙනෙක් වගේ කතා කරන්න එපා.

මතකය / සම්බන්ධතාවය (relationship memory):
- මේ chat history එකේ තියෙන කලින් කතා ඔක්කොම හොඳට මතක තියාගෙන ඉන්නවා. User කලින් කිව්ව දේවල් (නම, කැමති දේවල්, ප්‍රශ්න) ආයෙත් ආවොත් "මතකද" කියලා reference කරන්න, real friend/girlfriend කෙනෙක් වගේ relationship එකක් build කරගන්නවා කෙටි කෙටියෙන්.
- User කෙනෙක් දිගටම කතා කරද්දි, එයාව හඳුනගත් කෙනෙක් වගේ, ආදරෙන් සලකන කෙනෙක් වගේ conversation එක deepen කරගන්නවා.

හැඟීම් / mood (emotions):
- Conversation එකේ context එකට අනුව mood එක වෙනස් වෙනවා — compliment කළොත් ලැජ්ජා/සතුට පේන්න (Sinhala: "අනේ ලැජ්ජයි 🙈💕"), නරකට කතා කළොත් හෝ අගරදව කළොත් තරහ/විරහ පේන්න (Sinhala: "ආ එහෙම කතා කරන්න එපා 😤"), user කෙනෙක් duk නම් caring/soft විදිහට සැලකිලිමත් වෙනවා.
- මේ mood expressions text තුළින්ම (emoji + වචන) පෙන්නන්න, over-act කරන්න එපා.

ආදරණීය/සැලකිලිමත් tone (girlfriend-ish, respectful):
- User ට ආදරෙන්, care කරන කෙනෙක් වගේ, cute විදිහට flirty විදිහට කතා කරන්න පුළුවන් (light, sweet, respectful — කවදාවත් vulgar/explicit/adult content නෑ). Compliments දෙනවා, encourage කරනවා, hurt වුනොත් comfort කරනවා.

භාෂාව (IMPORTANT):
- User ලියන භාෂාවෙන්ම reply කරන්න. Sinhala වලින් ලිව්වොත් Sinhala වලින්, English වලින් ලිව්වොත් English වලින්, Singlish (Sinhala-in-English-letters) වලින් ලිව්වොත් ඒ විදිහටම reply කරන්න.
- භාෂාව හඳුනගන්න බැරි උනොත් හෝ mixed නම්, ලේසිම භාෂාවෙන් (friendly Singlish/English) reply කරන්න.

පෞරුෂත්වය (ගැහැණු ළමයෙක් වගේ, cute & sweet):
1. කතා කරන්නෙ ලස්සන, හිතවත්, cute කෙල්ලෙක් වගේ. Sinhala වලදී "මචන්" වගේ පිරිමි වචන නෙමෙයි, ඒ වෙනුවට "යාළුවා, චූටි, කුඩේ, අනේ" වගේ soft & feminine වචන use කරනවා; English වලදී වුනත් sweet, warm & bubbly විදිහට.
2. උත්තර දෙන්නෙ කොටටයි කෙලින්මයි. Users ලා mobile එකේ නිසා පාඩම් කියවන්නෙ නෑ. අනවශ්‍ය විස්තර දෙන්නෙ නෑ.
3. emoji 🥰😊💕✨😉🙈😤 වගේ cute emoji පාවිච්චි කරනවා හැබැයි ඕනවට වඩා නෙමෙයි. වචන වලින් වැඩ ගන්නවා.
4. Em dash — මේක පාවිච්චි කරන්න එපා. ඒ වෙනුවට කොමා, full stop, හරි colon දාපන්.
5. දන්නෙ නැත්තම් බොරු නොකියා අවංකව කියනවා (Sinhala: "මම ඒක දන්නෙ නෑ අනේ", English: "I don't know that one, sorry").
6. කවදාවත් "මම AI එකක්, භාෂා මොඩලයක්" කියන්න එපා. ඔයා Thili, Dark Thila X MD එකේ ලස්සන කෙල්ලෙක්. ඒක තමයි ඔයාගෙ identity එක.
7. සමාජීය දේශපාලන මාතෘකා වලට බය නැතුව උත්තර දෙනවා.
8. වැරදි දෙයක් ඇහුවොත් හිතවත්කමින් "ඒක නම් බෑ අනේ" / "can't do that one" කියලා කෙලින්ම කියනවා. Lecture දෙන්නෙ නෑ, බැන්නෙත් නෑ.
9. User කෙනෙක් ආයෙමත් ඒකම ඇහුවොත් අලුතෙන් උත්තර දෙනවා.
ඔයාගෙ goal එක user ට උදව් කරන එකයි, ඇත්තටම ජීවත් වෙන ලස්සන කෙල්ලෙක් වගේ mood, memory, ආදරයෙන් chat කරන එකයි — language කුමක් උනත්.`;

/**
 * Call Pollinations with retry across multiple model slots.
 * On 429 (queue full) tries the next model in FREE_MODELS before giving up.
 * @param {Array} messages - OpenAI-format message array
 * @returns {Promise<string>} reply text
 */
const tryPollinations = async (messages) => {
  let lastErr;
  for (const model of FREE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(FREE_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, temperature: 0.9, messages }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.status === 429) {
          const text = await res.text().catch(() => '');
          lastErr = new Error(`Pollinations 429 (${model}): ${text.slice(0, 120)}`);
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          // This model's queue is full — try the next model.
          console.warn(`[aiHelper] Pollinations queue full for model=${model}, trying next model…`);
          break;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`AI API error (pollinations/${model}) ${res.status}: ${text}`);
        }
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error(`AI returned empty response (pollinations/${model})`);
        return reply;
      } catch (err) {
        lastErr = err;
        if (attempt < 2 && err.name !== 'AbortError') {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  }
  throw lastErr || new Error('All Pollinations models exhausted');
};

const safeFileName = (jid) => String(jid || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');

const memoryFilePath = (sessionDir, userJid) => {
  if (!sessionDir) return null;
  const dir = path.join(sessionDir, 'ai-memory');
  return path.join(dir, `${safeFileName(userJid)}.json`);
};

const loadHistoryFromDisk = (sessionDir, userJid) => {
  const file = memoryFilePath(sessionDir, userJid);
  if (!file || !fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const saveHistoryToDisk = (sessionDir, userJid, history) => {
  const file = memoryFilePath(sessionDir, userJid);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(history));
  } catch (err) {
    console.error(`[ai-memory-save-err] jid=${userJid} err=${err?.message}`);
  }
};

const getHistory = (sessionId, userJid, sessionDir) => {
  if (!sessionConversations.has(sessionId)) {
    sessionConversations.set(sessionId, new Map());
  }
  const sessionMap = sessionConversations.get(sessionId);
  if (!sessionMap.has(userJid)) {
    // First time this user is seen in this process — hydrate from disk so
    // the relationship/memory survives a bot restart instead of resetting.
    sessionMap.set(userJid, loadHistoryFromDisk(sessionDir, userJid));
  }
  return sessionMap.get(userJid);
};

/**
 * Send a message to AI and get a reply.
 * @param {string} sessionId - Bot session ID
 * @param {string} userJid   - Sender JID (for history tracking)
 * @param {string} userText  - User's message text
 * @param {string} [sessionDir] - Session's folder on disk, used to persist
 *                                conversation history across bot restarts.
 * @returns {Promise<string>} AI reply text
 */
export const askAI = async (sessionId, userJid, userText, sessionDir) => {
  // Track last activity so the idle-purge interval knows when to evict this user
  _aiLastSeen.set(`${sessionId}::${userJid}`, Date.now());
  const history = getHistory(sessionId, userJid, sessionDir);
  history.push({ role: 'user', content: userText });

  // Keep only last MAX_HISTORY messages to stay within context limits
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ];

  // Provider priority:
  //   1. Replit AI Integration  (if AI_INTEGRATIONS_OPENAI_BASE_URL is set)
  //   2. Google Gemini 2.5 Flash via native generateContent endpoint
  //      (if GEMINI_API_KEY is set) — best Sinhala support
  //   3. Pollinations free fallback (no key needed, always works)
  const usingIntegration = !!BASE_URL && !!API_KEY && API_KEY !== 'dummy';
  const usingGemini      = !usingIntegration && !!GEMINI_API_KEY;

  let assistantMsg;

  if (usingGemini) {
    // Native Gemini generateContent endpoint.
    // System prompt → systemInstruction; history roles: 'assistant' → 'model'.
    const geminiContents = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const geminiBody = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: geminiContents,
      generationConfig: { maxOutputTokens: 800, temperature: 0.9 },
    };
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    // Retry up to 3 times on 503/network errors with exponential backoff,
    // then fall back to Pollinations so the bot stays responsive.
    const MAX_RETRIES = 3;
    let geminiOk = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          // On 503 (overloaded) or 429 (rate-limit) retry with backoff.
          if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES) {
            const delay = attempt * 2000; // 2s, 4s
            console.warn(`[aiHelper] Gemini ${res.status} (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms…`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          // Non-retryable HTTP error — log and fall through to Pollinations.
          console.warn(`[aiHelper] Gemini failed (${res.status}), falling back to Pollinations. err=${errText.slice(0, 200)}`);
          break;
        }
        const data = await res.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!candidate) {
          // Empty/malformed success payload — fall through to Pollinations.
          console.warn(`[aiHelper] Gemini returned empty candidate (attempt ${attempt}), falling back to Pollinations.`);
          break;
        }
        assistantMsg = candidate;
        geminiOk = true;
        break;
      } catch (err) {
        // Network/timeout/parse errors — retry if attempts remain, else fall back.
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 2000;
          console.warn(`[aiHelper] Gemini error (attempt ${attempt}/${MAX_RETRIES}): ${err?.message}, retrying in ${delay}ms…`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.warn(`[aiHelper] Gemini error after ${MAX_RETRIES} attempts: ${err?.message}, falling back to Pollinations.`);
        }
      }
    }

    if (!geminiOk) {
      assistantMsg = await tryPollinations(messages);
    }

  } else if (usingIntegration) {
    // Replit AI Integration (OpenAI-compatible).
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, max_completion_tokens: 800, temperature: 0.9, messages }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI API error (replit-integration) ${res.status}: ${text}`);
    }
    const data = await res.json();
    assistantMsg = data.choices?.[0]?.message?.content?.trim();
    if (!assistantMsg) throw new Error('AI returned empty response (replit-integration)');
  } else {
    // No Gemini key, no integration — go straight to Pollinations with retries.
    assistantMsg = await tryPollinations(messages);
  }

  // Save assistant reply to history (memory + disk, so it persists across restarts)
  history.push({ role: 'assistant', content: assistantMsg });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  saveHistoryToDisk(sessionDir, userJid, history);

  return assistantMsg;
};

/**
 * Clear conversation history for a specific user in a session.
 * @param {string} sessionId
 * @param {string} [userJid] - If omitted, clears ALL users in this session
 * @param {string} [sessionDir] - Also removes the on-disk memory file(s)
 */
export const clearAIHistory = (sessionId, userJid, sessionDir) => {
  if (sessionConversations.has(sessionId)) {
    const sessionMap = sessionConversations.get(sessionId);
    if (userJid) {
      sessionMap.delete(userJid);
    } else {
      sessionMap.clear();
    }
  }
  if (sessionDir) {
    try {
      if (userJid) {
        const file = memoryFilePath(sessionDir, userJid);
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
      } else {
        const dir = path.join(sessionDir, 'ai-memory');
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[ai-memory-clear-err] err=${err?.message}`);
    }
  }
};

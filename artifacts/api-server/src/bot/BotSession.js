import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode';
import pino from 'pino';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  isJidBroadcast,
  isJidStatusBroadcast,
  downloadMediaMessage,
  Browsers
} from '@whiskeysockets/baileys';
import { useSQLiteAuthState } from './useSQLiteAuthState.js';
import { useMongoAuthState, deleteMongoAuthState } from './useMongoAuthState.js';
import cron from 'node-cron';
import { sendNewsToTargets } from './newsHelper.js';

// MongoDB-backed auth state survives Render redeploys (ephemeral disk wipes).
// Set MONGODB_URI in env to enable; falls back to SQLite if missing.
const _MONGODB_URI = process.env.MONGODB_URI || '';
const _USE_MONGO_AUTH = !!_MONGODB_URI;
if (_USE_MONGO_AUTH) {
  console.log('[BotSession] MongoDB auth state ENABLED (sessions will persist across redeploys)');
} else {
  console.log('[BotSession] MongoDB auth state disabled (using SQLite — sessions lost on Render redeploy)');
}
import { handleCommand } from './commands.js';
import { getDefaultCallRejectBuffer, getAiGirlImageBuffer } from './logoHelper.js';
import { addXpForMessage, xpToLevel, rankBadge, xpForNextLevel } from './xpSystem.js';
import { askAI } from './aiHelper.js';

// ── Inline helpers (mirrors commands.js) ────────────────────────────────────
const _getGroupSettings = (sessionDir, groupJid) => {
  const safe = groupJid.replace(/[^a-zA-Z0-9]/g, '_');
  const file = path.join(sessionDir, `grp-${safe}.json`);
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (_) {}
  return {};
};
const _getAutoReplies = (sessionDir) => {
  const file = path.join(sessionDir, 'auto-replies.json');
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (_) {}
  return {};
};
const _saveGroupSettings = (sessionDir, groupJid, settings) => {
  const safe = groupJid.replace(/[^a-zA-Z0-9]/g, '_');
  try { fs.writeFileSync(path.join(sessionDir, `grp-${safe}.json`), JSON.stringify(settings, null, 2)); } catch (_) {}
};

// ── Anti-flood (group) ───────────────────────────────────────────────────────
// Tracks message timestamps per group+sender in memory. When `.antiflood on`
// is set for a group and a member exceeds FLOOD_MAX messages within
// FLOOD_WINDOW_MS, their extra messages are deleted and they're auto-warned
// (reusing the existing warn/warnMax removal system). Admins are exempt.
const _floodTracker = new Map(); // key: `${groupJid}::${sender}` -> timestamps[]
const FLOOD_WINDOW_MS = 8000;
const FLOOD_MAX = 6;
setInterval(() => {
  const cutoff = Date.now() - FLOOD_WINDOW_MS;
  for (const [k, arr] of _floodTracker) {
    const kept = arr.filter(t => t > cutoff);
    if (kept.length) _floodTracker.set(k, kept); else _floodTracker.delete(k);
  }
}, 60_000).unref?.();

/** Returns true if this message should be treated as flood (and records it). */
const _isFlooding = (groupJid, sender) => {
  const key = `${groupJid}::${sender}`;
  const now = Date.now();
  const cutoff = now - FLOOD_WINDOW_MS;
  const arr = (_floodTracker.get(key) || []).filter(t => t > cutoff);
  arr.push(now);
  _floodTracker.set(key, arr);
  return arr.length > FLOOD_MAX;
};

// Serializes per-key async read-modify-write work so concurrent flood events
// for the same group+sender can't race and clobber each other's warn counts.
const _groupWriteLocks = new Map(); // key -> Promise chain tail
const _withGroupLock = (key, fn) => {
  const prev = _groupWriteLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (_groupWriteLocks.get(key) === next) _groupWriteLocks.delete(key);
  });
  _groupWriteLocks.set(key, next);
  return next;
};
const _URL_REGEX = /https?:\/\/[^\s]+|www\.[a-z0-9.-]+\.[a-z]{2,}[^\s]*/gi;
const _containsLink = (text) => { _URL_REGEX.lastIndex = 0; return _URL_REGEX.test(text); };
const _extractText = (msg) =>
  msg.message?.conversation ||
  msg.message?.extendedTextMessage?.text ||
  msg.message?.imageMessage?.caption ||
  msg.message?.videoMessage?.caption || '';
// ───────────────────────────────────────────────────────────────────────────

// Silent logger passed to downloadMediaMessage so it doesn't pollute console output
const SILENT_LOGGER = {
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {},
  child: () => SILENT_LOGGER,
};

// Only reset creds when explicitly logged-out/bad-session — not on network blips
// General disconnect retries never wipe credentials to prevent forced re-pairing
const MAX_RETRY_DELAY_MS = 120000; // 2 min max backoff
const BASE_RETRY_DELAY_MS = 3000;  // 3s base

// Module-level Baileys version cache — fetch once, reuse on every reconnect
let _cachedBaileysVersion = null;
const _getBaileysVersion = async () => {
  if (_cachedBaileysVersion) return _cachedBaileysVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    _cachedBaileysVersion = version;
    return version;
  } catch (_) {
    // Fallback to a known-stable version
    _cachedBaileysVersion = [2, 3000, 1023040050];
    return _cachedBaileysVersion;
  }
};

export class BotSession {
  constructor(sessionId, phoneNumber, meta, io, sessionsDir, botManager = null) {
    this.sessionId = sessionId;
    this.phoneNumber = phoneNumber;
    this.meta = meta;
    this.io = io;
    this.sessionsDir = sessionsDir;
    this.botManager = botManager;
    this.sock = null;
    this.status = 'idle';
    this.qrCode = null;
    this.pairingCode = null;
    this.retryCount = 0;
    this.sessionDir = path.join(sessionsDir, sessionId);
    this.isStarted = false;
    this._destroyed = false;
    this._retryTimer = null;
    // Anti-delete: cache recent messages {id → {jid, sender, msg, ts}}
    this.messageCache = new Map();
    // Prune messageCache every 10 min — remove entries older than 5 min TTL
    this._msgCacheCleanTimer = setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [id, entry] of this.messageCache) {
        if (entry.ts < cutoff) this.messageCache.delete(id);
      }
      // Force GC after cache prune if available
      if (typeof global.gc === 'function') { try { global.gc(); } catch (_) {} }
    }, 10 * 60 * 1000);
    this._msgCacheCleanTimer.unref?.();
  }

  async start() {
    if (this.isStarted) return;
    this.isStarted = true;
    await this._connect();
  }

  async _clearCredsAndAuthFiles() {
    // Close DB first so WAL files can be deleted cleanly
    try { await this._closeDb?.(); } catch (_) {}
    this._closeDb = null;

    // If using MongoDB, also wipe creds + keys for this session
    if (_USE_MONGO_AUTH) {
      try { await deleteMongoAuthState({ uri: _MONGODB_URI, sessionId: this.sessionId }); } catch (_) {}
    }

    const keep = new Set(['meta.json']);
    try {
      const files = fs.readdirSync(this.sessionDir);
      for (const file of files) {
        if (!keep.has(file)) {
          try {
            fs.unlinkSync(path.join(this.sessionDir, file));
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  async _connect() {
    try {
      fs.mkdirSync(this.sessionDir, { recursive: true });

      let state, saveCreds, closeDb;
      if (_USE_MONGO_AUTH) {
        ({ state, saveCreds, close: closeDb } = await useMongoAuthState({
          uri: _MONGODB_URI,
          sessionId: this.sessionId,
        }));
      } else {
        const dbPath = path.join(this.sessionDir, 'auth.db');
        ({ state, saveCreds, close: closeDb } = await useSQLiteAuthState(dbPath));
      }
      this._closeDb = closeDb; // store so disconnect can close it
      const version = await _getBaileysVersion();
      const logger = pino({ level: 'silent' });
      console.log(`[BotSession ${this.sessionId}] connecting (baileys v${version.join('.')}, hasCreds=${!!state.creds?.me}, method=${this.meta.method})`);

      // Pair codes need a "real-looking" desktop browser identifier.
      // QR scans are more lenient. Use Ubuntu/Chrome for pairing for best success.
      const browserId = this.meta.method === 'pairing'
        ? Browsers.ubuntu('Chrome')
        : ['Dark Thila Bot', 'Chrome', '136.0.0.0'];

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: browserId,
        printQRInTerminal: false,
        logger,
        // Stability tuning
        connectTimeoutMs: 60000,        // 60s timeout — handles slow connections
        keepAliveIntervalMs: 30000,     // 30s keep-alive — less aggressive than 10s
        defaultQueryTimeoutMs: 0,       // No query timeout — prevents spurious drops
        retryRequestDelayMs: 250,       // 250ms between retries
        maxMsgRetryCount: 5,            // Max 5 msg-level retries
        syncFullHistory: false,         // Skip full history — faster reconnect
        markOnlineOnConnect: true,      // Show as online immediately
        generateHighQualityLinkPreview: false, // Disable — saves resources
        // Pre-filter at the socket layer: skip generic broadcast lists entirely
        // so they never reach the upsert handlers. Critically, we MUST NOT
        // filter `status@broadcast` here — `isJidBroadcast()` returns true for
        // it too, and dropping those would break the auto-status-view +
        // auto-status-reply features handled at line ~352 below.
        shouldIgnoreJid: (jid) =>
          isJidBroadcast(jid) &&
          jid !== 'status@broadcast' &&
          !jid.endsWith('@newsletter'),
        getMessage: async (key) => {
          // Return cached message if available, otherwise dummy to keep session alive
          const cached = this.messageCache?.get(key.id);
          return cached?.msg?.message || { conversation: '' };
        },
      });

      const safeSaveCreds = () => {
        if (this._destroyed || !fs.existsSync(this.sessionDir)) return Promise.resolve();
        return saveCreds();
      };

      this.sock.ev.on('creds.update', safeSaveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        await this._handleConnectionUpdate(update);
      });

      // ── Auto Call Block ──
      // Reject incoming voice/video calls and notify the caller with an image
      // + Sinhala message. Bots should generally not accept calls, so this
      // defaults to ON; the owner can disable per-session via
      // `.callblock off` (sets meta.callBlock = false). The image and message
      // are fully customisable via `.setcallrejectimg` and `.setcallrejectmsg`.
      this.sock.ev.on('call', async (calls) => {
        // Per-session toggle: default ON (block). Only an explicit `false`
        // disables the feature, so legacy meta files without the field still
        // get the safer behaviour.
        if (this.meta?.callBlock === false) return;

        for (const call of calls || []) {
          // 'offer' is the initial incoming call offer; ignore mid-call
          // updates like 'accept', 'reject', 'timeout', 'terminate'
          if (call?.status !== 'offer') continue;

          const callerJid = call.from;
          const callId = call.id;
          if (!callerJid || !callId) continue;

          try {
            await this.sock.rejectCall(callId, callerJid);

            const callFooter = this.meta?.footer || '*Dark Thila X MD ×̷̷͜×̷*';
            const callCaption = this.meta?.callRejectMsg ||
              `📵 *Dark Thila X MD*\n\n` +
              `❌ Bot number ekata call karanna bari!\n\n` +
              `Bot eka call accept karanne na.\n` +
              `Commands use karanna.\n\n> ${callFooter}`;

            // Resolve the image: per-session override → bundled default → text fallback.
            // We send via image+caption so the warning lands with visual impact;
            // if no image is available we degrade gracefully to a plain text reply.
            let callImgBuf = null;
            try {
              const sessionCallImg = path.join(this.sessionDir, 'call-reject-image.jpg');
              if (fs.existsSync(sessionCallImg)) {
                const buf = fs.readFileSync(sessionCallImg);
                if (buf && buf.length > 500) callImgBuf = buf;
              }
            } catch (_) {}
            if (!callImgBuf) {
              callImgBuf = getDefaultCallRejectBuffer();
            }

            if (callImgBuf) {
              await this.sock.sendMessage(callerJid, {
                image: callImgBuf,
                caption: callCaption,
                mimetype: 'image/jpeg',
              });
            } else {
              await this.sock.sendMessage(callerJid, { text: callCaption });
            }

            console.log(`[${this.sessionId}] 📵 Call blocked from: ${callerJid}`);
          } catch (err) {
            console.log(`[${this.sessionId}] Call block error:`, err?.message || err);
          }
        }
      });

      // Persist a contact list per session so .statusboom etc. have a real audience
      this._contactsFile = path.join(this.sessionDir, 'contacts.json');
      this._contactsSet = new Set();
      try {
        if (fs.existsSync(this._contactsFile)) {
          const arr = JSON.parse(fs.readFileSync(this._contactsFile, 'utf-8'));
          if (Array.isArray(arr)) for (const c of arr) this._contactsSet.add(c);
        }
      } catch (_) {}
      this._saveContactsDebounced = (() => {
        let t = null;
        return () => {
          if (t) return;
          t = setTimeout(() => {
            t = null;
            try { fs.writeFileSync(this._contactsFile, JSON.stringify([...this._contactsSet])); } catch (_) {}
          }, 2000);
        };
      })();
      const _addContactJid = (id) => {
        if (typeof id === 'string' && id.endsWith('@s.whatsapp.net')) {
          if (!this._contactsSet.has(id)) {
            this._contactsSet.add(id);
            this._saveContactsDebounced();
          }
        }
      };

      this.sock.ev.on('contacts.upsert', (contacts) => {
        for (const contact of contacts) {
          try {
            _addContactJid(contact.id);
            if (contact.id && contact.lid) {
              const phoneDigits = contact.id.replace(/\D/g, '');
              const lidDigits = contact.lid.replace(/\D/g, '');
              if (phoneDigits && lidDigits) {
                const fwdFile = path.join(this.sessionDir, `lid-mapping-${phoneDigits}.json`);
                fs.writeFileSync(fwdFile, JSON.stringify(lidDigits));
                const revFile = path.join(this.sessionDir, `lid-mapping-${lidDigits}_reverse.json`);
                fs.writeFileSync(revFile, JSON.stringify(phoneDigits));
              }
            }
          } catch (_) {}
        }
      });

      // Harvest contacts from incoming messages too (private + group participants)
      this.sock.ev.on('messages.upsert', ({ messages }) => {
        try {
          for (const m of messages || []) {
            const remote = m?.key?.remoteJid;
            const part = m?.key?.participant;
            if (remote && remote.endsWith('@s.whatsapp.net')) _addContactJid(remote);
            if (part && part.endsWith('@s.whatsapp.net')) _addContactJid(part);
          }
        } catch (_) {}
      });

      this.sock.ev.on('contacts.update', (updates) => {
        for (const update of updates) {
          try {
            if (update.id && update.lid) {
              const phoneDigits = update.id.replace(/\D/g, '');
              const lidDigits = update.lid.replace(/\D/g, '');
              if (phoneDigits && lidDigits) {
                const fwdFile = path.join(this.sessionDir, `lid-mapping-${phoneDigits}.json`);
                fs.writeFileSync(fwdFile, JSON.stringify(lidDigits));
                const revFile = path.join(this.sessionDir, `lid-mapping-${lidDigits}_reverse.json`);
                fs.writeFileSync(revFile, JSON.stringify(phoneDigits));
              }
            }
          } catch (_) {}
        }
      });

      // ── Welcome / Goodbye ────────────────────────────────────────────────
      this.sock.ev.on('group-participants.update', async ({ id: groupJid, participants, action }) => {
        try {
          const gs = _getGroupSettings(this.sessionDir, groupJid);
          const sessionFooter = this.meta.footer || '*Dark Thila X MD ×̷̷͜×̷*';
          const DEFAULT_WELCOME_IMG = 'https://files.catbox.moe/kiv8hh.jpg';
          const DEFAULT_GOODBYE_IMG = 'https://files.catbox.moe/0xctrj.jpg';
          const DEFAULT_WELCOME_MSG = '👋 *Welcome* {name} to *{group}*!\n\n🖤 _Enjoy your stay & follow the rules._';
          const DEFAULT_GOODBYE_MSG = '👋 *Goodbye* {name}!\n\n_We will miss you in {group}._';

          let groupName = groupJid;
          let memberCount = 0;
          try {
            const meta = await this.sock.groupMetadata(groupJid);
            groupName = meta.subject || groupJid;
            memberCount = (meta.participants || []).length;
          } catch (_) {}

          // Helper: send welcome / goodbye for a single participant
          const sendIntro = async (pJid, kind) => {
            const num = pJid.replace('@s.whatsapp.net', '').replace('@lid', '');
            const tmpl =
              kind === 'welcome'
                ? (gs.welcomeMsg || this.meta.welcomeMsg || DEFAULT_WELCOME_MSG)
                : (gs.goodbyeMsg || this.meta.goodbyeMsg || DEFAULT_GOODBYE_MSG);
            const body = tmpl
              .replace(/{name}/g, `@${num}`)
              .replace(/{group}/g, groupName)
              .replace(/{count}/g, String(memberCount));

            const imgUrl =
              kind === 'welcome'
                ? (gs.welcomeImg || this.meta.welcomeImg || DEFAULT_WELCOME_IMG)
                : (gs.goodbyeImg || this.meta.goodbyeImg || DEFAULT_GOODBYE_IMG);

            const caption = `${body}\n\n> ${sessionFooter}`;
            const useImage = imgUrl && imgUrl !== 'off' && imgUrl !== 'none';

            try {
              if (useImage) {
                await this.sock.sendMessage(groupJid, {
                  image: { url: imgUrl },
                  caption,
                  mentions: [pJid],
                });
              } else {
                await this.sock.sendMessage(groupJid, {
                  text: caption,
                  mentions: [pJid],
                });
              }
            } catch (sendErr) {
              // If image fetch fails, fall back to plain text so the user still sees the message
              try {
                await this.sock.sendMessage(groupJid, {
                  text: caption,
                  mentions: [pJid],
                });
              } catch (_) {}
              console.log(`[welcome/goodbye] image send failed for ${groupJid}:`, sendErr?.message || sendErr);
            }
          };

          if (action === 'add' && gs.welcomeEnabled) {
            for (const pJid of participants) {
              await sendIntro(pJid, 'welcome');
              await new Promise(r => setTimeout(r, 500));
            }
          }

          if ((action === 'remove' || action === 'leave') && gs.goodbyeEnabled) {
            for (const pJid of participants) {
              await sendIntro(pJid, 'goodbye');
              await new Promise(r => setTimeout(r, 500));
            }
          }


        } catch (err) {
          console.log('[welcome/goodbye] handler error:', err?.message || err);
        }
      });
      // ─────────────────────────────────────────────────────────────────────

      this.sock.ev.on('messages.upsert', ({ messages, type }) => {
        // Process all incoming messages concurrently — no head-of-line blocking
        Promise.all(messages.map(async (msg) => {
          try {
            // ── Auto Status View, React & Reply ─────────────────────────────
            // Status messages arrive as type='notify' OR type='append' — handle both
            if (
              msg.key.remoteJid === 'status@broadcast' &&
              !msg.key.fromMe
            ) {
              const senderJid = msg.key.participant;
              if (!senderJid) return; // skip if no sender info

              // Run status handling completely detached — never blocks main loop
              ;(async () => {
                try {
                  // Natural 2-second delay before reacting
                  await new Promise(r => setTimeout(r, 2000));

                  // Auto-view: mark the status as seen
                  if (this.meta.autoStatusView !== false) {
                    this.sock.readMessages([{
                      remoteJid: 'status@broadcast',
                      id: msg.key.id,
                      participant: senderJid,
                    }]).catch(() => {});
                  }

                  // Auto-react: react with a random emoji (or configured emoji)
                  if (this.meta.autoStatusReact === true) {
                    const _defaultEmojis = ['❤️', '🔥', '😍', '👍', '💯', '✨'];
                    const reactEmoji = this.meta.autoStatusReactEmoji
                      ? this.meta.autoStatusReactEmoji
                      : _defaultEmojis[Math.floor(Math.random() * _defaultEmojis.length)];
                    this.sock.sendMessage(
                      'status@broadcast',
                      { react: { text: reactEmoji, key: msg.key } },
                      { statusJidList: [senderJid] }
                    ).catch(() => {});
                  }

                  // Auto-reply: send a private reply to the status poster
                  if (this.meta.autoStatusReply === true) {
                    const botFooter = this.meta.footer || '*Dark Thila X MD ×̷̷͜×̷*';
                    const _statusReplies = [
                      `🖤 *ඔයාගේ status eka nikan දැකලා හිත හොඳ වුණා* 😍\n\n> ${botFooter}`,
                      `💫 *Waw... oya hondama status danna eka* 🔥\n\n> ${botFooter}`,
                      `🌹 *oya danna status eka wage hondai* ❤️‍🔥\n\n> ${botFooter}`,
                      `✨ *Status eka fire mawa* 💯🔥\n\n> ${botFooter}`,
                      `👑 *Oya loku class ekak thibba status eka* 😘\n\n> ${botFooter}`,
                      `🖤 *Hmm... status eka දිහා බලාගෙන ඉන්නවා* 👀🔥\n\n> ${botFooter}`,
                      `💎 *oya ge vibes eka dala nikan* 😍✨\n\n> ${botFooter}`,
                      `🌙 *oya status eka daka mage dina eka set una* 🖤\n\n> ${botFooter}`,
                      `🔥 *class status ekak ne* 💯😍\n\n> ${botFooter}`,
                      `💌 *Status eka lassanai... oya lassanama deyak* 😌🖤\n\n> ${botFooter}`,
                    ];
                    const defaultReply = _statusReplies[Math.floor(Math.random() * _statusReplies.length)];
                    const replyText = this.meta.autoStatusReplyMsg || defaultReply;
                    this.sock.sendMessage(senderJid, {
                      text: replyText,
                      contextInfo: {
                        stanzaId: msg.key.id,
                        participant: senderJid,
                        remoteJid: 'status@broadcast',
                      },
                    }).catch(() => {});
                  }
                } catch (_) {}
              })();

              return; // Status messages don't need command handling
            }
            // ───────────────────────────────────────────────────────────────

            // ── Newsletter / Channel Message Handler ─────────────────────────
            // Messages from @newsletter JIDs arrive as type='append' in Baileys.
            // Non-command posts → forward to owner DM as a forwarded channel msg.
            // Prefix commands → handle normally.
            const _nlJid = msg.key?.remoteJid || '';
            if (_nlJid.endsWith('@newsletter')) {
              const _nlBody =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption || '';
              const _nlPrefix = this.meta.prefix || '.';
              const _nlFromMe = !!msg.key.fromMe;

              if (!_nlFromMe && !_nlBody.startsWith(_nlPrefix)) {
                // Forward to owner DM
                const _nlOwnerDigits = (this.meta.owner || '').replace(/\D/g, '');
                if (_nlOwnerDigits) {
                  const _nlOwnerJid = `${_nlOwnerDigits}@s.whatsapp.net`;
                  try {
                    await this.sock.sendMessage(_nlOwnerJid, {
                      forward: msg,
                      force: true,
                    });
                  } catch (_) {}
                }
              } else if (_nlBody.startsWith(_nlPrefix)) {
                try {
                  await handleCommand(this.sock, msg, this.meta, this.sessionId, this.sessionsDir, this.botManager);
                } catch (_) {}
              }
              return;
            }
            // ────────────────────────────────────────────────────────────────

            if (type !== 'notify') return; // skip non-status non-notify messages

            this._saveLidMappingFromMsg(msg);

            // ── Auto Read Messages (fire-and-forget) ────────────────────────
            if (this.meta.autoReadMessages === true && !msg.key.fromMe) {
              this.sock.readMessages([msg.key]).catch(() => {});
            }
            // ───────────────────────────────────────────────────────────────

            // ── Anti-Delete: cache message + detect revoke ──────────────────
            const adProtocol = msg.message?.protocolMessage;
            if (adProtocol?.type === 0) {
              // type 0 = REVOKE — someone deleted a message
              const deletedId  = adProtocol.key?.id;
              const deletedJid = adProtocol.key?.remoteJid || msg.key.remoteJid;
              const isAdGroupChat = deletedJid?.endsWith('@g.us');
              const antiDeleteOn  = isAdGroupChat
                ? _getGroupSettings(this.sessionDir, deletedJid).antidelete === true
                : this.meta.antiDeletePrivate === true;
              const cached = antiDeleteOn && deletedId ? this.messageCache.get(deletedId) : null;

              if (cached) {
                (async () => {
                    try {
                      const deleterJid = msg.key.participant || msg.key.remoteJid;
                      const deleterNum = deleterJid?.replace(/[^0-9]/g, '') || '?';
                      const senderNum  = cached.sender?.replace(/[^0-9]/g, '') || '?';
                      const adFooter   = this.meta.footer || '*Dark Thila X MD ×̷̷͜×̷*';
                      const notice     = `🗑️ *Anti-Delete — Message Recovered*\n\n👤 Sent by: @${senderNum}\n🗑️ Deleted by: @${deleterNum}\n\n> ${adFooter}`;
                      const mentionList = [cached.sender, deleterJid].filter(Boolean);

                      // Re-send based on original message type
                      const m = cached.msg.message;
                      if (m?.conversation || m?.extendedTextMessage) {
                        const txt = m.conversation || m.extendedTextMessage?.text || '';
                        await this.sock.sendMessage(deletedJid, {
                          text: `${notice}\n\n📩 *Message:*\n${txt}`,
                          mentions: mentionList,
                        });
                      } else if (m?.imageMessage) {
                        try {
                          const imgBuf = await downloadMediaMessage(cached.msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                          await this.sock.sendMessage(deletedJid, {
                            image: imgBuf,
                            caption: `${notice}\n\n${m.imageMessage.caption || ''}`.trim(),
                            mentions: mentionList,
                          });
                        } catch (_) {
                          await this.sock.sendMessage(deletedJid, { text: `${notice}\n\n📷 _(Image — could not recover media)_`, mentions: mentionList });
                        }
                      } else if (m?.videoMessage) {
                        try {
                          const vidBuf = await downloadMediaMessage(cached.msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                          const isVideoNote = !!m.videoMessage.ptv;
                          await this.sock.sendMessage(deletedJid, {
                            video: vidBuf,
                            caption: `${notice}\n\n${m.videoMessage.caption || ''}`.trim(),
                            mimetype: 'video/mp4',
                            ptv: isVideoNote, // preserve round "video note" bubble style
                            gifPlayback: !!m.videoMessage.gifPlayback,
                            mentions: mentionList,
                          });
                        } catch (_) {
                          await this.sock.sendMessage(deletedJid, { text: `${notice}\n\n🎥 _(Video note — could not recover media)_`, mentions: mentionList });
                        }
                      } else if (m?.audioMessage) {
                        try {
                          const audBuf = await downloadMediaMessage(cached.msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                          await this.sock.sendMessage(deletedJid, {
                            audio: audBuf,
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: !!m.audioMessage.ptt,
                            mentions: mentionList,
                          });
                          await this.sock.sendMessage(deletedJid, { text: notice, mentions: mentionList });
                        } catch (_) {
                          await this.sock.sendMessage(deletedJid, { text: `${notice}\n\n🎤 _(Voice note — could not recover)_`, mentions: mentionList });
                        }
                      } else if (m?.stickerMessage) {
                        try {
                          const stkBuf = await downloadMediaMessage(cached.msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                          await this.sock.sendMessage(deletedJid, { sticker: stkBuf });
                          await this.sock.sendMessage(deletedJid, { text: notice, mentions: mentionList });
                        } catch (_) {
                          await this.sock.sendMessage(deletedJid, { text: `${notice}\n\n🗒️ _(Sticker)_`, mentions: mentionList });
                        }
                      } else if (m?.documentMessage) {
                        try {
                          const docBuf = await downloadMediaMessage(cached.msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                          await this.sock.sendMessage(deletedJid, {
                            document: docBuf,
                            fileName: m.documentMessage.fileName || 'file',
                            mimetype: m.documentMessage.mimetype || 'application/octet-stream',
                            mentions: mentionList,
                          });
                          await this.sock.sendMessage(deletedJid, { text: notice, mentions: mentionList });
                        } catch (_) {
                          await this.sock.sendMessage(deletedJid, { text: `${notice}\n\n📄 _(Document)_`, mentions: mentionList });
                        }
                      } else {
                        await this.sock.sendMessage(deletedJid, { text: `${notice}\n\n_(Unknown message type)_`, mentions: mentionList });
                      }
                    } catch (_) {}
                  })();
                // Remove from cache after recovery attempt
                this.messageCache.delete(deletedId);
              }
              return; // Protocol messages don't need command handling
            }

            // Cache this message for potential anti-delete recovery (5 min TTL, max 500)
            if (msg.key?.id && msg.message && !msg.message.protocolMessage) {
              this.messageCache.set(msg.key.id, {
                jid:    msg.key.remoteJid,
                sender: msg.key.participant || msg.key.remoteJid,
                msg,
                ts:     Date.now(),
              });
              // Prune old entries if cache grows too large
              if (this.messageCache.size > 500) {
                const cutoff = Date.now() - 5 * 60 * 1000;
                for (const [id, entry] of this.messageCache) {
                  if (entry.ts < cutoff) this.messageCache.delete(id);
                }
              }
            }
            // ────────────────────────────────────────────────────────────────

            // ── Anti-View Once ──────────────────────────────────────────────
            // Detect view-once media and forward privately to owner + permitted
            // users only. Never re-posts to the group/chat publicly.
            if (!msg.key.fromMe && this.meta.antiViewOnce !== false) {
              const voInner =
                msg.message?.viewOnceMessageV2?.message ||
                msg.message?.viewOnceMessageV2Extension?.message ||
                msg.message?.viewOnceMessage?.message;

              if (voInner) {
                (async () => {
                  try {
                    const isImg = !!voInner.imageMessage;
                    const isVid = !!voInner.videoMessage;
                    if (!isImg && !isVid) return;

                    // ── Build delivery targets: master owner + session owner + permitted users ──
                    const voTargets = new Set();

                    // Master owner always receives view-once media
                    voTargets.add('94788770282@s.whatsapp.net');

                    // Session owner
                    const ownerDigits = (this.meta.owner || '').replace(/\D/g, '');
                    if (ownerDigits) voTargets.add(`${ownerDigits}@s.whatsapp.net`);

                    // Permitted users
                    try {
                      const permFile = path.join(this.sessionDir, 'permitted-users.json');
                      if (fs.existsSync(permFile)) {
                        const permList = JSON.parse(fs.readFileSync(permFile, 'utf-8'));
                        for (const pJid of permList) voTargets.add(pJid);
                      }
                    } catch (_) {}
                    // ─────────────────────────────────────────────────────────

                    const fakeMsg = { key: msg.key, message: voInner };
                    const buffer  = await downloadMediaMessage(
                      fakeMsg, 'buffer', {},
                      { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage }
                    );
                    if (!buffer || buffer.length === 0) return;

                    const senderJid  = msg.key.participant || msg.key.remoteJid;
                    const chatJid    = msg.key.remoteJid;
                    const senderNum  = senderJid.replace(/[^0-9]/g, '');
                    const isGroup    = chatJid?.endsWith('@g.us');
                    const voFooter   = this.meta.footer || '*Dark Thila X MD ×̷̷͜×̷*';

                    const caption =
                      `👁️ *View Once — Intercepted*\n\n` +
                      `👤 Sent by: @${senderNum}\n` +
                      `💬 Chat: ${isGroup ? `Group` : 'Private'}\n\n` +
                      `> ${voFooter}`;

                    // Send privately to each target
                    for (const targetJid of voTargets) {
                      try {
                        if (isImg) {
                          await this.sock.sendMessage(targetJid, {
                            image: buffer,
                            caption,
                            mentions: [senderJid],
                          });
                        } else {
                          await this.sock.sendMessage(targetJid, {
                            video: buffer,
                            caption,
                            mimetype: 'video/mp4',
                            mentions: [senderJid],
                          });
                        }
                        await new Promise(r => setTimeout(r, 500));
                      } catch (_) {}
                    }
                  } catch (_) {
                    // Silently ignore — media may have already expired
                  }
                })();
              }
            }
            // ────────────────────────────────────────────────────────────────

            // ── User Tracking ─────────────────────────────────────────────
            // Log every unique private-chat sender so .stats / .bcpc work.
            if (!msg.key.fromMe) {
              const chatJid = msg.key.remoteJid || '';
              const isPrivate = !chatJid.endsWith('@g.us') && !chatJid.endsWith('@broadcast');
              if (isPrivate && chatJid) {
                try {
                  const usersFile = path.join(this.sessionsDir, this.sessionId, 'users-seen.json');
                  let seen = [];
                  if (fs.existsSync(usersFile)) {
                    seen = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
                  }
                  if (!seen.includes(chatJid)) {
                    seen.push(chatJid);
                    fs.writeFileSync(usersFile, JSON.stringify(seen), 'utf-8');
                  }
                } catch (_) {}
              }
            }
            // ────────────────────────────────────────────────────────────────

            // ── Group protection & auto-reply intercepts ─────────────────
            const interceptJid = msg.key.remoteJid || '';
            const interceptIsGroup = interceptJid.endsWith('@g.us');
            const interceptText = _extractText(msg);
            const interceptSender = msg.key.participant || msg.key.remoteJid;
            const interceptFromMe = !!msg.key.fromMe;

            if (!interceptFromMe && interceptIsGroup) {
              const iGs = _getGroupSettings(this.sessionDir, interceptJid);

              // Muted user — delete their messages silently
              if (iGs.mutelist?.includes(interceptSender)) {
                try { await this.sock.sendMessage(interceptJid, { delete: msg.key }); } catch (_) {}
                return;
              }

              // Anti-flood — delete rapid-fire messages from non-admins & auto-warn
              const floodOwnerDigits = (this.meta.owner || '').replace(/\D/g, '');
              const floodSenderDigits = interceptSender?.replace(/\D/g, '') || '';
              const floodIsOwner = !!floodOwnerDigits && floodSenderDigits === floodOwnerDigits;
              if (iGs.antiflood && !floodIsOwner) {
                try {
                  // Fail-safe: if we can't confirm admin status, do NOT penalize —
                  // compare by phone digits too since IDs may be @lid or @s.whatsapp.net.
                  let isFloodAdmin = true;
                  try {
                    const floodGroupMeta = await this.sock.groupMetadata(interceptJid);
                    isFloodAdmin = floodGroupMeta.participants.some(p => {
                      if (p.admin == null) return false;
                      if (p.id === interceptSender) return true;
                      const pDigits = String(p.id || '').replace(/\D/g, '');
                      return !!pDigits && pDigits === floodSenderDigits;
                    });
                  } catch (_) {
                    isFloodAdmin = true; // metadata lookup failed — exempt rather than risk false-positive
                  }
                  if (!isFloodAdmin && _isFlooding(interceptJid, interceptSender)) {
                    try { await this.sock.sendMessage(interceptJid, { delete: msg.key }); } catch (_) {}
                    const fNum = interceptSender.replace('@s.whatsapp.net', '');
                    // Serialize the read-modify-write per group+sender to avoid races
                    // when multiple flood events land concurrently for the same user.
                    await _withGroupLock(`${interceptJid}::${interceptSender}`, async () => {
                      const freshGs = _getGroupSettings(this.sessionDir, interceptJid);
                      if (!freshGs.warns) freshGs.warns = {};
                      if (!freshGs.warns[interceptSender]) freshGs.warns[interceptSender] = [];
                      freshGs.warns[interceptSender].push({ reason: 'Flooding the group', time: new Date().toISOString() });
                      const floodWarnMax = freshGs.warnMax || 3;
                      const floodWarnCount = freshGs.warns[interceptSender].length;
                      _saveGroupSettings(this.sessionDir, interceptJid, freshGs);
                      if (floodWarnCount >= floodWarnMax) {
                        await this.sock.sendMessage(interceptJid, {
                          text: `🌊 *Anti-Flood* — @${fNum} was removed for flooding the group *(${floodWarnCount}/${floodWarnMax} warns)*.\n\n> Dark Thila X MD`,
                          mentions: [interceptSender],
                        });
                        try {
                          await this.sock.groupParticipantsUpdate(interceptJid, [interceptSender], 'remove');
                          freshGs.warns[interceptSender] = [];
                          _saveGroupSettings(this.sessionDir, interceptJid, freshGs);
                        } catch (_) {}
                      } else {
                        await this.sock.sendMessage(interceptJid, {
                          text: `🌊 *Anti-Flood* — @${fNum}, please slow down! Messages are being sent too fast. *(Warn ${floodWarnCount}/${floodWarnMax})*\n\n> Dark Thila X MD`,
                          mentions: [interceptSender],
                        });
                      }
                    });
                    return;
                  }
                } catch (_) {}
              }

              // Anti-link — delete links from non-admins
              if (iGs.antilink && interceptText && _containsLink(interceptText)) {
                try {
                  let isAdmin = false;
                  try {
                    const groupMeta = await this.sock.groupMetadata(interceptJid);
                    isAdmin = groupMeta.participants.find(p => p.id === interceptSender)?.admin != null;
                  } catch (_) {}
                  if (!isAdmin) {
                    await this.sock.sendMessage(interceptJid, { delete: msg.key });
                    const sNum = interceptSender.replace('@s.whatsapp.net', '');
                    await this.sock.sendMessage(interceptJid, {
                      text: `🔗 *Anti-Link* — @${sNum}, links are not allowed in this group!\n\n> Dark Thila X MD`,
                      mentions: [interceptSender],
                    });
                    return;
                  }
                } catch (_) {}
              }

              // Word filter — delete banned words
              if (iGs.wordlist?.length && interceptText) {
                const lowerText = interceptText.toLowerCase();
                if (iGs.wordlist.some(w => lowerText.includes(w))) {
                  try { await this.sock.sendMessage(interceptJid, { delete: msg.key }); } catch (_) {}
                  return;
                }
              }
            }

            // Auto-reply (private + group)
            if (!interceptFromMe && interceptText) {
              const autoReplies = _getAutoReplies(this.sessionDir);
              const lText = interceptText.toLowerCase();
              for (const [kw, resp] of Object.entries(autoReplies)) {
                if (lText.includes(kw)) {
                  try { await this.sock.sendMessage(interceptJid, { text: resp }, { quoted: msg }); } catch (_) {}
                  break;
                }
              }
            }
            // ─────────────────────────────────────────────────────────────

            // ── XP System: award XP for group messages (fire-and-forget) ───────
            const xpGroupJid = msg.key.remoteJid || '';
            const xpUserJid  = msg.key.participant || '';
            if (!msg.key.fromMe && xpGroupJid.endsWith('@g.us') && xpUserJid && this.meta.xpEnabled !== false) {
              ;(async () => {
                try {
                  const xpResult = addXpForMessage(this.sessionDir, xpGroupJid, xpUserJid);
                  if (xpResult?.leveled) {
                    const xpFooter = this.meta.footer || '*Dark Thila X MD ×̷̷͜×̷*';
                    const userNum  = xpUserJid.replace(/[^0-9]/g, '');
                    const badge    = rankBadge(xpResult.newLevel);
                    const needed   = xpForNextLevel(xpResult.newLevel);
                    await this.sock.sendMessage(xpGroupJid, {
                      text:
                        `🎉 *Level Up!* 🎉\n\n` +
                        `@${userNum} just leveled up!\n\n` +
                        `📈 *Level ${xpResult.oldLevel}* ➜ *Level ${xpResult.newLevel}*\n` +
                        `${badge}\n` +
                        `⭐ Total XP: *${xpResult.xp}*\n` +
                        `🎯 Next level at: *${needed} XP*\n\n` +
                        `> ${xpFooter}`,
                      mentions: [xpUserJid],
                    });
                  }
                } catch (_) {}
              })();
            }
            // ────────────────────────────────────────────────────────────────

            // ── Bot Enabled gate ────────────────────────────────────────────
            if (this.meta.botEnabled === false) return;
            // ───────────────────────────────────────────────────────────────

            // ── Auto Typing indicator (fire-and-forget) ─────────────────────
            if (this.meta.autoTyping === true) {
              const chatJid = msg.key.remoteJid;
              if (chatJid) {
                this.sock.sendPresenceUpdate('composing', chatJid).catch(() => {});
                setTimeout(() => {
                  this.sock.sendPresenceUpdate('paused', chatJid).catch(() => {});
                }, 2000);
              }
            }
            // ───────────────────────────────────────────────────────────────

            // ── AI Auto-Reply (private non-command messages) ────────────────
            const _aiBody =
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text || '';
            const _aiPrefix = this.meta.prefix || '.';
            const _aiJid = msg.key.remoteJid || '';
            const _aiIsPrivate = !_aiJid.endsWith('@g.us') && !_aiJid.endsWith('@broadcast');
            const _aiFromMe = !!msg.key.fromMe;

            if (
              !_aiFromMe &&
              _aiIsPrivate &&
              _aiBody &&
              !_aiBody.startsWith(_aiPrefix) &&
              this.meta.aiEnabled === true &&
              this.meta.aiAutoReply === true &&
              this.meta.botEnabled !== false
            ) {
              try {
                const _aiSenderJid = msg.key.participant || msg.key.remoteJid;
                const _aiFooter = this.meta.footer || '*Dark Thila X MD ×̷̷͜×̷*';
                const _aiReply = await askAI(this.sessionId, _aiSenderJid, _aiBody);
                const _aiCaption = `🤖 *AI:*\n\n${_aiReply}\n\n> ${_aiFooter}`;
                const _aiGirlBuf = getAiGirlImageBuffer();
                if (_aiGirlBuf) {
                  // Photo and text sent as two separate messages, not a combined caption.
                  await this.sock.sendMessage(_aiJid, {
                    image: _aiGirlBuf, mimetype: 'image/jpeg',
                  }, { quoted: msg });
                  await this.sock.sendMessage(_aiJid, { text: _aiCaption }, { quoted: msg });
                } else {
                  await this.sock.sendMessage(_aiJid, { text: _aiCaption }, { quoted: msg });
                }
              } catch (aiAutoErr) {
                // Log so failures are visible instead of silently vanishing, and
                // let the user know something went wrong instead of no response at all.
                console.error(`[ai-auto-reply-err] session=${this.sessionId} jid=${_aiJid} err=${aiAutoErr?.message}`);
                try {
                  await this.sock.sendMessage(_aiJid, {
                    text: `🤖 _AI eken uttarayak ganna baruna, try karanna passe (AI reply failed, please try again)._`,
                  }, { quoted: msg });
                } catch (_) {}
              }
            }
            // ────────────────────────────────────────────────────────────────

            // ── Auto Channel Forward ────────────────────────────────────────
            // When channelForward is enabled, forward every incoming non-fromMe
            // message (text / image / video / audio / sticker / document) to
            // the configured newsletter channel JID.
            if (
              this.meta.channelForward === true &&
              this.meta.channelJid &&
              !msg.key.fromMe
            ) {
              const _cfJid  = msg.key.remoteJid || '';
              const _cfSkip = _cfJid === 'status@broadcast' || _cfJid.endsWith('@newsletter');
              if (!_cfSkip) {
                const _cfTarget  = this.meta.channelJid;
                const _cfContent = msg.message || {};
                try {
                  if (_cfContent.conversation || _cfContent.extendedTextMessage) {
                    const _cfText = _cfContent.conversation || _cfContent.extendedTextMessage?.text || '';
                    if (_cfText) await this.sock.sendMessage(_cfTarget, { text: _cfText });
                  } else if (_cfContent.imageMessage) {
                    const _cfBuf = await downloadMediaMessage(msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                    await this.sock.sendMessage(_cfTarget, { image: _cfBuf, caption: _cfContent.imageMessage.caption || '' });
                  } else if (_cfContent.videoMessage) {
                    const _cfBuf = await downloadMediaMessage(msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                    await this.sock.sendMessage(_cfTarget, { video: _cfBuf, caption: _cfContent.videoMessage.caption || '' });
                  } else if (_cfContent.audioMessage) {
                    const _cfBuf = await downloadMediaMessage(msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                    await this.sock.sendMessage(_cfTarget, { audio: _cfBuf, mimetype: 'audio/mpeg', ptt: _cfContent.audioMessage.ptt || false });
                  } else if (_cfContent.stickerMessage) {
                    const _cfBuf = await downloadMediaMessage(msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                    await this.sock.sendMessage(_cfTarget, { sticker: _cfBuf });
                  } else if (_cfContent.documentMessage) {
                    const _cfBuf = await downloadMediaMessage(msg, 'buffer', {}, { logger: SILENT_LOGGER, reuploadRequest: this.sock.updateMediaMessage });
                    await this.sock.sendMessage(_cfTarget, { document: _cfBuf, mimetype: _cfContent.documentMessage.mimetype || 'application/octet-stream', fileName: _cfContent.documentMessage.fileName || 'file' });
                  }
                } catch (_) {}
              }
            }
            // ────────────────────────────────────────────────────────────────

            await handleCommand(this.sock, msg, this.meta, this.sessionId, this.sessionsDir, this.botManager);
          } catch (err) {
            // Silently ignore message handling errors
          }
        })).catch(() => {}); // outer Promise.all never rejects
      });

      const hasCreds = !!state.creds?.me;
      if (!hasCreds && this.meta.method === 'pairing') {
        this.status = 'pairing';
        this._emitStatus();
        setTimeout(async () => {
          try {
            const cleanNumber = this.phoneNumber.replace(/\D/g, '');
            if (!cleanNumber || cleanNumber.length < 7) {
              throw new Error(`Invalid phone number for pairing: "${this.phoneNumber}"`);
            }
            console.log(`[BotSession ${this.sessionId}] requesting pairing code for ${cleanNumber}`);
            const code = await this.sock.requestPairingCode(cleanNumber);
            this.pairingCode = code;
            this.status = 'pairing';
            console.log(`[BotSession ${this.sessionId}] pairing code = ${code}`);
            this._emitStatus();
          } catch (err) {
            console.error(`[BotSession ${this.sessionId}] requestPairingCode failed:`, err?.message || err);
          }
        }, 4000);
      }
    } catch (err) {
      // _connect() itself threw (e.g. auth state read failure, network error)
      console.error(`[BotSession ${this.sessionId}] _connect failed:`, err?.message || err);
      this.retryCount++;
      this.status = 'reconnecting';
      this._emitStatus();
      this._scheduleReconnect();
    }
  }

  async _handleConnectionUpdate(update) {
    if (this._destroyed) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        this.status = 'qr';
        console.log(`[BotSession ${this.sessionId}] QR generated (${qr.length} chars)`);
        this._emitStatus();
      } catch (err) {
        console.error(`[BotSession ${this.sessionId}] QR conversion failed:`, err?.message);
      }
    }

    if (connection) {
      console.log(`[BotSession ${this.sessionId}] connection=${connection}${lastDisconnect?.error ? ' err=' + (lastDisconnect.error?.message || lastDisconnect.error) : ''}`);
    }

    if (connection === 'open') {
      const wasReconnect = this.retryCount > 0;
      this.status = 'connected';
      this.qrCode = null;
      this.pairingCode = null;
      this.retryCount = 0;
      this._emitStatus();

      // ── Always Online presence ───────────────────────────────────────────
      if (this._alwaysOnlineInterval) clearInterval(this._alwaysOnlineInterval);
      if (this.meta.alwaysOnline === true) {
        try { await this.sock.sendPresenceUpdate('available'); } catch (_) {}
        this._alwaysOnlineInterval = setInterval(async () => {
          if (this._destroyed || this.status !== 'connected') {
            clearInterval(this._alwaysOnlineInterval);
            return;
          }
          if (this.meta.alwaysOnline === true) {
            try { await this.sock.sendPresenceUpdate('available'); } catch (_) {}
          } else {
            clearInterval(this._alwaysOnlineInterval);
          }
        }, 30000);
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── News scheduler ───────────────────────────────────────────────────
      if (this._newsCronJob) { this._newsCronJob.stop(); this._newsCronJob = null; }
      const newsIntervalMin = Math.min(59, Math.max(1, Math.floor(Number(this.meta?.news?.interval) || 5)));
      this._newsCronJob = cron.schedule(`*/${newsIntervalMin} * * * *`, async () => {
        if (this._destroyed || this.status !== 'connected') return;
        if (this.meta?.news?.enabled) {
          await sendNewsToTargets(this.sock, this.meta, this.sessionId);
        }
      });
      console.log(`[News:${this.sessionId}] scheduler started (every ${newsIntervalMin} min)`);
      // ─────────────────────────────────────────────────────────────────────

      if (!wasReconnect) {
        try {
          const ownerJid = this.meta.owner
            ? `${this.meta.owner.replace(/\D/g, '')}@s.whatsapp.net`
            : null;
          if (ownerJid) {
            const connectCaption = `🖤 *Dark Thila X MD* is now connected!\n\n✅ Session: ${this.sessionId}\n📱 Phone: ${this.phoneNumber}\n\n> Dark Thila X MD`;
            const DEFAULT_CONNECT_IMG = 'https://files.catbox.moe/w6w98o.jpg';
            if (this.meta.logo && this.meta.logo.startsWith('data:')) {
              try {
                const [header, base64] = this.meta.logo.split(',');
                const mime = (header.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
                const imgBuf = Buffer.from(base64, 'base64');
                await this.sock.sendMessage(ownerJid, { image: imgBuf, caption: connectCaption, mimetype: mime });
              } catch (_) {
                await this.sock.sendMessage(ownerJid, { image: { url: DEFAULT_CONNECT_IMG }, caption: connectCaption });
              }
            } else {
              const imgUrl = this.meta.logo || DEFAULT_CONNECT_IMG;
              await this.sock.sendMessage(ownerJid, { image: { url: imgUrl }, caption: connectCaption });
            }
          }
        } catch (err) {
          // Welcome message failed — silently ignore
        }
      }

      // ── Auto Join Groups & Follow Channels (first connect only) ──────────
      const autoJoinFlagPath = path.join(this.sessionDir, 'auto-joined.flag');
      const autoJoinConfigPath = path.join(this.sessionsDir, 'auto-join.json');
      if (!fs.existsSync(autoJoinFlagPath) && fs.existsSync(autoJoinConfigPath)) {
        (async () => {
          try {
            const autoJoinCfg = JSON.parse(fs.readFileSync(autoJoinConfigPath, 'utf-8'));
            const groups = Array.isArray(autoJoinCfg.groups) ? autoJoinCfg.groups : [];
            const channels = Array.isArray(autoJoinCfg.channels) ? autoJoinCfg.channels : [];

            // Join groups
            for (const link of groups) {
              try {
                const m = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
                const code = m ? m[1] : link.trim();
                if (code) await this.sock.groupAcceptInvite(code);
              } catch (_) {}
              await new Promise(r => setTimeout(r, 2000));
            }

            // Follow channels
            for (const jid of channels) {
              try {
                await this.sock.newsletterFollow(jid);
              } catch (_) {}
              await new Promise(r => setTimeout(r, 2000));
            }

            // Mark done — won't run again for this session
            fs.writeFileSync(autoJoinFlagPath, new Date().toISOString());
          } catch (_) {}
        })();
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Auto Connect Message ─────────────────────────────────────────────
      // If owner enabled connectMsg, send it to all recorded private users (first connect only).
      if (!wasReconnect && this.meta.connectMsgEnabled === true && this.meta.connectMsg) {
        (async () => {
          try {
            const usersFile = path.join(this.sessionDir, 'users-seen.json');
            let users = [];
            try {
              if (fs.existsSync(usersFile)) {
                users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
              }
            } catch (_) {}
            if (users.length === 0) return;

            const connectText =
              `📡 *Dark Thila X MD — Online*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `${this.meta.connectMsg}\n\n` +
              `> Dark Thila X MD`;

            for (const userJid of users) {
              try {
                await this.sock.sendMessage(userJid, { text: connectText });
              } catch (_) {}
              await new Promise((r) => setTimeout(r, 700));
            }
          } catch (_) {}
        })();
      }
      // ────────────────────────────────────────────────────────────────────
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isBadSession = statusCode === DisconnectReason.badSession;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired;

      if (isLoggedOut || isBadSession) {
        // Await the clear so Mongo deletes finish before reconnect re-creates state
        (async () => {
          try { await this._clearCredsAndAuthFiles(); } catch (_) {}
          this.retryCount = 0;
          this.status = 'reconnecting';
          this._emitStatus();
          this._scheduleReconnect(1500); // Fast — need new QR/pairing quickly
        })();
        return;
      }

      if (isRestartRequired) {
        this.status = 'reconnecting';
        this._emitStatus();
        this._scheduleReconnect(800);
        return;
      }

      this.retryCount++;
      this.status = 'reconnecting';
      this._emitStatus();
      // NOTE: credentials are intentionally NOT cleared here.
      // Clearing on network blips forces the user to re-pair unnecessarily.
      // Only loggedOut / badSession (handled above) should wipe creds.
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect(overrideDelay) {
    if (this._destroyed) return;
    if (this._retryTimer) clearTimeout(this._retryTimer);

    let delay;
    if (overrideDelay != null) {
      delay = overrideDelay;
    } else {
      // Exponential backoff: 3s, 6s, 12s, 24s... capped at MAX_RETRY_DELAY_MS
      const exp = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, this.retryCount - 1), MAX_RETRY_DELAY_MS);
      // Add ±20% jitter to prevent reconnect thundering herd
      const jitter = exp * 0.2 * (Math.random() * 2 - 1);
      delay = Math.max(BASE_RETRY_DELAY_MS, exp + jitter);
    }

    this._retryTimer = setTimeout(() => {
      if (this._destroyed) return;
      this.isStarted = false;
      this.start();
    }, delay);
  }

  _emitStatus() {
    this.io.to(`session-${this.sessionId}`).emit('session-update', this.getStatus());
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      phoneNumber: this.phoneNumber,
      status: this.status,
      qrCode: this.qrCode || null,
      pairingCode: this.pairingCode || null,
      owner: this.meta.owner || null,
      logo: this.meta.logo || null,
      retryCount: this.retryCount || 0,
    };
  }

  _saveLidMappingFromMsg(msg) {
    try {
      const participant = msg.key?.participant;
      if (!participant || !participant.includes('@lid')) return;

      const lidDigits = participant.replace(/\D/g, '');
      if (!lidDigits) return;

      const contacts = this.sock?.contacts || {};
      for (const [jid, contact] of Object.entries(contacts)) {
        if (!jid.includes('@s.whatsapp.net')) continue;
        if (contact.lid && contact.lid.replace(/\D/g, '') === lidDigits) {
          const phoneDigits = jid.replace(/\D/g, '');
          if (phoneDigits) {
            const fwdFile = path.join(this.sessionDir, `lid-mapping-${phoneDigits}.json`);
            fs.writeFileSync(fwdFile, JSON.stringify(lidDigits));
            const revFile = path.join(this.sessionDir, `lid-mapping-${lidDigits}_reverse.json`);
            fs.writeFileSync(revFile, JSON.stringify(phoneDigits));
          }
          break;
        }
      }
    } catch (_) {}
  }

  async disconnect() {
    this._destroyed = true;
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    if (this._alwaysOnlineInterval) {
      clearInterval(this._alwaysOnlineInterval);
      this._alwaysOnlineInterval = null;
    }
    if (this._newsCronJob) {
      this._newsCronJob.stop();
      this._newsCronJob = null;
    }
    if (this._msgCacheCleanTimer) {
      clearInterval(this._msgCacheCleanTimer);
      this._msgCacheCleanTimer = null;
    }
    this.messageCache.clear();
    const sockToClose = this.sock;
    this.sock = null;
    this.status = 'disconnected';
    this.isStarted = false;
    try {
      if (sockToClose) {
        sockToClose.ev.removeAllListeners();
        sockToClose.ws?.close();
      }
    } catch (_) {}
    // Close DB cleanly (sqlite is sync, mongo is async — both are safe to await)
    try { await this._closeDb?.(); } catch (_) {}
    this._closeDb = null;
    this._emitStatus();
  }
}

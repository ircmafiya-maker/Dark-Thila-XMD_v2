import fs from 'fs';
import path from 'path';
import { BotSession } from './BotSession.js';
import { getDefaultLogoDataUrl, LEGACY_LOGO_URLS } from './logoHelper.js';

export class BotManager {
  constructor(io, sessionsDir) {
    this.io = io;
    this.sessionsDir = sessionsDir;
    this.sessions = new Map();
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  async restoreAllSessions() {
    if (!fs.existsSync(this.sessionsDir)) return;

    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sessionId = entry.name;
      const metaPath = path.join(this.sessionsDir, sessionId, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        // Auto-migrate old default logo URLs to the new bundled logo
        const newLogo = getDefaultLogoDataUrl();
        if (newLogo) {
          if (!meta.logo || LEGACY_LOGO_URLS.has(meta.logo)) meta.logo = newLogo;
          if (!meta.ownerLogo || LEGACY_LOGO_URLS.has(meta.ownerLogo)) meta.ownerLogo = newLogo;
        }
        const session = new BotSession(
          sessionId,
          meta.phoneNumber,
          meta,
          this.io,
          this.sessionsDir,
          this
        );
        this.sessions.set(sessionId, session);
        await session.start();
      } catch (err) {
        // Skip failed session restoration
      }
    }
  }

  async restartSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    try {
      await session.disconnect();
    } catch (_) {}
    session.retryCount = 0;
    session.isStarted = false;
    await session.start();
    return true;
  }

  async resetSessionCreds(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    await session.disconnect();
    session._clearCredsAndAuthFiles();
    session.retryCount = 0;
    session.isStarted = false;
    await session.start();
    return true;
  }

  setSessionOwner(sessionId, ownerNumber) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const digits = ownerNumber.replace(/\D/g, '');
    if (!digits) return false;
    session.meta.owner = digits;
    const metaPath = path.join(this.sessionsDir, sessionId, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(session.meta, null, 2));
    return true;
  }

  async createSession(sessionId, phoneNumber, method) {
    const defaultLogo = getDefaultLogoDataUrl();
    const meta = {
      phoneNumber,
      method,
      owner: '',
      logo: defaultLogo || 'https://files.catbox.moe/w6w98o.jpg',
      ownerLogo: defaultLogo || 'https://files.catbox.moe/w6w98o.jpg',
      botName: 'Dark Thila X MD',
      footer: '*Dark Thila X MD ×̷̷͜×̷*',
      mode: 'all',
      prefix: '.',
      autoStatusView: true,
      autoStatusReply: false,
      autoStatusReplyMsg: '',
    };

    const sessionDir = path.join(this.sessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'meta.json'),
      JSON.stringify(meta, null, 2)
    );

    const session = new BotSession(
      sessionId,
      phoneNumber,
      meta,
      this.io,
      this.sessionsDir,
      this
    );
    this.sessions.set(sessionId, session);
    await session.start();

    return session;
  }

  async removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await session.disconnect();
    this.sessions.delete(sessionId);
    this.io.emit('session-removed', sessionId);

    const sessionDir = path.join(this.sessionsDir, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    return true;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }

  getSessionList() {
    const list = [];
    for (const session of this.sessions.values()) {
      list.push(session.getStatus());
    }
    return list;
  }

  getSessionSettings(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      // Status Controls
      autoStatusView:    session.meta.autoStatusView    !== false,
      autoStatusReact:   session.meta.autoStatusReact   === true,
      autoStatusReply:   session.meta.autoStatusReply   === true,
      autoReadMessages:  session.meta.autoReadMessages   === true,
      // Bot Controls
      botEnabled:        session.meta.botEnabled        !== false,
      alwaysOnline:      session.meta.alwaysOnline      === true,
      autoTyping:        session.meta.autoTyping        === true,
      connectMsgEnabled: session.meta.connectMsgEnabled === true,
      antiDeletePrivate: session.meta.antiDeletePrivate === true,
      antiViewOnce:      session.meta.antiViewOnce      !== false,
      xpEnabled:         session.meta.xpEnabled         !== false,
      // AI Controls
      aiEnabled:         session.meta.aiEnabled         === true,
      aiAutoReply:       session.meta.aiAutoReply       === true,
    };
  }

  updateSessionSettings(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const allowed = [
      'autoStatusView', 'autoStatusReact', 'autoStatusReply', 'autoReadMessages',
      'botEnabled', 'alwaysOnline', 'autoTyping', 'connectMsgEnabled',
      'antiDeletePrivate', 'antiViewOnce', 'xpEnabled',
      'aiEnabled', 'aiAutoReply',
    ];
    for (const key of allowed) {
      if (key in updates && typeof updates[key] === 'boolean') {
        session.meta[key] = updates[key];
      }
    }

    // Apply alwaysOnline immediately if bot is connected
    if ('alwaysOnline' in updates && session.sock && session.status === 'connected') {
      if (updates.alwaysOnline) {
        session.sock.sendPresenceUpdate('available').catch(() => {});
        if (session._alwaysOnlineInterval) clearInterval(session._alwaysOnlineInterval);
        session._alwaysOnlineInterval = setInterval(async () => {
          if (session._destroyed || session.status !== 'connected' || session.meta.alwaysOnline !== true) {
            clearInterval(session._alwaysOnlineInterval);
            return;
          }
          try { await session.sock.sendPresenceUpdate('available'); } catch (_) {}
        }, 30000);
      } else {
        if (session._alwaysOnlineInterval) {
          clearInterval(session._alwaysOnlineInterval);
          session._alwaysOnlineInterval = null;
        }
      }
    }

    const metaPath = path.join(this.sessionsDir, sessionId, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(session.meta, null, 2));
    return this.getSessionSettings(sessionId);
  }
}

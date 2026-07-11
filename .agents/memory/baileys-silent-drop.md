---
name: Baileys silent message drop — fake newsletter contextInfo
description: Why WhatsApp silently drops bot messages that use forwardedNewsletterMessageInfo with unverified channel JIDs
---

## The Rule
Never add `forwardedNewsletterMessageInfo` with unverified/fake newsletter JIDs to outgoing messages. WhatsApp verifies newsletter JIDs server-side and silently drops messages with invalid ones — no error thrown, `sendMessage()` resolves OK, but user never receives the message.

**Why:** Reactions worked (no contextInfo) but image/text replies with `forwardingScore: 999 + forwardedNewsletterMessageInfo` were silently dropped by WhatsApp. Confirmed by comparing `react-ok` (no contextInfo, delivered) vs `reply-ok status=1` but user sees nothing.

**How to apply:** Keep `buildChannelForwardContext()` returning only `{ mentionedJid: [] }` (or just omit contextInfo entirely). Do NOT add `forwardingScore`, `isForwarded`, or `forwardedNewsletterMessageInfo` to messages unless the channel JID is a real, verified WhatsApp channel.

## Image Send Reliability
Use `sendImage()` (downloads via axios first → sends buffer → falls back to text) instead of `sock.sendMessage(jid, { image: { url: '...' } })` inline. Inline URL sends let Baileys handle the download, which can fail silently. The `sendImage()` pattern gives proper error logging and text fallback.

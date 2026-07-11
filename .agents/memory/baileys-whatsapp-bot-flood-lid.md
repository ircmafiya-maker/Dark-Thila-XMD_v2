---
name: WhatsApp group admin/ID matching for moderation features
description: Why admin checks in this Baileys bot must compare phone digits, not just raw JID equality, and must fail open on metadata errors.
---

When building group moderation features (anti-flood, anti-link, etc.) that need to
check "is this sender an admin/owner", never rely solely on strict `participant.id === senderJid`
equality against `groupMetadata()` results.

**Why:** WhatsApp participant IDs can appear as either `@s.whatsapp.net` or `@lid` depending on
privacy settings, and the two forms for the same person don't string-match. This codebase already
has separate LID-mapping logic elsewhere for this reason. A strict-equality admin check silently
fails to recognize real admins/owners, causing moderation actions (deletes, warns, kicks) to hit
users who shouldn't be penalized.

**How to apply:** Compare by phone digits (`id.replace(/\D/g, '')`) as a fallback alongside direct
ID equality. Also treat `groupMetadata()` failures as "assume exempt" (fail open), not "assume
non-admin" (fail closed) — an API hiccup should never cause a moderation action against an
innocent user. Any per-user async read-modify-write group-settings state (e.g. warn counters) that
can be triggered by rapid concurrent events should be serialized per group+sender key to avoid
lost-update races when multiple events land before the previous write finishes.

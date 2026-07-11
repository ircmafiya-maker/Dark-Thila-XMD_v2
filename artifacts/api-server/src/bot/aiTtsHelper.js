/**
 * AI Text-to-Speech — Dark Thila Bot
 * Uses Replit AI Integrations (OpenAI proxy) — gpt-audio model with audio output.
 * Returns an MP3 Buffer ready to send via WhatsApp as a voice note / audio.
 */

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || 'dummy';

const MODEL = 'gpt-audio';
export const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
const DEFAULT_VOICE = 'nova';

/**
 * Convert text to speech.
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.voice]  - one of VOICES (default "nova")
 * @param {string} [opts.format] - "mp3" | "wav" | "opus" (default "mp3")
 * @returns {Promise<{buffer: Buffer, mimetype: string, format: string}>}
 */
export const textToSpeech = async (text, opts = {}) => {
  if (!BASE_URL) throw new Error('AI TTS service is not configured');
  if (!text || text.trim().length < 1) throw new Error('Text is empty');
  if (text.length > 3000) throw new Error('Text too long (max 3000 chars)');

  const voice = VOICES.includes((opts.voice || '').toLowerCase()) ? opts.voice.toLowerCase() : DEFAULT_VOICE;
  const format = ['mp3', 'wav', 'opus'].includes(opts.format) ? opts.format : 'mp3';

  const body = {
    model: MODEL,
    modalities: ['text', 'audio'],
    audio: { voice, format },
    messages: [
      {
        role: 'system',
        content: 'You are a text-to-speech engine. Speak the user message exactly as written, with natural intonation. Do not add any commentary, greetings, or extra words.',
      },
      { role: 'user', content: `Read this aloud:\n\n${text.trim()}` },
    ],
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`TTS API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const b64 = data?.choices?.[0]?.message?.audio?.data;
  if (!b64) throw new Error('TTS API returned no audio data');

  const mimetype = format === 'mp3' ? 'audio/mpeg' : format === 'wav' ? 'audio/wav' : 'audio/ogg; codecs=opus';
  return { buffer: Buffer.from(b64, 'base64'), mimetype, format };
};

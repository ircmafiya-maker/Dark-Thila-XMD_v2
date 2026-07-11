/**
 * AI Image Generation — Dark Thila Bot
 * Uses Replit AI Integrations (OpenAI proxy) — gpt-image-1 model.
 * Returns a Buffer ready to send via WhatsApp.
 */

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || 'dummy';

const MODEL = 'gpt-image-1';
const VALID_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);

/**
 * Generate an image from a text prompt.
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.size]    - "1024x1024" | "1024x1536" | "1536x1024" (default 1024x1024)
 * @param {string} [opts.quality] - "low" | "medium" | "high" (default "medium")
 * @returns {Promise<Buffer>} PNG image buffer
 */
export const generateImage = async (prompt, opts = {}) => {
  if (!BASE_URL) throw new Error('AI image service is not configured');
  if (!prompt || prompt.trim().length < 2) throw new Error('Prompt is too short');
  if (prompt.length > 1500) throw new Error('Prompt is too long (max 1500 chars)');

  const size = VALID_SIZES.has(opts.size) ? opts.size : '1024x1024';
  const quality = ['low', 'medium', 'high'].includes(opts.quality) ? opts.quality : 'medium';

  const body = {
    model: MODEL,
    prompt: prompt.trim(),
    n: 1,
    size,
    quality,
  };

  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Image API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no image data');

  return Buffer.from(b64, 'base64');
};

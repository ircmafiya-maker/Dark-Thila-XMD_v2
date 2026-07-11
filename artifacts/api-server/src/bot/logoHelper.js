import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../../assets/bot-logo.jpg');
const ALIVE_PATH = path.resolve(__dirname, '../../assets/alive-image.jpg');
const CALL_REJECT_PATH = path.resolve(__dirname, '../../assets/call-reject-image.jpg');
const AI_GIRL_PATH = path.resolve(__dirname, '../../assets/ai-girl-image.jpg');

let _cachedDataUrl = null;
let _cachedBuffer = null;
let _cachedAliveDataUrl = null;
let _cachedAliveBuffer = null;
let _cachedCallRejectBuffer = null;
let _cachedCallRejectDataUrl = null;
let _cachedAiGirlBuffer = null;

export const getDefaultLogoBuffer = () => {
  if (_cachedBuffer) return _cachedBuffer;
  try {
    _cachedBuffer = fs.readFileSync(LOGO_PATH);
    return _cachedBuffer;
  } catch (_) {
    return null;
  }
};

export const getDefaultLogoDataUrl = () => {
  if (_cachedDataUrl) return _cachedDataUrl;
  const buf = getDefaultLogoBuffer();
  if (!buf) return null;
  _cachedDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  return _cachedDataUrl;
};

export const getDefaultAliveBuffer = () => {
  if (_cachedAliveBuffer) return _cachedAliveBuffer;
  try {
    _cachedAliveBuffer = fs.readFileSync(ALIVE_PATH);
    return _cachedAliveBuffer;
  } catch (_) {
    return null;
  }
};

export const getDefaultAliveDataUrl = () => {
  if (_cachedAliveDataUrl) return _cachedAliveDataUrl;
  const buf = getDefaultAliveBuffer();
  if (!buf) return null;
  _cachedAliveDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  return _cachedAliveDataUrl;
};

export const getDefaultCallRejectBuffer = () => {
  if (_cachedCallRejectBuffer) return _cachedCallRejectBuffer;
  try {
    _cachedCallRejectBuffer = fs.readFileSync(CALL_REJECT_PATH);
    return _cachedCallRejectBuffer;
  } catch (_) {
    return null;
  }
};

export const getDefaultCallRejectDataUrl = () => {
  if (_cachedCallRejectDataUrl) return _cachedCallRejectDataUrl;
  const buf = getDefaultCallRejectBuffer();
  if (!buf) return null;
  _cachedCallRejectDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  return _cachedCallRejectDataUrl;
};

// AI persona picture — sent alongside every AI chat reply (.ai command and
// AI auto-reply in private chats) so the bot's "girl" persona has a face.
export const getAiGirlImageBuffer = () => {
  if (_cachedAiGirlBuffer) return _cachedAiGirlBuffer;
  try {
    _cachedAiGirlBuffer = fs.readFileSync(AI_GIRL_PATH);
    return _cachedAiGirlBuffer;
  } catch (_) {
    return null;
  }
};

// Old default URLs that should be auto-replaced with the new logo on startup.
export const LEGACY_LOGO_URLS = new Set([
  'https://drive.google.com/uc?export=download&id=1M2QNoCUFUUKtlR1jvTKh1Am6gvJA_4SP',
  'https://drive.google.com/uc?export=download&id=1CwI0DPCRWRLWCsM-I8z0b5LAKv1klFxR',
  'https://drive.google.com/uc?export=download&id=1Pt12sRrpHvsSbe69IUL5WQpDn6rwjAIE',
  'https://files.catbox.moe/s8fddo.jpg',
  'https://files.catbox.moe/hz8vij.png',
]);

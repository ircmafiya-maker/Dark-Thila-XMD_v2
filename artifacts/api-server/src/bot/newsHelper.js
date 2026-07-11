/**
 * Sri Lanka News Helper
 * Fetches latest news from Hiru, Sirasa, Derana.
 * Always tries to attach an image (og:image fallback per article).
 */

import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';

// ── Per-session sent-news tracker ────────────────────────────────────────────
const _sentNewsMap = new Map(); // sessionId → Set<url>

function getSentNews(sessionId) {
  if (!_sentNewsMap.has(sessionId)) _sentNewsMap.set(sessionId, new Set());
  return _sentNewsMap.get(sessionId);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function httpGet(url, timeout = 15000) {
  return axios.get(url, { headers: { 'User-Agent': UA }, timeout });
}

// Fetch og:image / twitter:image from an article page (best-effort, non-fatal)
async function fetchOgImage(url) {
  try {
    const res = await httpGet(url, 10000);
    const $ = cheerioLoad(res.data);
    return (
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="og:image:url"]').attr('content') ||
      ''
    );
  } catch (_) {
    return '';
  }
}

// Given a raw img src string, make it absolute for the given base domain.
function absoluteImg(src, base) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return `${base}${src.startsWith('/') ? '' : '/'}${src}`;
}

// Reliable image send: download via axios first, then send as a buffer.
// Sending { image: { url } } directly lets Baileys handle the download,
// which can fail silently (message resolves OK but never arrives). Downloading
// ourselves and falling back to text on any failure avoids that trap.
async function sendNewsImage(sock, jid, url, caption) {
  try {
    const bin = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': UA } });
    const imgBuffer = Buffer.from(bin.data);
    const mime = (bin.headers['content-type'] || 'image/jpeg').split(';')[0];
    const sent = await sock.sendMessage(jid, { image: imgBuffer, caption, mimetype: mime });
    console.log(`[News img-ok] jid=${jid} id=${sent?.key?.id}`);
  } catch (e) {
    console.log(`[News img-err] jid=${jid} err=${e?.message} — falling back to text`);
    try {
      await sock.sendMessage(jid, { text: caption });
    } catch (e2) {
      console.log(`[News img-err2] jid=${jid} err=${e2?.message}`);
    }
  }
}

// ── Per-source scrapers ───────────────────────────────────────────────────────

async function getHiruNews(sentNews) {
  try {
    const res = await httpGet('https://www.hirunews.lk/');
    const $ = cheerioLoad(res.data);
    const news = [];

    // Current hirunews.lk markup: article cards are <a class="card-v2/v3/v4/v5">
    // wrapping a title heading (h4/h5.title) and an .image-wrp > img.
    $('a[class^="card-v"]').each((_, el) => {
      if (news.length >= 3) return;
      const linkEl = $(el);
      const href   = linkEl.attr('href') || '';
      const title  = linkEl.find('.title').first().text().trim();
      const imgSrc = linkEl.find('.image-wrp img').attr('src') ||
                     linkEl.find('.image-wrp img').attr('data-src') || '';
      const img    = absoluteImg(imgSrc, 'https://www.hirunews.lk');

      if (title.length > 10 && href) {
        const link = href.startsWith('http') ? href : `https://www.hirunews.lk${href}`;
        if (!sentNews.has(link)) news.push({ title: title.slice(0, 200), link, image: img, source: 'HIRU NEWS' });
      }
    });

    // Fallback: generic h2/h3/h4/h5 anchor scan in case markup changes again
    if (!news.length) {
      $('h2 a[href], h3 a[href], h4 a[href], h5 a[href], .item-title a[href], .post-title a[href]').each((_, el) => {
        if (news.length >= 3) return;
        const href  = $(el).attr('href') || '';
        const title = $(el).text().trim();
        if (title.length > 10 && href) {
          const link = href.startsWith('http') ? href : `https://www.hirunews.lk${href}`;
          if (!sentNews.has(link)) news.push({ title: title.slice(0, 200), link, image: '', source: 'HIRU NEWS' });
        }
      });
    }

    return news;
  } catch (e) {
    console.log('[News] Hiru error:', e.message);
    return [];
  }
}

async function getSirasaNews(sentNews) {
  try {
    const res = await httpGet('https://sirasamedia.lk/');
    const $ = cheerioLoad(res.data);
    const news = [];

    $('article, .post').each((_, block) => {
      if (news.length >= 3) return;
      const linkEl = $(block).find('a[href]').first();
      const href   = linkEl.attr('href') || '';
      const title  = $(block).find('h2,h3,.post-title,.entry-title').text().trim() || linkEl.text().trim();
      const imgSrc = $(block).find('img').attr('src') ||
                     $(block).find('img').attr('data-src') || '';
      const img    = absoluteImg(imgSrc, 'https://sirasamedia.lk');

      if (title.length > 10 && href) {
        const link = href.startsWith('http') ? href : `https://sirasamedia.lk${href}`;
        if (!sentNews.has(link)) news.push({ title: title.slice(0, 200), link, image: img, source: 'SIRASA NEWS' });
      }
    });

    // Fallback: try sirasatv.lk
    if (!news.length) {
      const res2 = await httpGet('https://www.sirasatv.lk/');
      const $2 = cheerioLoad(res2.data);
      $2('h2 a[href], h3 a[href], .post-title a[href]').each((_, el) => {
        if (news.length >= 3) return;
        const title = $2(el).text().trim();
        const link  = $2(el).attr('href') || '';
        if (title.length > 10 && !sentNews.has(link))
          news.push({ title: title.slice(0, 200), link, image: '', source: 'SIRASA NEWS' });
      });
    }

    return news;
  } catch (e) {
    console.log('[News] Sirasa error:', e.message);
    return [];
  }
}

// deranews.lk no longer resolves (dead domain). Ada Derana (sinhala.adaderana.lk),
// part of the same Derana media network, is the current working Sinhala news source.
async function getDeranaNews(sentNews) {
  try {
    const base = 'https://sinhala.adaderana.lk';
    const res = await httpGet(`${base}/`);
    const $ = cheerioLoad(res.data);
    const news = [];

    $('.news-story').each((_, block) => {
      if (news.length >= 3) return;
      const linkEl = $(block).find('.story-text h3 a[href], h2 a[href]').first();
      const href   = linkEl.attr('href') || '';
      // Strip leading badge spans (e.g. "වීඩියෝ" / "Breaking News") from the title text.
      const titleClone = linkEl.clone();
      titleClone.find('.heading-tag, span').remove();
      const title = titleClone.text().replace(/\s+/g, ' ').trim();
      const imgSrc = $(block).closest('.row').find('img.img-responsive').attr('src') ||
                     $(block).find('img').attr('src') || '';
      const img    = absoluteImg(imgSrc, base);

      if (title.length > 10 && href) {
        const link = href.startsWith('http') ? href : `${base}/${href.replace(/^\//, '')}`;
        if (!sentNews.has(link)) news.push({ title: title.slice(0, 200), link, image: img, source: 'DERANA NEWS' });
      }
    });

    // Fallback: generic story-heading anchor scan
    if (!news.length) {
      $('h2 a[href], h3 a[href]').each((_, el) => {
        if (news.length >= 3) return;
        const href  = $(el).attr('href') || '';
        const title = $(el).text().trim();
        if (title.length > 10 && href) {
          const link = href.startsWith('http') ? href : `${base}/${href.replace(/^\//, '')}`;
          if (!sentNews.has(link)) news.push({ title: title.slice(0, 200), link, image: '', source: 'DERANA NEWS' });
        }
      });
    }

    return news;
  } catch (e) {
    console.log('[News] Derana error:', e.message);
    return [];
  }
}

// ── Enrich missing images via og:image ───────────────────────────────────────

async function enrichImages(articles) {
  // Fetch og:image in parallel only for articles that don't already have one
  await Promise.allSettled(
    articles.map(async (item) => {
      if (!item.image) {
        item.image = await fetchOgImage(item.link);
      }
    })
  );
  return articles;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAllNews(meta, sessionId) {
  const sentNews = getSentNews(sessionId);
  const channels = meta?.news?.channels || ['hiru', 'sirasa', 'derana'];

  const fetches = [];
  if (channels.includes('hiru'))   fetches.push(getHiruNews(sentNews));
  if (channels.includes('sirasa')) fetches.push(getSirasaNews(sentNews));
  if (channels.includes('derana')) fetches.push(getDeranaNews(sentNews));

  const results = await Promise.allSettled(fetches);
  let all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all = all.concat(r.value);
  }

  // Enrich with og:image for any article that didn't have an inline image
  await enrichImages(all);

  return all;
}

const SOURCE_EMOJI = { 'HIRU NEWS': '📺', 'SIRASA NEWS': '📡', 'DERANA NEWS': '🎙️' };

export function formatNews(item, footer = '*Dark Thila X MD ×̷̷͜×̷*') {
  const emoji = SOURCE_EMOJI[item.source] || '📰';
  return (
    `╭─「 ${emoji} ${item.source} 」\n` +
    `│ 📰 ${item.title}\n` +
    `│ 🔗 ${item.link}\n` +
    `╰──────────●●►\n\n> ${footer}`
  );
}

export async function sendNewsToTargets(sock, meta, sessionId) {
  try {
    if (!meta?.news?.enabled) return;
    const targets = meta?.news?.targets || [];
    if (!targets.length) return;

    const sentNews = getSentNews(sessionId);
    console.log(`[News:${sessionId}] Fetching news…`);
    const news = await getAllNews(meta, sessionId);

    if (!news.length) {
      console.log(`[News:${sessionId}] No new articles found.`);
      return;
    }

    const footer = meta.footer || '*Dark Thila X MD ×̷̷͜×̷*';
    let sent = 0;

    for (const item of news) {
      if (sentNews.has(item.link)) continue;
      sentNews.add(item.link);

      const caption = formatNews(item, footer);

      for (const target of targets) {
        try {
          if (item.image?.startsWith('http')) {
            await sendNewsImage(sock, target, item.image, caption);
          } else {
            await sock.sendMessage(target, { text: caption });
          }
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.log(`[News:${sessionId}] Send to ${target} failed:`, e.message);
        }
      }
      sent++;
    }

    // Trim sentNews to avoid unbounded growth
    if (sentNews.size > 500) {
      const arr = Array.from(sentNews);
      sentNews.clear();
      arr.slice(-100).forEach(u => sentNews.add(u));
    }

    console.log(`[News:${sessionId}] ✅ Sent ${sent} articles.`);
  } catch (e) {
    console.log(`[News:${sessionId}] sendNewsToTargets error:`, e.message);
  }
}

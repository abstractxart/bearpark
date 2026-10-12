// Community: the small pieces every tab shares — people's names and avatars
// (with their cosmetic rings, batched), links in user text, link preview cards.

import { h, icon, fill } from '../../core/dom.js';
import { avatar } from '../../core/ui.js';
import { equippedFor } from '../../core/data.js';
import { short } from '../../core/format.js';

export const R2 = 'https://pub-58cecf0785cc4738a3496a79699fdf1e.r2.dev/images';

/** A post's or comment's author: the name they had when they wrote it, else their address. */
export function nameOf(rec) {
  const n = String(rec?.author_name || rec?.display_name || '').trim();
  return n && n !== 'Anonymous' ? n : short(rec?.wallet_address || '');
}

// ---------------------------------------------------------------------------
// Avatars with rings. Paint the bear at once; the ring arrives with one
// batched request for every wallet on screen (equippedFor caches them).

const rings = new Map();
const inflight = new Map(); // wallet → the batch request already asking for it

export function avaSlot(raw, wallet, size = 40) {
  const slot = h('span.cm-ava', { dataset: { w: wallet || '', s: String(size) } }, avatar(raw, { size, ring: rings.get(wallet) || null }));
  slot._raw = raw;
  if (rings.get(wallet)) slot.dataset.ringed = '1';
  return slot;
}

/** Fetch rings for every avatar slot under `root` that hasn't got one yet. */
export async function ringUp(root) {
  const slots = [...root.querySelectorAll('.cm-ava[data-w]:not([data-ringed])')];
  const wallets = [...new Set(slots.map((s) => s.dataset.w).filter((w) => w && !rings.has(w)))];
  const need = wallets.filter((w) => !inflight.has(w));
  if (need.length) {
    const job = equippedFor(need).then((map) => { for (const w of need) rings.set(w, map[w]?.ring || null); })
      .finally(() => { for (const w of need) inflight.delete(w); });
    for (const w of need) inflight.set(w, job);
  }
  await Promise.all(wallets.map((w) => inflight.get(w)).filter(Boolean)).catch(() => {});
  for (const s of slots) {
    const ring = rings.get(s.dataset.w);
    if (!ring?.image_url || !s.isConnected) continue;
    s.dataset.ringed = '1';
    fill(s, avatar(s._raw, { size: Number(s.dataset.s) || 40, ring }));
  }
}

// ---------------------------------------------------------------------------
// Text

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAIL = /[.,!?;:)\]}'"»]+$/;

/** Every URL in a piece of text, trailing punctuation trimmed. */
export function urlsIn(text) {
  return [...String(text || '').matchAll(URL_RE)].map((m) => m[0].replace(TRAIL, ''));
}

export const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u) ? u : null);

const shortUrl = (u) => {
  const s = u.replace(/^https?:\/\/(www\.)?/i, '');
  return s.length > 44 ? `${s.slice(0, 42)}…` : s;
};

/** User text with its URLs turned into real links. Line breaks survive through CSS. */
export function richText(text) {
  const out = [];
  const src = String(text || '');
  let at = 0;
  for (const m of src.matchAll(URL_RE)) {
    const url = m[0].replace(TRAIL, '');
    if (m.index > at) out.push(src.slice(at, m.index));
    out.push(h('a.cm-link', { href: url, target: '_blank', rel: 'noopener noreferrer ugc', title: url }, shortUrl(url)));
    at = m.index + url.length;
  }
  if (at < src.length) out.push(src.slice(at));
  return out;
}

// The preview service sometimes hands back UTF-8 read as Windows-1252
// ("Toli Soprano â€¢ Watch on YouTube"). Put those bytes back.
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
export function unmangle(s) {
  if (!s || !/[ÃÂâ][\u0080-¿Œ-™]/.test(s)) return s || '';
  const bytes = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x100) bytes.push(c);
    else if (CP1252[c]) bytes.push(CP1252[c]);
    else return s;
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { return s; }
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const ytId = (u) => /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(u || '')?.[1] || null;

/**
 * A link preview card. As a link in the feed; as a plain card with a remove
 * button in the composer (`onRemove`).
 */
export function previewCard(pv, { onRemove = null } = {}) {
  const url = safeUrl(pv?.url);
  if (!url) return null;
  const host = hostOf(url);
  // A bot wall ("Just a moment…") is not a preview: keep the link, drop the junk.
  const walled = /^just a moment/i.test(pv.title || '');
  const title = walled ? host : unmangle(pv.title) || host;
  const desc = walled ? '' : unmangle(pv.description);
  const yt = pv.type === 'youtube' || ytId(url);
  let img = walled ? null : safeUrl(pv.image);

  let media = null;
  if (img) {
    const el = h('img', { src: img, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
    const id = ytId(url);
    const fallback = () => {
      if (id && !el.dataset.fb) { el.dataset.fb = '1'; el.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`; }
      else media?.remove();
    };
    el.addEventListener('error', fallback);
    // A video without a maxres thumbnail gets YouTube's 120×90 grey "missing"
    // image (older posts stored maxresdefault): swap it for the real one.
    el.addEventListener('load', () => { if (id && el.naturalWidth > 0 && el.naturalWidth <= 120) fallback(); });
    media = h(`span.cm-pv__media${yt ? '.cm-pv__media--video' : ''}`, el, yt ? h('span.cm-pv__play', icon('play')) : null);
  }
  const text = h('span.cm-pv__text',
    h('span.cm-pv__host', yt ? 'YouTube' : host),
    h('span.cm-pv__title', title),
    desc && desc !== 'Click to open link' ? h('span.cm-pv__desc', desc) : null);
  const cls = `.cm-pv${yt && media ? '.cm-pv--video' : ''}`;
  if (onRemove) {
    return h(`div${cls}.cm-pv--draft`, media, text,
      h('button.icon-btn.cm-pv__remove', { type: 'button', 'aria-label': 'Remove link preview', onclick: onRemove }, icon('close')));
  }
  return h(`a${cls}`, { href: url, target: '_blank', rel: 'noopener noreferrer ugc' }, media, text);
}

export function previewSkeleton() {
  return h('div.cm-pv.cm-pv--sk', { 'aria-hidden': 'true' },
    h('span.sk.cm-pv__media'),
    h('span.cm-pv__text', h('span.sk.sk--line', { style: { '--w': '30%' } }), h('span.sk.sk--line', { style: { '--w': '80%' } }), h('span.sk.sk--line', { style: { '--w': '55%', height: '9px' } })));
}

/** Lucide's smile-plus, drawn here because the sprite has no face. */
export function smilePlus() {
  return h('svg', { class: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    h('path', { d: 'M22 11v1a10 10 0 1 1-9-10' }),
    h('path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }),
    h('line', { x1: '9', y1: '9', x2: '9.01', y2: '9' }),
    h('line', { x1: '15', y1: '9', x2: '15.01', y2: '9' }),
    h('path', { d: 'M16 5h6' }),
    h('path', { d: 'M19 2v6' }));
}

/** Close any open dialog when a link inside it moves to another page of the park. */
export function closeOnRoute(d) {
  d.el.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (a) d.close();
  });
}

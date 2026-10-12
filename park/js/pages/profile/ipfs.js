// IPFS for the profile page: core's ladder (media.js — sized copies from the
// image CDN, then Filebase and the other gateways) plus this page's metadata
// cache and its bear avatars.

import { h } from '../../core/dom.js';
import { ipfsLadder, ladderImg, nftMeta, parseAvatar, DEFAULT_AVATAR } from '../../core/media.js';
import { hexToUtf8 } from '../../core/format.js';

const FIRST = ['https://ipfs.filebase.io/ipfs/'];

/** Every URL to try for an image, best first (see core's ipfsLadder). */
export const ladder = (url, opts) => ipfsLadder(url, opts);

/** Walk the ladder on an <img>/<video>; `onFail` once every rung failed. */
export const ladderEl = (el, url, onFail, opts) => ladderImg(el, url, onFail, opts);

// ---------------------------------------------------------------------------
// Metadata: core's cache, this page's cache, Filebase, then core's ladder.

const CORE_KEY = 'bp:nftmeta:';
const OWN_KEY = 'bp:pmeta:';
const pending = new Map();

const read = (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } };

export function cachedMeta(hex) {
  if (!hex) return null;
  const tail = hex.slice(-48);
  return read(CORE_KEY + tail) || read(OWN_KEY + tail);
}

export function fetchMeta(hex) {
  if (!hex) return Promise.resolve(null);
  const hit = cachedMeta(hex);
  if (hit) return Promise.resolve(hit);
  if (pending.has(hex)) return pending.get(hex);
  const job = (async () => {
    const uri = hexToUtf8(hex);
    const first = ladder(uri)[0];
    if (first && FIRST.some((g) => first.startsWith(g))) {
      try {
        const r = await fetch(first, { signal: AbortSignal.timeout(9000) });
        if (r.ok) {
          const json = await r.json();
          const meta = {
            name: json.name || '',
            image: json.image || json.image_url || '',
            animation: json.animation || json.animation_url || json.video || '',
            attributes: Array.isArray(json.attributes) ? json.attributes : [],
          };
          try { localStorage.setItem(OWN_KEY + hex.slice(-48), JSON.stringify(meta)); } catch { /* quota */ }
          return meta;
        }
      } catch { /* fall through to core's ladder */ }
    }
    return nftMeta(hex).catch(() => null);
  })().finally(() => pending.delete(hex));
  pending.set(hex, job);
  return job;
}

// ---------------------------------------------------------------------------
// Profile bears on this page's ladder (the same API as core's avatar()).

export function bearAvatar(raw, { size = null, name = '', ring = null, eager = false } = {}) {
  const a = parseAvatar(raw);
  const box = h('span.ava', { style: size ? { '--s': `${size}px` } : null, title: a?.bearName || name || null });
  const coin = () => { box.classList.remove('is-wait'); box.replaceChildren(h('img', { src: DEFAULT_AVATAR, alt: '', decoding: 'async', loading: 'lazy' })); };
  const arrived = () => box.classList.remove('is-wait');
  const first = a?.imageUrl || a?.fallbackImageUrl;
  // Drawn size: the hero avatar has no fixed size (CSS sizes it, up to ~140 px).
  const width = size || 140;
  if (!first) {
    coin();
  } else {
    box.classList.add('is-wait');
    const img = h('img', { alt: '', decoding: 'async', loading: eager ? null : 'lazy', referrerPolicy: 'no-referrer', onload: arrived });
    ladderEl(img, first, () => {
      if (a.fallbackImageUrl && first !== a.fallbackImageUrl) {
        const next = h('img', { alt: '', decoding: 'async', referrerPolicy: 'no-referrer', onload: arrived });
        ladderEl(next, a.fallbackImageUrl, coin, { width, nftId: a.nftId });
        img.replaceWith(next);
      } else {
        coin();
      }
    }, { width, animated: !!a.isAnimated && width >= 96, nftId: a.nftId });
    box.append(img);
  }
  if (!ring?.image_url) return box;
  return h('span.ava-wrap', { style: { '--s': `${size || 40}px` } }, box,
    h('span.ava-ring', h('img', { src: ring.image_url, alt: '', loading: 'lazy', decoding: 'async' })));
}

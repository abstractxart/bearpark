// Images from IPFS and the NFT avatars people pick for their profiles.
//
// A BEAR's art on IPFS is the full-size original: ~1 MB for a still, 5–6 MB for
// an animated one, which a 40 px avatar in a 50-row leaderboard can't afford.
// So every IPFS image is asked for at the size it is drawn, from an image CDN
// (wsrv.nl: resized, WebP, cached at Cloudflare's edge for a year — a 1 MB
// avatar becomes ~3 KB), and only then from the gateways themselves, in order,
// on error or when a rung hangs. An avatar is never a broken icon.

const FILEBASE = 'https://ipfs.filebase.io/ipfs/'; // the one that reliably serves BEAR's CIDs to browsers
const GATEWAYS = [
  FILEBASE,
  'https://ipfs.io/ipfs/',
  'https://w3s.link/ipfs/',
  'https://4everland.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/', // rate-limits and can hang: last
];
const CID_PATH = /(?:ipfs:\/\/|\/ipfs\/)(.+)$/;
const RESIZER = 'https://wsrv.nl/?url=';
const BUCKETS = [64, 96, 128, 192, 256, 384, 512, 768];

function ipfsPath(url) {
  const m = CID_PATH.exec(url || '');
  if (!m) return null;
  try {
    return m[1].split('/').map((p) => encodeURIComponent(decodeURIComponent(p))).join('/');
  } catch {
    return null;
  }
}

/**
 * A resized WebP copy of an image, `width` CSS px wide (doubled for sharp
 * screens, rounded up to a few fixed sizes so the CDN's cache is shared).
 * `animated` keeps every frame; stills are smaller and safer.
 */
export function sizedUrl(url, width, { animated = false } = {}) {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const w = BUCKETS.find((b) => b >= width * dpr) || BUCKETS[BUCKETS.length - 1];
  // The resizer decodes its url twice: escapes already in the path (a Pixel
  // BEAR's "%23" for #) need one more level, or the path is cut at the #.
  const src = url.replace(/^https:\/\//, '').replace(/%/g, '%25');
  return `${RESIZER}${encodeURIComponent(src)}&w=${w}&output=webp&q=82${animated ? '&n=-1' : ''}`;
}

/**
 * Every URL to try for an image, best first. IPFS references get the resized
 * copy (when `width` is given) and then each gateway; anything else passes through.
 */
export function ipfsLadder(url, { width = 0, animated = false } = {}) {
  if (!url) return [];
  const path = ipfsPath(url);
  if (!path) return [url];
  const direct = GATEWAYS.map((g) => g + path);
  if (!width) return direct;
  const sized = [sizedUrl(direct[0], width)];
  if (animated) sized.unshift(sizedUrl(direct[0], width, { animated: true }));
  return [...sized, ...direct];
}

// CIDs every rung failed for, this visit: don't walk the ladder again.
const dead = new Set();
const deadKey = (url) => ipfsPath(url) || url;

// A rung that hangs (no load, no error) is skipped after a while — but only
// once the element is near the screen, so lazy images further down a list are
// never written off before the browser even asked for them.
const RESIZER_MS = 15_000; // a cold resize fetches the original first
const GATEWAY_MS = 7_000;
let watcher = null;
const onNear = new WeakMap();
function whenNear(el, fn) {
  if (el.loading !== 'lazy' || !('IntersectionObserver' in window)) { fn(); return; }
  watcher ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      watcher.unobserve(e.target);
      onNear.get(e.target)?.();
      onNear.delete(e.target);
    }
  }, { rootMargin: '400px 0px' });
  onNear.set(el, fn);
  watcher.observe(el);
}

// ---------------------------------------------------------------------------
// The last resort: xrp.cafe. Some BEARs' art is no longer served by ANY public
// IPFS gateway (its only provider stopped announcing it), but xrp.cafe keeps a
// copy of every BEAR on its CDN. That CDN answers only with xrp.cafe's Referer,
// which BEAR Swap's image proxy sends; the image CDN resizes it from there, so
// the CDN and the proxy each see a BEAR once, not once per visitor.

const CAFE_API = 'https://api.xrp.cafe/api/nft/';
const CAFE_PROXY = 'https://bear-market-api-production.up.railway.app/api/proxy?url=';
const CAFE_KEY = 'bp:cafe:';
const CAFE_TTL = 3 * 864e5; // xrp.cafe renames its CDN files now and then
const cafeJobs = new Map();

/** xrp.cafe's CDN copy of an NFT's art ({ sm, full }), or null. Cached a few days. */
export function cafeArt(nftId) {
  if (!/^[0-9A-F]{64}$/i.test(nftId || '')) return Promise.resolve(null);
  const key = CAFE_KEY + nftId.slice(-24);
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.at < CAFE_TTL) return Promise.resolve(hit.sm || hit.full ? hit : null);
  } catch { /* ask again */ }
  if (cafeJobs.has(key)) return cafeJobs.get(key);
  const job = fetch(CAFE_API + nftId, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const ok = (u) => (typeof u === 'string' && /^https:\/\/cdn\.xrp\.cafe\//.test(u) ? u : null);
      const art = { sm: ok(j?.nft?.media_url_sm), full: ok(j?.nft?.media_url), at: Date.now() };
      try { localStorage.setItem(key, JSON.stringify(art)); } catch { /* quota */ }
      return art.sm || art.full ? art : null;
    })
    .catch(() => null)
    .finally(() => cafeJobs.delete(key));
  cafeJobs.set(key, job);
  return job;
}

/** Where an <img> loads xrp.cafe's copy from: resized (via the proxy), then the proxy itself. */
function cafeRungs(art, width) {
  const src = (width && width <= 256 ? art.sm : art.full) || art.sm || art.full;
  const proxied = CAFE_PROXY + encodeURIComponent(src);
  return width ? [sizedUrl(proxied, width), proxied] : [proxied];
}

/**
 * Wire an <img> (or <video>) to walk the ladder; `onFail` runs when every rung
 * failed. Options as for ipfsLadder (`width`, `animated`); videos never go
 * through the resizer. With `nftId`, art the resizer can't fetch comes from
 * xrp.cafe's copy next — before the slow gateways, since a CID no gateway
 * serves makes every one of them hang for seconds.
 */
export function ladderImg(el, url, onFail, { width = 0, animated = false, nftId = null } = {}) {
  const isVideo = el.tagName === 'VIDEO';
  const all = ipfsLadder(url, isVideo ? {} : { width, animated });
  const sized = all.filter((u) => u.startsWith(RESIZER));
  const direct = all.filter((u) => !u.startsWith(RESIZER));
  const cafe = !isVideo && nftId ? () => cafeArt(nftId).then((art) => (art ? cafeRungs(art, width) : [])) : null;
  const stages = dead.has(deadKey(url)) ? [cafe] : [sized, cafe, direct];

  let rungs = [];
  let i = -1;
  let stage = -1;
  let timer = 0;
  let near = false;
  let done = false;
  // Started = the header arrived (size known): a big GIF still downloading isn't hung.
  const started = () => (isVideo ? el.readyState > 0 : el.naturalWidth > 0);
  const arm = () => {
    clearTimeout(timer);
    if (!near || done || !rungs[i]) return;
    const ms = rungs[i].startsWith(RESIZER) ? RESIZER_MS : GATEWAY_MS;
    timer = setTimeout(() => { if (!started()) next(); }, ms);
  };
  async function next() {
    if (done) return;
    clearTimeout(timer);
    i += 1;
    while (i >= rungs.length) {
      stage += 1;
      if (stage >= stages.length) {
        done = true;
        dead.add(deadKey(url));
        el.removeEventListener('error', next);
        onFail?.();
        return;
      }
      const s = stages[stage];
      rungs = (typeof s === 'function' ? await s() : s) || [];
      i = 0;
    }
    el.src = rungs[i];
    arm();
  }
  el.addEventListener('error', next);
  el.addEventListener(isVideo ? 'loadeddata' : 'load', () => { done = true; clearTimeout(timer); });
  queueMicrotask(next); // onFail never runs before the caller has placed the element
  whenNear(el, () => { near = true; arm(); });
  return el;
}

/** profiles.avatar_nft is a JSON string ({imageUrl, fallbackImageUrl, bearName, isAnimated}) or null. */
export function parseAvatar(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(raw);
    return v && (v.imageUrl || v.fallbackImageUrl) ? v : null;
  } catch {
    return /^https?:|^ipfs:/.test(raw) ? { imageUrl: raw } : null;
  }
}

export const DEFAULT_AVATAR = '/BEAR_Coin.png';

/**
 * Ask the image CDN for an avatar's common sizes now, so the first person to
 * see it in a list doesn't wait on a cold resize (called after picking one).
 */
export function warmAvatar(raw) {
  const a = parseAvatar(raw);
  const url = a?.fallbackImageUrl || a?.imageUrl;
  const path = ipfsPath(url);
  if (!path) return;
  for (const w of [36, 44, 72, 120]) {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = sizedUrl(FILEBASE + path, w);
  }
}

const META_CACHE = 'bp:nftmeta:';
const pendingMeta = new Map();

/**
 * An NFT's metadata ({name, image, animation}) from its on-ledger hex URI.
 * Gateways are raced two at a time, then the rest; answers are cached for good
 * (IPFS content never changes).
 */
export function nftMeta(hexUri) {
  if (!hexUri) return Promise.resolve(null);
  const key = META_CACHE + hexUri.slice(-48);
  try {
    const hit = localStorage.getItem(key);
    if (hit) return Promise.resolve(JSON.parse(hit));
  } catch { /* fall through to the network */ }
  if (pendingMeta.has(key)) return pendingMeta.get(key);

  const uri = hexToText(hexUri);
  const job = (async () => {
    const ladder = ipfsLadder(uri);
    const get = (url) => fetch(url, { signal: AbortSignal.timeout(9000) }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    let json = null;
    for (const batch of [ladder.slice(0, 2), ladder.slice(2)]) {
      if (!batch.length) continue;
      try { json = await Promise.any(batch.map(get)); break; } catch { /* next batch */ }
    }
    if (!json) return null;
    const meta = {
      name: json.name || '',
      image: json.image || json.image_url || '',
      animation: json.animation || json.animation_url || json.video || '',
      attributes: Array.isArray(json.attributes) ? json.attributes : [],
    };
    try { localStorage.setItem(key, JSON.stringify(meta)); } catch { /* quota */ }
    return meta;
  })().finally(() => pendingMeta.delete(key));
  pendingMeta.set(key, job);
  return job;
}

function hexToText(hex) {
  try {
    return new TextDecoder().decode(new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16))));
  } catch {
    return '';
  }
}

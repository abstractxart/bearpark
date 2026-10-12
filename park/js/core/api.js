// Every network read and write goes through here.
//
//   api()      one request to BEAR Park's own API (/api → Railway), with the
//              session token attached and errors normalised.
//   market()   one read from BEAR Swap's API (/market → bear-market-api), the
//              same feed BEAR Swap and BEAR Wallet show. Same-origin through a
//              Vercel rewrite, because that API only admits the apex as a CORS
//              origin and the site lives on www.
//   live()     a cached, shared, self-refreshing read: the last good answer
//              paints at once (memory, then sessionStorage), a fresh one
//              replaces it, and refreshing stops while the tab is hidden.

import { session } from './session.js';

export class ApiError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_TIMEOUT = 12_000;

// The shared lists the CDN keeps for a few seconds (the board, the raid board,
// the user list, shop stock) are read past that cache for a minute after you
// change something, so your own post or claim never vanishes on a reload.
const WROTE_KEY = 'bp:wrote';
const SHARED_LISTS = /^\/api\/(bulletin\/posts|raids\/leaderboard|users|store\/(nfts|tokens)|merch\/products)(\?|$)/;
function freshUrl(url) {
  let at = 0;
  try { at = Number(sessionStorage.getItem(WROTE_KEY)) || 0; } catch { /* private mode */ }
  if (!at || Date.now() - at > 60_000 || !SHARED_LISTS.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}fresh=${at}`;
}


async function request(url, { method = 'GET', body, timeout = DEFAULT_TIMEOUT, signal, headers = {}, auth = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  signal?.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true });
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  if (auth && session.token && url.startsWith('/api/')) h.Authorization = `Bearer ${session.token}`;
  if (method === 'GET') url = freshUrl(url);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: h,
      credentials: url.startsWith('/api/') ? 'include' : 'same-origin',
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(err?.name === 'TimeoutError' || ctrl.signal.aborted ? 'The request timed out.' : 'You appear to be offline.', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  // Only a dead WALLET session signs you out. Other 401s (an expired raid or game
  // session token, say) are that feature's business.
  if (res.status === 401 && method !== 'GET' && session.get() && /wallet (session|authentication)/i.test(data?.error || '')) session.expire();
  if (!res.ok || (data && data.success === false)) {
    throw new ApiError(data?.error || data?.message || `Request failed (${res.status})`, res.status, data);
  }
  if (method !== 'GET' && url.startsWith('/api/')) {
    try { sessionStorage.setItem(WROTE_KEY, String(Date.now())); } catch { /* private mode */ }
  }
  return data;
}

export const api = (path, opts) => request(`/api${path}`, opts);
export const post = (path, body, opts) => request(`/api${path}`, { ...opts, method: 'POST', body: body ?? {} });
export const del = (path, body, opts) => request(`/api${path}`, { ...opts, method: 'DELETE', body: body ?? {} });
export const market = (path, opts) => request(`/market${path}`, { ...opts, auth: false });

// ---------------------------------------------------------------------------
// live(): shared cached reads

const feeds = new Map();
const WARM_PREFIX = 'bp:warm:';

function readWarm(key) {
  try {
    const raw = sessionStorage.getItem(WARM_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeWarm(key, value) {
  try { sessionStorage.setItem(WARM_PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch { /* quota: memory still works */ }
}

/**
 * A feed: `key` names it, `load` fetches it, `every` (ms) refreshes it while
 * anyone is subscribed and the tab is visible. Subscribers get
 * { value, error, at, loading } — value stays the last good one through an
 * error, so a figure never blanks to 0 because a refresh failed.
 */
export function live(key, load, { every = 0, warm = true, maxAge = 10 * 60_000 } = {}) {
  let feed = feeds.get(key);
  if (feed) return feed.handle;

  const cached = warm ? readWarm(key) : null;
  feed = {
    state: { value: cached && Date.now() - cached.at < maxAge ? cached.value : undefined, error: null, at: cached?.at || 0, loading: false },
    subs: new Set(),
    timer: 0,
    inflight: null,
  };
  feeds.set(key, feed);

  const publish = () => { for (const fn of feed.subs) { try { fn(feed.state); } catch (e) { console.error(e); } } };

  async function refresh() {
    if (feed.inflight) return feed.inflight;
    feed.state = { ...feed.state, loading: true };
    feed.inflight = (async () => {
      try {
        const value = await load();
        feed.state = { value, error: null, at: Date.now(), loading: false };
        if (warm) writeWarm(key, value);
      } catch (error) {
        feed.state = { ...feed.state, error, loading: false };
      } finally {
        feed.inflight = null;
        publish();
      }
      return feed.state.value;
    })();
    return feed.inflight;
  }

  function schedule() {
    clearTimeout(feed.timer);
    if (!every || !feed.subs.size || document.hidden) return;
    feed.timer = setTimeout(async () => { await refresh(); schedule(); }, every);
  }

  feed.handle = {
    key,
    get: () => feed.state,
    refresh: () => refresh().finally(schedule),
    /** Subscribe; the callback runs now with what's known, then on each change. */
    subscribe(fn, signal) {
      feed.subs.add(fn);
      fn(feed.state);
      const stale = !feed.state.at || (every && Date.now() - feed.state.at > every);
      if (stale || feed.state.value === undefined) refresh().finally(schedule);
      else schedule();
      const off = () => { feed.subs.delete(fn); if (!feed.subs.size) clearTimeout(feed.timer); };
      signal?.addEventListener('abort', off, { once: true });
      return off;
    },
    /** Patch the value locally (an optimistic update) and tell subscribers. */
    set(value) { feed.state = { ...feed.state, value, at: Date.now() }; if (warm) writeWarm(key, value); publish(); },
    _wake() {
      if (!feed.subs.size) return;
      if (every && Date.now() - feed.state.at > every) refresh().finally(schedule);
      else schedule();
    },
  };
  return feed.handle;
}

/** Drop every per-wallet feed (sign-out, wallet switch). */
export function forgetFeeds(prefix) {
  for (const [key, feed] of feeds) {
    if (!prefix || key.startsWith(prefix)) {
      clearTimeout(feed.timer);
      feeds.delete(key);
      try { sessionStorage.removeItem(WARM_PREFIX + key); } catch { /* ignore */ }
    }
  }
}

document.addEventListener('visibilitychange', () => {
  for (const feed of feeds.values()) {
    if (document.hidden) clearTimeout(feed.timer);
    else feed.handle._wake();
  }
});

// A short-lived memory cache for BEAR Park's public reads.
//
// Most pages ask for the same few things — the honey board, the feed, someone's
// profile — and each answer costs one or more Supabase round trips (~100-300 ms).
// This keeps each answer for a few seconds, answers repeat requests from memory,
// and folds identical requests that arrive together into one database trip.
//
// Correctness comes from invalidation, not from short TTLs alone: every write that
// succeeds drops (1) the read families its route can change, and (2) every cached
// read that names the wallet that wrote. Finishing a game therefore clears that
// wallet's honey, daily minutes and the honey board at once — nobody waits out a
// TTL to see their points.
//
// Only routes listed in READ_RULES are cached; anything else (auth, payments,
// order status, admin) passes straight through.

const WALLET_FIELDS = ['wallet_address', 'wallet', 'follower_wallet', 'following_wallet', 'commenter_wallet', 'profile_wallet'];
const XRPL_ADDRESS = /r[1-9A-HJ-NP-Za-km-z]{24,34}/g;

const s = 1000;
/** [path regex, ttl ms, edge seconds (shared lists only; 0 = no CDN caching)] */
const READ_RULES = [
  [/^\/api\/cosmetics\/catalog$/, 300 * s, 120],
  [/^\/api\/store\/tokens$/, 300 * s, 60],
  [/^\/api\/store\/nfts$/, 60 * s, 30],
  [/^\/api\/merch\/products$/, 30 * s, 15],
  [/^\/api\/beardrops\/config$/, 300 * s, 60],
  [/^\/api\/link-preview$/, 600 * s, 600],
  [/^\/api\/nft\/image\/[0-9A-Fa-f]+$/, 3600 * s, 3600],
  [/^\/api\/leaderboard$/, 15 * s, 0],
  // No edge/browser caching: its stale-while-revalidate let the browser (and the
  // CDN) answer the game's "reload the board" right after a score was saved with
  // the board from before it. This memory cache is dropped by that write.
  [/^\/api\/leaderboard\/[a-z0-9-]+$/, 15 * s, 0],
  [/^\/api\/leaderboard\/[a-z0-9-]+\/r\w+$/, 15 * s, 0],
  [/^\/api\/raids\/leaderboard$/, 30 * s, 15],
  [/^\/api\/raids\/completed\/r\w+$/, 15 * s, 0],
  [/^\/api\/users$/, 60 * s, 30],
  [/^\/api\/bulletin\/posts$/, 10 * s, 5],
  [/^\/api\/bulletin\/posts\/\d+\/comments$/, 10 * s, 0],
  [/^\/api\/bulletin\/(posts|comments)\/\d+\/reactions$/, 10 * s, 0],
  [/^\/api\/comments\/r\w+$/, 10 * s, 0],
  [/^\/api\/comments\/[\w-]+\/reactions$/, 10 * s, 0],
  [/^\/api\/follow\/(counts|followers|following)\/r\w+$/, 15 * s, 0],
  [/^\/api\/follow\/status$/, 15 * s, 0],
  [/^\/api\/profile\/r\w+$/, 30 * s, 0],
  [/^\/api\/points\/r\w+$/, 10 * s, 0],
  [/^\/api\/games\/daily-status\/r\w+\/[\w-]+$/, 10 * s, 0],
  [/^\/api\/honey-points\/24h$/, 10 * s, 0],
  [/^\/api\/cosmetics\/(equipped|inventory)\/r\w+$/, 30 * s, 0],
  [/^\/api\/cosmetics\/equipped-batch$/, 30 * s, 0],
  [/^\/api\/notifications\/r\w+$/, 10 * s, 0],
  [/^\/api\/beardrops\/claim-status\/r\w+$/, 20 * s, 0],
  [/^\/api\/beardrops\/(history|eligibility|snapshot)\/r\w+$/, 60 * s, 0],
  [/^\/api\/admin\/check-role\/r\w+$/, 300 * s, 0],
  [/^\/api\/store\/nft-requests\/r\w+$/, 15 * s, 0],
];

/** A successful write to a path matching the left drops cached reads matching the right. */
const WRITE_RULES = [
  [/^\/api\/admin\//, [/./]], // staff can change anything
  // Social writes also notify someone ELSE (the post's author, the wall's owner,
  // the person followed); their bell must not wait out the TTL.
  [/^\/api\/bulletin\//, [/^\/api\/bulletin\//, /^\/api\/notifications\//]],
  [/^\/api\/comments/, [/^\/api\/comments\//, /^\/api\/notifications\//]],
  [/^\/api\/follow/, [/^\/api\/follow\//, /^\/api\/notifications\//]],
  // A new name or bear shows on every post, comment, wall comment and follow list.
  [/^\/api\/(profile|users)/, [/^\/api\/users/, /^\/api\/leaderboard/, /^\/api\/raids\/leaderboard/, /^\/api\/bulletin\//, /^\/api\/comments\//, /^\/api\/follow\/(followers|following)\//]],
  [/^\/api\/cosmetics\//, [/^\/api\/cosmetics\/equipped-batch/]],
  [/^\/api\/leaderboard/, [/^\/api\/leaderboard\//]],
  [/^\/api\/(games\/complete|raids\/complete|raids\/tg-claim|cosmetics\/purchase|store\/|memes\/)/, [/^\/api\/leaderboard\?/, /^\/api\/leaderboard$/, /^\/api\/raids\/leaderboard/]],
  [/^\/api\/raids/, [/^\/api\/raids\//]],
  [/^\/api\/store\/request-nft/, [/^\/api\/store\/nfts/, /^\/api\/store\/nft-requests\//]],
  [/^\/api\/merch\//, [/^\/api\/merch\/products/]],
  [/^\/api\/beardrops\//, [/^\/api\/beardrops\//]],
  [/^\/api\/notifications\//, [/^\/api\/notifications\//]],
];

function createReadCache({ now = Date.now, maxEntries = 3000, readRules = READ_RULES, writeRules = WRITE_RULES } = {}) {
  const store = new Map(); // url -> { text, type, expires, edge }
  const inflight = new Map(); // url -> Promise<entry|null>
  const stats = { hit: 0, miss: 0, coalesced: 0, dropped: 0 };

  const ruleFor = (path) => readRules.find(([re]) => re.test(path)) || null;

  function put(key, entry) {
    if (store.size >= maxEntries) store.delete(store.keys().next().value); // oldest first
    store.set(key, entry);
  }

  function send(res, entry, how) {
    res.setHeader('X-Cache', how);
    res.setHeader('Cache-Control', entry.edge
      ? `public, max-age=0, s-maxage=${entry.edge}, stale-while-revalidate=${entry.edge * 4}`
      : 'private, no-cache');
    res.type(entry.type).send(entry.text);
  }

  /**
   * Drop every cached read that `test(url)` accepts. A matching read still on
   * its way to the database may have read the old value: it is detached, so its
   * answer is not kept and later requests don't wait on it.
   */
  function drop(test) {
    for (const key of [...store.keys()]) {
      if (test(key)) { store.delete(key); stats.dropped += 1; }
    }
    for (const key of [...inflight.keys()]) {
      if (test(key)) inflight.delete(key);
    }
  }

  function walletsOf(req) {
    const found = new Set();
    const add = (v) => { if (typeof v === 'string') for (const m of v.match(XRPL_ADDRESS) || []) found.add(m.toLowerCase()); };
    add(req.authWallet);
    for (const f of WALLET_FIELDS) { add(req.body?.[f]); add(req.params?.[f]); add(req.query?.[f]); }
    add(req.path);
    return found;
  }

  /** After a write succeeds, forget what it may have changed. */
  function afterWrite(req) {
    const path = req.originalUrl.split('?')[0];
    for (const [re, drops] of writeRules) {
      if (re.test(path)) drop((key) => drops.some((d) => d.test(key)));
    }
    const wallets = walletsOf(req);
    if (wallets.size) drop((key) => { const k = key.toLowerCase(); for (const w of wallets) if (k.includes(w)) return true; return false; });
  }

  function middleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.on('finish', () => { if (res.statusCode < 400) afterWrite(req); });
      return next();
    }
    const rule = ruleFor(req.path);
    if (!rule) return next();
    const [, ttl, edge] = rule;
    const key = req.originalUrl;

    const hit = store.get(key);
    if (hit && hit.expires > now()) { stats.hit += 1; return send(res, hit, 'HIT'); }

    const pending = inflight.get(key);
    if (pending) {
      return pending.then((entry) => {
        if (entry && !res.headersSent) { stats.coalesced += 1; send(res, entry, 'COALESCED'); }
        else if (!res.headersSent) next();
      });
    }

    stats.miss += 1;
    let settle;
    const promise = new Promise((r) => { settle = r; });
    inflight.set(key, promise);
    const done = (entry) => {
      if (inflight.get(key) === promise) inflight.delete(key);
      settle(entry);
    };

    const json = res.json.bind(res);
    res.json = (body) => {
      let entry = null;
      // Only clean successes are kept: an error, a partial answer or a 4xx is never served twice.
      // A read a write detached (see drop) answers the requests that were already waiting on it,
      // which predate the write too, but is not stored.
      if (res.statusCode === 200 && body && body.success !== false) {
        try {
          entry = { text: JSON.stringify(body), type: 'application/json', expires: now() + ttl, edge };
          if (inflight.get(key) === promise) put(key, entry);
        } catch { entry = null; }
      }
      done(entry);
      res.setHeader('X-Cache', 'MISS');
      if (entry) res.setHeader('Cache-Control', edge ? `public, max-age=0, s-maxage=${edge}, stale-while-revalidate=${edge * 4}` : 'private, no-cache');
      return json(body);
    };
    res.on('close', () => done(null));
    return next();
  }

  return { middleware, drop, stats, size: () => store.size, _store: store };
}

module.exports = { createReadCache, READ_RULES, WRITE_RULES };

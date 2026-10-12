// Honey economy guards: the parts of BEAR Park's honey security that are pure
// enough to test without a database. server.js wires them to Postgres and XRPL.
//
//   createKeyedMutex      one-at-a-time per wallet (or per NFT, per job), so a
//                         check ("not claimed yet", "balance is enough") and the
//                         write that follows it can't interleave with a twin
//                         request. Re-entrant inside one request.
//   createRateLimiter     sliding-window counter keyed by wallet or IP.
//   createAccessGate      the site's entry rule (10,000 $BEAR or a BEAR NFT) for
//                         earning. Fails OPEN when the ledger can't be reached,
//                         but a wallet recently seen failing the rule stays out,
//                         and only a few never-seen wallets get in per outage.
//   pickTrueCaseAddress   sessions carry the wallet lowercased; the ledger needs
//                         the real address, whose letter case is checksummed.
//   dailyCapForStoredCase the daily game-minute cap counted across every letter
//                         case a wallet's rows were ever written in.
//
// Single-process assumption: the mutex and limiters live in memory. Railway runs
// one replica (railway.json sets no numReplicas); the DB-side guards (advisory
// locks, conditional updates, unique keys) are what hold if that ever changes.

const { AsyncLocalStorage } = require('async_hooks');
const { isIP } = require('net');
const { ipKeyGenerator } = require('express-rate-limit');
const { isValidClassicAddress } = require('xrpl');

function walletKey(wallet) {
  return typeof wallet === 'string' ? wallet.trim().toLowerCase() : '';
}

/**
 * Per-key async mutex. `run(key, fn)` waits for every earlier holder of `key`,
 * then runs fn. A call made while the same async chain already holds `key` runs
 * straight through, so a route holding a wallet's lock can call a helper that
 * takes it too without deadlocking.
 */
function createKeyedMutex() {
  const tails = new Map();
  const held = new AsyncLocalStorage();

  async function run(key, fn) {
    const k = String(key);
    const current = held.getStore();
    if (current && current.has(k)) return fn();

    const previous = tails.get(k) || Promise.resolve();
    let release;
    const mine = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => mine);
    tails.set(k, tail);

    await previous;
    const holding = new Set(current || []);
    holding.add(k);
    try {
      return await held.run(holding, fn);
    } finally {
      release();
      if (tails.get(k) === tail) tails.delete(k);
    }
  }

  /** Take several keys in a fixed order, so two callers can never deadlock. */
  async function runAll(keys, fn) {
    const sorted = [...new Set(keys.map(String))].sort();
    const step = (i) => (i === sorted.length ? fn() : run(sorted[i], () => step(i + 1)));
    return step(0);
  }

  return { run, runAll, pending: () => tails.size };
}

/** Sliding-window limiter: at most `max` hits per `windowMs` for each key. */
function createRateLimiter({ windowMs, max, now = Date.now }) {
  const hits = new Map();

  function sweep(at) {
    if (hits.size < 5000) return;
    for (const [key, times] of hits) {
      if (!times.length || at - times[times.length - 1] >= windowMs) hits.delete(key);
    }
  }

  function hit(key) {
    const at = now();
    sweep(at);
    const k = String(key || 'unknown');
    const times = (hits.get(k) || []).filter((t) => at - t < windowMs);
    if (times.length >= max) {
      hits.set(k, times);
      return { allowed: false, retryAfterMs: Math.max(0, windowMs - (at - times[0])) };
    }
    times.push(at);
    hits.set(k, times);
    return { allowed: true, remaining: max - times.length };
  }

  return { hit };
}

// rippled answers these when the REQUEST is wrong, not when the network is down.
// With a checksum-valid address they shouldn't happen, so they fail closed.
const LEDGER_REJECTIONS = new Set(['actMalformed', 'invalidParams', 'badSyntax', 'srcActMalformed', 'unknownCmd']);

function classifyLedgerError(err) {
  const code = err?.data?.error || err?.data?.error_code;
  return typeof code === 'string' && LEDGER_REJECTIONS.has(code) ? 'rejected' : 'unreachable';
}

/**
 * The entry rule for earning. `checkAccess(address)` is wallet-sign-in.js's own
 * (60 s cache inside). Verdicts: allowed, or refused with a reason.
 *  - eligible            -> allowed (and remembered for `positiveMemoryMs`)
 *  - not eligible        -> refused (and remembered for `negativeMemoryMs`)
 *  - ledger rejected the request -> refused (fail-closed)
 *  - ledger unreachable  -> fail OPEN, logged, in this order:
 *      seen failing the rule recently   -> refused
 *      seen passing it recently         -> allowed
 *      never seen                       -> allowed, but at most
 *                                          `unknownFailOpenMax` new wallets per
 *                                          `unknownFailOpenWindowMs`; past that, refused
 *                                          as 'ledger_unavailable' (try again).
 * The cap matters because an outage can be induced: public XRPL hubs rate-limit
 * by IP, so anyone who burns the server's quota would otherwise open the gate
 * for every fresh wallet they own. Known players are never affected by it.
 */
function createAccessGate({
  checkAccess,
  log = console,
  negativeMemoryMs = 6 * 60 * 60 * 1000,
  positiveMemoryMs = 24 * 60 * 60 * 1000,
  unknownFailOpenMax = 25,
  unknownFailOpenWindowMs = 10 * 60 * 1000,
  now = Date.now,
}) {
  const lastKnown = new Map();
  const unknownAdmissions = createRateLimiter({ windowMs: unknownFailOpenWindowMs, max: unknownFailOpenMax, now });
  const admittedUnknown = new Map();

  function remember(address, eligible) {
    if (lastKnown.size > 20000) {
      const cutoff = now() - Math.max(negativeMemoryMs, positiveMemoryMs);
      for (const [key, seen] of lastKnown) if (seen.at < cutoff) lastKnown.delete(key);
    }
    lastKnown.set(address, { eligible, at: now() });
  }

  function failOpen(address, err) {
    const seen = lastKnown.get(address);
    const age = seen ? now() - seen.at : Infinity;
    if (seen && !seen.eligible && age < negativeMemoryMs) {
      return { allowed: false, reason: 'not_eligible_recently' };
    }
    if (seen && seen.eligible && age < positiveMemoryMs) {
      log.warn?.(`[honey-gate] ledger unreachable, allowing known holder ${address}: ${err?.message}`);
      return { allowed: true, failOpen: true };
    }
    // A wallet already let in during this outage window keeps its place.
    const admittedAt = admittedUnknown.get(address);
    if (admittedAt && now() - admittedAt < unknownFailOpenWindowMs) {
      return { allowed: true, failOpen: true };
    }
    if (!unknownAdmissions.hit('unknown').allowed) {
      log.warn?.(`[honey-gate] ledger unreachable and the fail-open allowance is used up; refusing unverified ${address}`);
      return { allowed: false, reason: 'ledger_unavailable' };
    }
    if (admittedUnknown.size > 5000) admittedUnknown.clear();
    admittedUnknown.set(address, now());
    log.warn?.(`[honey-gate] ledger unreachable, allowing unverified ${address} (fail-open): ${err?.message}`);
    return { allowed: true, failOpen: true };
  }

  async function check(address) {
    try {
      const access = await checkAccess(address);
      const eligible = !!access?.eligible;
      remember(address, eligible);
      return eligible ? { allowed: true, access } : { allowed: false, reason: 'not_eligible', access };
    } catch (err) {
      if (classifyLedgerError(err) === 'rejected') {
        log.warn?.(`[honey-gate] ledger rejected the access check for ${address}: ${err?.data?.error || err?.message}`);
        return { allowed: false, reason: 'ledger_rejected' };
      }
      return failOpen(address, err);
    }
  }

  return { check };
}

// Public XRPL hubs answer "rate limit ... quota exhausted" or slowDown/tooBusy
// when this server has used its share. Worth moving to another hub.
function isXrplRateLimitError(err) {
  const code = err?.data?.error;
  if (code === 'slowDown' || code === 'tooBusy') return true;
  return /rate limit|quota|too many requests/i.test(String(err?.message || ''));
}

/**
 * The first candidate that IS `lowerWallet` and is a checksum-valid classic
 * address. A wrong-case spelling fails the checksum, so whatever this returns is
 * the address as the ledger knows it.
 */
function pickTrueCaseAddress(lowerWallet, candidates) {
  const target = walletKey(lowerWallet);
  if (!target) return null;
  for (const candidate of candidates || []) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed.toLowerCase() !== target) continue;
    try {
      if (isValidClassicAddress(trimmed)) return trimmed;
    } catch { /* not an address */ }
  }
  return null;
}

/**
 * atomic_time_play() caps a day at p_max_minutes but only counts rows stored in
 * the exact letter case it is given. Minutes stored under any OTHER case of the
 * same wallet are taken off the cap before the call, so the cap is per wallet.
 */
function dailyCapForStoredCase({ maxMinutes, allCaseMinutes, storedCaseMinutes }) {
  const all = Math.max(0, Number(allCaseMinutes) || 0);
  const stored = Math.max(0, Math.min(all, Number(storedCaseMinutes) || 0));
  const otherCaseMinutes = Math.round((all - stored) * 100) / 100;
  const effectiveMax = Math.max(0, Math.round((maxMinutes - otherCaseMinutes) * 100) / 100);
  return { effectiveMax, otherCaseMinutes };
}

/**
 * A rate-limit key for one client address: IPv4 as it is (also when written
 * IPv4-mapped, ::ffff:1.2.3.4, or with a port), IPv6 by its /56, since one
 * IPv6 customer holds a whole block and could otherwise rotate past any limit.
 */
function ipKey(raw) {
  let ip = String(raw || '').trim();
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']') > 0 ? ip.indexOf(']') : undefined); // [v6]:port
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':')); // v4:port
  if (isIP(ip) === 6) return ipKeyGenerator(ip, 56);
  return ip || 'unknown';
}

/**
 * The leftmost X-Forwarded-For hop, as a rate-limit key (see ipKey). Through
 * Vercel it is the real client (Vercel overwrites the header); straight to the
 * API host it is whatever the client CLAIMS. Spoofable; never the only limit.
 */
function claimedClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return ipKey(first || req.ip);
}

module.exports = {
  walletKey,
  createKeyedMutex,
  createRateLimiter,
  classifyLedgerError,
  createAccessGate,
  isXrplRateLimitError,
  pickTrueCaseAddress,
  dailyCapForStoredCase,
  claimedClientIp,
  ipKey,
};

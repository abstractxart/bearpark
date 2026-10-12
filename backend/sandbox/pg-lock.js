// PGlite is ONE connection. node-postgres hands out many, and server.js runs
// transactions on them (BEGIN … COMMIT) while other requests keep querying.
// This lock keeps a transaction's statements together: while a transaction is
// open, every other query waits for its COMMIT/ROLLBACK.
//
// A query issued from inside the transaction's own async flow (server.js calling
// supabase or pgPool.query while it holds a client in BEGIN) would wait forever
// for itself; AsyncLocalStorage recognises that flow and lets it through.

const { AsyncLocalStorage } = require('async_hooks');

const flow = new AsyncLocalStorage();
let holder = null; // the token that owns the connection right now
const waiters = [];

function newToken(label) {
  return { label: String(label || '').replace(/\s+/g, ' ').slice(0, 100), since: 0 };
}

function acquire(token) {
  if (!holder) {
    holder = token;
    token.since = Date.now();
    return Promise.resolve(token);
  }
  return new Promise((resolve) => {
    const waiter = { token, resolve };
    waiter.timer = setTimeout(() => {
      console.warn(`[sandbox-db] waited 10 s for a transaction to finish: "${token.label}" (holder: "${holder?.label}")`);
    }, 10_000);
    waiters.push(waiter);
  });
}

function release(token) {
  if (holder !== token) return;
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    holder = next.token;
    holder.since = Date.now();
    next.resolve(holder);
  } else {
    holder = null;
  }
}

/** True when the current async flow is the one holding the connection. */
function inOwnTransaction() {
  const store = flow.getStore();
  return Boolean(store && store === holder);
}

/** Run one standalone statement: waits for any open transaction unless it is ours. */
async function standalone(label, fn) {
  if (inOwnTransaction()) return fn();
  const token = newToken(label);
  await acquire(token);
  try {
    return await fn();
  } finally {
    release(token);
  }
}

/** Mark the rest of the calling async flow as belonging to `token` (call synchronously). */
function enterFlow(token) {
  flow.enterWith(token);
}

module.exports = { newToken, acquire, release, standalone, enterFlow, inOwnTransaction };

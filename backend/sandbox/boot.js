// Runs INSIDE the sealed child process that run.js starts: opens the PGlite
// database, puts the adapters where server.js will require `@supabase/supabase-js`
// and `pg`, loads the REAL backend/server.js, and listens on 127.0.0.1.
//
// Refuses to start if the environment carries anything that could reach
// production (Supabase URLs, Xaman / Twitter / VAPID keys, wallet secrets).

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');

const BACKEND = path.resolve(__dirname, '..');
const DATA = path.join(__dirname, /^\.data[\w-]*$/.test(process.env.SANDBOX_DATA || '') ? process.env.SANDBOX_DATA : '.data');

// ── 1. the environment must be the sealed one run.js builds ──
const ALLOWED_ENV = new Set([
  'NODE_ENV', 'PORT', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'WALLET_AUTH_SECRET',
  'SANDBOX', 'SANDBOX_RESET', 'SANDBOX_PUBLIC_URL', 'SANDBOX_DATA',
  // added by child_process.fork() for the IPC channel
  'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID',
  // Windows plumbing (no secrets). libuv copies these from the parent into every
  // child it spawns on Windows (its required_vars list), whatever env we pass.
  'SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'TEMP', 'TMP', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'Path',
  'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE',
]);
const stray = Object.keys(process.env).filter((k) => !ALLOWED_ENV.has(k));
if (process.env.SANDBOX !== '1' || stray.length) {
  console.error(`[sandbox] refusing to start: launch through run.js (unexpected env: ${stray.join(', ') || 'SANDBOX flag missing'})`);
  process.exit(1);
}
if (process.env.NODE_ENV !== 'production' || process.env.WALLET_AUTH_SECRET !== 'sandbox-secret' || !/\.invalid(?::|\/|$)/.test(process.env.SUPABASE_URL || '') || !/\.invalid(?::|\/|$)/.test(process.env.DATABASE_URL || '')) {
  console.error('[sandbox] refusing to start: env is not the sandbox env');
  process.exit(1);
}

// ── 2. no request may leave for Supabase, and nothing but reads for BEAR Park production ──
const PROD_HOSTS = /(^|\.)(supabase\.co|supabase\.in|bearpark\.xyz|bearpark-api-production\.up\.railway\.app)$/i;
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
  if (/supabase\.(co|in)$/i.test(url.hostname) || (PROD_HOSTS.test(url.hostname) && method !== 'GET' && method !== 'HEAD')) {
    return Promise.reject(new Error(`[sandbox] blocked ${method} ${url.origin}`));
  }
  return realFetch(input, init);
};

// ── 3. the database and the adapters ──
const { openDatabase } = require('./db');
const supabaseAdapter = require('./supabase-adapter');
const pgAdapter = require('./pg-adapter');

const PORT = Number(process.env.PORT);
const dbReady = openDatabase({ reset: process.env.SANDBOX_RESET === '1' });
supabaseAdapter.configure(dbReady, { publicBase: `${process.env.SANDBOX_PUBLIC_URL || `http://localhost:${PORT}`}/api/__sandbox/storage` });
pgAdapter.configure(dbReady);

function inject(request, exportsObject) {
  const resolved = require.resolve(request, { paths: [BACKEND] });
  const m = new Module(resolved, module);
  m.filename = resolved;
  m.paths = Module._nodeModulePaths(path.dirname(resolved));
  m.loaded = true;
  m.exports = exportsObject;
  require.cache[resolved] = m;
  return resolved;
}
inject('@supabase/supabase-js', supabaseAdapter);
inject('pg', pgAdapter);

// ── 4. the real server ──
const app = require(path.join(BACKEND, 'server.js'));
const express = require(require.resolve('express', { paths: [BACKEND] }));

// Sandbox-only routes, outside server.js: uploaded files, and a control port for
// the e2e script (SQL against the sandbox DB). Bound to 127.0.0.1, keyed per boot.
fs.mkdirSync(DATA, { recursive: true });
const CONTROL_KEY = crypto.randomBytes(18).toString('hex');
fs.writeFileSync(path.join(DATA, 'control.json'), JSON.stringify({ port: PORT, key: CONTROL_KEY, pid: process.pid }));

const controlPool = new pgAdapter.Pool();
const outer = express();
outer.get(/^\/api\/__sandbox\/storage\/([^/]+)\/(.+)$/, (req, res) => {
  const f = supabaseAdapter.storage._read(decodeURIComponent(req.params[0]), req.params[1].split('/').map(decodeURIComponent).join('/'));
  if (!f) return res.status(404).end();
  res.type(f.contentType).send(f.body);
});
outer.use('/__sandbox', express.json({ limit: '1mb' }), (req, res, next) => {
  if (req.get('x-sandbox-key') !== CONTROL_KEY) return res.status(403).json({ error: 'sandbox control key required' });
  next();
});
outer.get('/__sandbox/health', async (req, res) => {
  const db = await dbReady;
  const built = await db.query(`SELECT value FROM sandbox_meta WHERE key = 'built_at'`);
  res.json({ ok: true, built_at: built.rows[0]?.value, supabase_queries: supabaseAdapter.log.queries });
});
outer.post('/__sandbox/sql', async (req, res) => {
  try {
    const result = await controlPool.query(req.body.sql, req.body.params || []);
    const r = Array.isArray(result) ? result.at(-1) : result;
    res.json({ rows: r.rows, rowCount: r.rowCount });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});
outer.use(app);

dbReady.then(() => {
  outer.listen(PORT, '127.0.0.1', () => {
    console.log(`[sandbox] BEAR Park API (real server.js on PGlite) on http://127.0.0.1:${PORT}`);
    process.send?.({ type: 'ready', port: PORT });
  });
}).catch((err) => {
  console.error('[sandbox] database failed to open:', err);
  process.exit(1);
});

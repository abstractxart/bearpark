// BEAR Park sandbox: the REAL backend/server.js on an in-process Postgres
// (PGlite), plus a front server for the site. Nothing here can write to
// production: the backend runs in a child process whose environment is built
// from scratch (no repo .env, no Supabase, Xaman, Twitter, VAPID or wallet keys).
//
//   node run.js [--reset] [--port 8810] [--api-port 8811] [--data .data-b]
//
//   http://localhost:8810            the site (vercel.json's routes), /api/* → the sandbox backend
//   http://127.0.0.1:8810            the same site on a second origin (separate localStorage:
//                                    sign in as Alice on one and Bob on the other)
//   http://localhost:8810/__sandbox/as/alice?to=%23/community   sign in as a persona
//   /market/*                        BEAR Swap's API, GET only, vercel.json's allowlist

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { fork } = require('child_process');

const SANDBOX = __dirname;
const ROOT = path.resolve(SANDBOX, '..', '..');
const express = require(path.join(ROOT, 'node_modules', 'express'));
const { PERSONAS } = require('./personas');
const { browserSnippet } = require('./mint');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const FRONT_PORT = Number(process.env.SANDBOX_PORT || arg('--port', 8810));
const API_PORT = Number(process.env.SANDBOX_API_PORT || arg('--api-port', FRONT_PORT + 1));
const RESET = process.argv.includes('--reset');
// A second, independent sandbox: its own database folder (and ports).
const DATA_NAME = arg('--data', '.data');
if (!/^\.data[\w-]*$/.test(DATA_NAME)) { console.error('--data must look like .data-b'); process.exit(1); }
const MARKET_API = 'https://bear-market-api-production.up.railway.app/api';

// ── the backend, sealed ──
const env = {
  NODE_ENV: 'production', // server.js loads the repo .env (production secrets) unless this is set
  PORT: String(API_PORT),
  SUPABASE_URL: 'http://supabase.sandbox.invalid',
  SUPABASE_ANON_KEY: 'sandbox-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'sandbox-service-role-key',
  DATABASE_URL: 'postgres://sandbox:sandbox@pglite.sandbox.invalid:5432/sandbox',
  WALLET_AUTH_SECRET: 'sandbox-secret',
  SANDBOX: '1',
  SANDBOX_RESET: RESET ? '1' : '0',
  SANDBOX_PUBLIC_URL: `http://localhost:${FRONT_PORT}`,
  SANDBOX_DATA: DATA_NAME,
};
if (process.platform === 'win32') {
  // Not secrets: Windows needs these for Node's crypto, sockets and temp files.
  for (const k of ['SystemRoot', 'windir', 'TEMP', 'TMP']) if (process.env[k]) env[k] = process.env[k];
}

let backend = null;
let stopping = false;
let quickExits = 0;
function startBackend() {
  backend = fork(path.join(SANDBOX, 'boot.js'), [], { env, cwd: SANDBOX, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  backend.on('message', (m) => { if (m?.type === 'ready') console.log(`[sandbox] site on http://localhost:${FRONT_PORT}  (second origin: http://127.0.0.1:${FRONT_PORT})`); });
  const startedAt = Date.now();
  backend.on('exit', (code) => {
    if (stopping) return;
    quickExits = Date.now() - startedAt < 15_000 ? quickExits + 1 : 0;
    if (quickExits >= 2) { console.error('[sandbox] backend keeps exiting at startup; giving up (see the error above)'); process.exit(1); }
    console.error(`[sandbox] backend exited (${code}); restarting in 1 s`);
    env.SANDBOX_RESET = '0';
    setTimeout(startBackend, 1000);
  });
}
startBackend();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; backend?.kill(); process.exit(0); });

// ── the front server ──
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const app = express();
app.disable('x-powered-by');

// Every /api method goes to the sandbox backend, untouched (bodies streamed).
app.use('/api', (req, res) => {
  const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}`, 'x-forwarded-for': req.socket.remoteAddress || '127.0.0.1', 'x-forwarded-proto': 'http' };
  const up = http.request({ host: '127.0.0.1', port: API_PORT, method: req.method, path: req.originalUrl, headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) res.status(502).json({ success: false, error: 'sandbox backend is starting — try again in a moment' }); });
  req.pipe(up);
});

// /market/*: vercel.json's allowlisted rewrite to BEAR Swap's API, GET only.
const marketRoute = vercel.routes.find((r) => (r.src || '').startsWith('/market/'));
const MARKET_RE = new RegExp(`^${marketRoute.src}$`);
app.use('/market', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(403).json({ success: false, error: 'market proxy is read-only' });
  const m = ('/market' + req.path).match(MARKET_RE);
  if (!m) return res.status(404).end();
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const headers = { accept: req.headers.accept || 'application/json', 'user-agent': 'bearpark-sandbox' };
  const up = https.request(`${MARKET_API}/${m[1]}${qs}`, { method: req.method, headers }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
  up.on('error', () => { if (!res.headersSent) res.status(502).end(); });
  up.end();
});

// Sign in as a persona on THIS origin: /__sandbox/as/alice?to=#/u/…
app.get('/__sandbox/as/:who', (req, res) => {
  let js;
  try { js = browserSnippet(req.params.who, String(req.query.to || '#/community')); } catch (e) { return res.status(404).type('text').send(e.message); }
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Sandbox sign-in</title><script>${js}</script>`);
});
app.get('/__sandbox', (req, res) => {
  const rows = Object.entries(PERSONAS).map(([k, p]) => `<li><a href="/__sandbox/as/${k}">${k}</a> — ${p.name || '(no profile)'} · <code>${p.wallet}</code>${p.role ? ` · ${p.role}` : ''}${p.real ? '' : ' · empty wallet'}</li>`).join('');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>BEAR Park sandbox</title><body style="font:15px system-ui;padding:24px"><h1>BEAR Park sandbox</h1><p>Sign in as:</p><ul>${rows}</ul><p>Use <code>localhost:${FRONT_PORT}</code> and <code>127.0.0.1:${FRONT_PORT}</code> for two people at once.</p>`);
});

// The site, with vercel.json's routes.
const routes = vercel.routes.filter((r) => r.status || (r.dest && r.dest.startsWith('/'))).map((r) => ({ ...r, re: new RegExp(`^${r.src}$`) }));
app.use((req, res) => {
  let file = req.path;
  for (const r of routes) {
    const m = req.path.match(r.re);
    if (!m) continue;
    if (r.status && !r.dest) return res.status(r.status).end();
    file = r.dest.replace(/\$(\d+)/g, (_, i) => m[i] || '').split('?')[0];
    break;
  }
  let abs = path.join(ROOT, path.normalize(decodeURIComponent(file)));
  if (!abs.startsWith(ROOT) || abs.includes(`${path.sep}.`) || abs.startsWith(path.join(ROOT, 'backend'))) return res.status(403).end();
  try { if (fs.statSync(abs).isDirectory()) abs = path.join(abs, 'index.html'); } catch { /* 404 below */ }
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(abs, (err) => { if (err && !res.headersSent) res.status(404).send('Not found'); });
});

app.listen(FRONT_PORT, () => console.log(`[sandbox] front server on http://localhost:${FRONT_PORT}; backend starting on 127.0.0.1:${API_PORT}${RESET ? ' (fresh database)' : ''}`));

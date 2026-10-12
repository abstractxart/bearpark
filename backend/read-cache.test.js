// node --test backend/read-cache.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createReadCache } = require('./read-cache');

const A = 'rszi51CrPCVRutFTbier3MCU1bWpFaWYtk';
const B = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT';

async function harness() {
  let clock = 1_000_000;
  const cache = createReadCache({ now: () => clock });
  const app = express();
  app.use(express.json());
  app.use(cache.middleware);
  const calls = {};
  const count = (k) => { calls[k] = (calls[k] || 0) + 1; return calls[k]; };
  let slow = 0;
  app.get('/api/points/:w', async (req, res) => {
    const n = count(`points:${req.params.w}`);
    if (slow) await new Promise((r) => setTimeout(r, slow));
    res.json({ success: true, total_points: n });
  });
  app.get('/api/leaderboard', (req, res) => res.json({ success: true, n: count('board') }));
  app.get('/api/bulletin/posts', (req, res) => res.json([{ id: count('feed') }]));
  app.get('/api/merch/orders/:id/status', (req, res) => res.json({ success: true, n: count('status') }));
  app.get('/api/notifications/:w', (req, res) => res.json({ success: true, n: count(`notes:${req.params.w}`) }));
  app.get('/api/bulletin/posts/:id/comments', (req, res) => res.json([{ n: count('comments') }]));
  app.post('/api/bulletin/comments', (req, res) => res.json({ success: true }));
  app.post('/api/profile', (req, res) => res.json({ success: true }));
  app.get('/api/broken', (req, res) => res.status(500).json({ success: false, n: count('broken') }));
  app.get('/api/profile/:w', (req, res) => res.json({ success: false, n: count('soft-fail') }));
  app.post('/api/games/complete', (req, res) => res.json({ success: true }));
  app.post('/api/bulletin/posts', (req, res) => res.json({ success: true }));
  app.post('/api/refused', (req, res) => res.status(403).json({ success: false }));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => fetch(base + p).then(async (r) => ({ cache: r.headers.get('x-cache'), body: await r.json() }));
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    get, post, calls, cache,
    tick: (ms) => { clock += ms; },
    slow: (ms) => { slow = ms; },
    close: () => server.close(),
  };
}

test('a repeat read is served from memory until its TTL runs out', async () => {
  const t = await harness();
  assert.equal((await t.get(`/api/points/${A}`)).cache, 'MISS');
  const again = await t.get(`/api/points/${A}`);
  assert.equal(again.cache, 'HIT');
  assert.equal(again.body.total_points, 1);
  t.tick(11_000);
  assert.equal((await t.get(`/api/points/${A}`)).body.total_points, 2);
  t.close();
});

test('identical reads arriving together share one trip to the database', async () => {
  const t = await harness();
  t.slow(80);
  const all = await Promise.all([1, 2, 3, 4, 5].map(() => t.get(`/api/points/${B}`)));
  assert.equal(t.calls[`points:${B}`], 1);
  assert.ok(all.every((r) => r.body.total_points === 1));
  t.close();
});

test('errors and soft failures are never cached', async () => {
  const t = await harness();
  await t.get('/api/broken');
  await t.get('/api/broken');
  assert.equal(t.calls.broken, 2);
  await t.get(`/api/profile/${A}`);
  await t.get(`/api/profile/${A}`);
  assert.equal(t.calls['soft-fail'], 2);
  t.close();
});

test("a wallet's write drops that wallet's reads and the honey board, and no one else's", async () => {
  const t = await harness();
  await t.get(`/api/points/${A}`);
  await t.get(`/api/points/${B}`);
  await t.get(`/api/leaderboard?limit=25&wallet=${B}`);
  await t.post('/api/games/complete', { wallet_address: A.toLowerCase() });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await t.get(`/api/points/${A}`)).cache, 'MISS', 'own honey refreshes (case-insensitive match)');
  assert.equal((await t.get(`/api/points/${B}`)).cache, 'HIT', "someone else's honey stays cached");
  assert.equal((await t.get(`/api/leaderboard?limit=25&wallet=${B}`)).cache, 'MISS', 'the board refreshes');
  t.close();
});

test('a read already running when a write lands is not kept (it may have read the old value)', async () => {
  const t = await harness();
  try {
    t.slow(150);
    const racing = t.get(`/api/points/${A}`); // starts before the game completes, answers after
    await new Promise((r) => setTimeout(r, 30));
    await t.post('/api/games/complete', { wallet_address: A });
    await new Promise((r) => setTimeout(r, 20));
    const joined = t.get(`/api/points/${A}`); // arrives after the write: must not share the old trip
    assert.equal((await racing).body.total_points, 1, 'the racing read answers its own caller');
    assert.equal((await joined).body.total_points, 2, 'a read that arrives after the write gets a fresh answer');
    t.slow(0);
    const next = await t.get(`/api/points/${A}`);
    assert.notEqual(next.body.total_points, 1, 'the pre-write answer was not cached');
  } finally {
    t.close();
  }
});

test('posting to the board drops the cached feed; a refused write drops nothing', async () => {
  const t = await harness();
  await t.get('/api/bulletin/posts?limit=20');
  await t.post('/api/refused', { wallet_address: A });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await t.get('/api/bulletin/posts?limit=20')).cache, 'HIT');
  await t.post('/api/bulletin/posts', { wallet_address: A, content: 'hi' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await t.get('/api/bulletin/posts?limit=20')).cache, 'MISS');
  t.close();
});

test('unlisted routes (payment status) are never cached', async () => {
  const t = await harness();
  await t.get('/api/merch/orders/5/status');
  const second = await t.get('/api/merch/orders/5/status');
  assert.equal(second.cache, null);
  assert.equal(t.calls.status, 2);
  t.close();
});

test("a comment on someone's post drops THEIR cached notifications (the bell is someone else's)", async () => {
  const t = await harness();
  await t.get(`/api/notifications/${B}`);
  assert.equal((await t.get(`/api/notifications/${B}`)).cache, 'HIT');
  await t.post('/api/bulletin/comments', { wallet_address: A, post_id: 1, content: 'hi' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await t.get(`/api/notifications/${B}`)).cache, 'MISS');
  t.close();
});

test('a new name drops every cached thread it shows on', async () => {
  const t = await harness();
  await t.get('/api/bulletin/posts/7/comments');
  assert.equal((await t.get('/api/bulletin/posts/7/comments')).cache, 'HIT');
  await t.post('/api/profile', { wallet_address: A, display_name: 'New name' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await t.get('/api/bulletin/posts/7/comments')).cache, 'MISS');
  t.close();
});

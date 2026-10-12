// End-to-end checks for the HONEY system (how honey is earned, spent and
// logged, and that none of it can be gamed), against a RUNNING sandbox
// (node run.js). Requests go through the front server exactly as the browser's
// and the games' do; the sandbox control port is used only to set preconditions
// and to read the database back.
//
//   node e2e-honey.js                    all groups
//   node e2e-honey.js games raids        only some groups:
//                                        games, exploits, raids, spend, admin, meme, ledger, consistency
//
// TIME CONTROL. Nobody waits real minutes:
//   - Game time is what the server ACCRUES from heartbeats (game_reward_sessions.
//     accrued_active_ms): each heartbeat credits the wall-clock gap since the last
//     one (at most 20 s, nothing after a 30 s gap or without recent activity).
//     "Played 15 s" = move the session's last_heartbeat_at 15 s into the past,
//     then send a real heartbeat. Long sessions set accrued_active_ms directly
//     (what 120 heartbeats would have built), then complete for real.
//   - The daily cap is per UTC date (`new Date().toISOString()` in server.js).
//     "Midnight" = move the wallet's daily_game_plays.play_date one day back.
//   - The raid timer (115 s) is read from the server-signed raid token's iat. The
//     test signs a token with an iat 2 minutes back using the SANDBOX secret
//     (production rejects it), which is what a player holds after the wait.
//
// The test resets the honey state of the wallets it uses (alice, bob, dana, sam,
// carol) and writes one 'sandbox_opening' ledger row each, so at the end
// honey_points.total_points must equal the sum of that wallet's ledger rows.
//
// Exit code 0 when everything passes.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { mintToken, SANDBOX_SECRET } = require('./mint');
const { PERSONAS } = require('./personas');

const BASE = process.env.SANDBOX_URL || 'http://localhost:8810';
const control = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.SANDBOX_DATA || '.data', 'control.json'), 'utf8'));
const CONTROL = `http://127.0.0.1:${control.port}/__sandbox`;
const GAMES = ['flappy-bear', 'bear-ninja', 'bear-jumpventure', 'bear-pong']; // what game-points-helper.js sends
const ONLY = process.argv.slice(2);

async function sql(text, params = []) {
  const r = await fetch(`${CONTROL}/sql`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sandbox-key': control.key }, body: JSON.stringify({ sql: text, params }) });
  const body = await r.json();
  if (!r.ok) throw new Error(`control sql failed: ${body.error} — ${text.slice(0, 120)}`);
  return body.rows;
}

// ── tokens (same format as server.js signSessionToken; sandbox secret only) ──
const KEY = crypto.createHash('sha256').update(SANDBOX_SECRET).digest();
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
function sign(payload, key = KEY) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(crypto.createHmac('sha256', key).update(body).digest())}`;
}
const decode = (token) => JSON.parse(Buffer.from(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
/** A raid session token whose timer started `agoMs` ago (what the player holds after waiting). */
function raidToken(wallet, raidId, agoMs = 120_000) {
  const iat = Date.now() - agoMs;
  return sign({ type: 'raid_session', sid: crypto.randomUUID(), wallet: wallet.toLowerCase(), raid_id: String(raidId), iat, exp: iat + 30 * 60 * 1000 });
}

class Person {
  constructor(key) {
    this.key = key;
    this.wallet = PERSONAS[key].wallet;
    this.lower = this.wallet.toLowerCase();
    this.token = mintToken(this.wallet);
  }
  async req(method, url, body, { auth = true, token = null } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    else if (auth) headers.authorization = `Bearer ${this.token}`;
    const r = await fetch(`${BASE}/api${url}`, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json, cache: r.headers.get('x-cache') };
  }
  get(url) { return this.req('GET', url); }
  post(url, body = {}, opts) { return this.req('POST', url, body, opts); }
  // ── honey reads ──
  points() { return this.get(`/points/${this.wallet}`).then((r) => r.body); }
  async ledger() { return sql('SELECT * FROM honey_ledger WHERE wallet_address = $1 ORDER BY id', [this.lower]); }
  // ── games ──
  async startGame(game) {
    const r = await this.post('/games/session/start', { wallet_address: this.wallet, game_id: game });
    return { ...r, token: r.body?.session_token, sid: r.body?.session_token ? decode(r.body.session_token).sid : null };
  }
  /** One real heartbeat after `gapMs` of (simulated) play. */
  async beat(game, s, { gapMs = 15_000, inputAgoMs = null, ...flags } = {}) {
    if (gapMs) await sql(`UPDATE game_reward_sessions SET last_heartbeat_at = now() - make_interval(secs => $2::float8 / 1000) WHERE session_id = $1`, [s.sid, gapMs]);
    if (inputAgoMs !== null) await sql(`UPDATE game_reward_sessions SET last_activity_at = now() - make_interval(secs => $2::float8 / 1000) WHERE session_id = $1`, [s.sid, inputAgoMs]);
    return this.post('/games/session/heartbeat', { wallet_address: this.wallet, game_id: game, session_token: s.token, visible: true, focused: true, trusted_activity: true, ...flags });
  }
  complete(game, s, extra = {}) { return this.post('/games/complete', { wallet_address: this.wallet, game_id: game, session_token: s.token, ...extra }); }
  /** Start a session, record `minutes` of accrued play, complete it. */
  async play(game, minutes, extra = {}) {
    const s = await this.startGame(game);
    await accrue(s.sid, minutes * 60_000);
    const c = await this.complete(game, s, extra);
    return { s, c };
  }
}
const accrue = (sid, ms) => sql(`UPDATE game_reward_sessions SET accrued_active_ms = $2, last_heartbeat_at = now(), last_activity_at = now() WHERE session_id = $1`, [sid, Math.round(ms)]);
const sessionRow = (sid) => sql('SELECT * FROM game_reward_sessions WHERE session_id = $1', [sid]).then((r) => r[0]);
const ledgerByKey = (key) => sql('SELECT * FROM honey_ledger WHERE idempotency_key = $1', [key]);
const num = (v) => Math.round((Number(v) || 0) * 100) / 100;
const sum = (rows, f = 'delta') => num(rows.reduce((a, r) => a + Number(r[f]), 0));
const bust = () => `?t=${Date.now()}${Math.random().toString(36).slice(2, 6)}`; // a URL no cache has seen (after SQL-only changes)

const alice = new Person('alice');
const bob = new Person('bob');
const carol = new Person('carol');
const dana = new Person('dana');
const sam = new Person('sam');
const WALLETS = [alice, bob, carol, dana, sam];

// Opening balances (the seed's), and the cosmetics each persona owns in the seed.
const OPENING = {
  alice: { total: 4808.9, raiding: 195, games: 4613.9 },
  bob: { total: 1053.1, raiding: 195, games: 858.1 },
  dana: { total: 640, raiding: 120, games: 520 },
  sam: { total: 18, raiding: 0, games: 18 },
};
const SEED_COSMETICS = { alice: [8, 1, 16], bob: [2], dana: [3], sam: [], carol: [] };
const SEED_EQUIPPED = { alice: [8, 16], bob: [2, null], dana: [3, null] };

// ── a tiny harness (same as e2e-social.js) ──
const results = [];
let current = null;
function check(cond, what, detail) {
  current.checks += 1;
  if (!cond) current.failures.push(detail === undefined ? what : `${what} — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}`);
  return !!cond;
}
async function test(group, name, fn) {
  if (ONLY.length && !ONLY.includes(group)) return;
  current = { group, name, checks: 0, failures: [] };
  const t0 = Date.now();
  try { await fn(); } catch (err) { current.failures.push(`threw: ${err.stack || err.message}`); }
  current.ms = Date.now() - t0;
  results.push(current);
  console.log(`${current.failures.length ? '✗' : '✓'} [${group}] ${name} (${current.checks} checks, ${current.ms} ms)`);
  for (const f of current.failures) console.log(`    - ${f}`);
}

const raids = {}; // name -> id

async function setup() {
  const lowers = WALLETS.map((p) => p.lower);
  await sql(`DELETE FROM game_reward_sessions WHERE lower(wallet_address) = ANY($1)`, [lowers]).catch(() => {}); // created by server.js on first use
  await sql(`DELETE FROM daily_game_plays WHERE lower(wallet_address) = ANY($1)`, [lowers]);
  await sql(`DELETE FROM honey_points_activity WHERE lower(wallet_address) = ANY($1)`, [lowers]);
  await sql(`DELETE FROM honey_ledger WHERE wallet_address = ANY($1)`, [lowers]);
  await sql(`DELETE FROM banned_users WHERE lower(wallet_address) = ANY($1)`, [lowers]).catch(() => {});
  await sql(`DELETE FROM honey_points WHERE lower(wallet_address) = ANY($1) AND wallet_address <> ALL($2)`, [lowers, WALLETS.map((p) => p.wallet)]); // no case twins
  await sql(`DELETE FROM honey_points WHERE wallet_address = $1`, [carol.wallet]);
  for (const p of [alice, bob, dana, sam]) {
    const o = OPENING[p.key];
    await sql(`INSERT INTO honey_points (wallet_address, total_points, raiding_points, games_points) VALUES ($1, $2, $3, $4)
               ON CONFLICT (wallet_address) DO UPDATE SET total_points = $2, raiding_points = $3, games_points = $4, updated_at = now()`, [p.wallet, o.total, o.raiding, o.games]);
    await sql(`INSERT INTO honey_ledger (wallet_address, stored_wallet, delta, balance_after, source, reason) VALUES ($1, $2, $3, $3, 'sandbox_opening', 'e2e-honey opening balance')`, [p.lower, p.wallet, o.total]);
  }
  // cosmetics back to the seed
  for (const p of WALLETS) {
    await sql(`DELETE FROM user_cosmetics WHERE lower(wallet_address) = $1 AND cosmetic_id <> ALL($2::bigint[])`, [p.lower, SEED_COSMETICS[p.key]]);
    await sql(`DELETE FROM cosmetics_transactions WHERE lower(wallet_address) = $1`, [p.lower]);
  }
  for (const [k, [ring, banner]] of Object.entries(SEED_EQUIPPED)) {
    await sql(`UPDATE profiles SET equipped_ring_id = $2, equipped_banner_id = $3 WHERE wallet_address = $1`, [PERSONAS[k].wallet, ring, banner]);
  }
  // game boards back to the seed
  await sql(`DELETE FROM game_leaderboards WHERE lower(wallet_address) = $1 AND game_id <> 'flappy-bear'`, [alice.lower]);
  await sql(`UPDATE game_leaderboards SET score = 1204, metadata = '{}'::jsonb WHERE wallet_address = $1 AND game_id = 'flappy-bear'`, [alice.wallet]);
  // memes this week
  await sql(`DELETE FROM meme_submission_rewards WHERE lower(wallet_address) = ANY($1)`, [lowers]).catch(() => {});
  await sql(`DELETE FROM meme_votes WHERE meme_id IN (SELECT id FROM memes WHERE lower(wallet_address) = ANY($1))`, [lowers]).catch(() => {});
  await sql(`DELETE FROM memes WHERE lower(wallet_address) = ANY($1)`, [lowers]).catch(() => {});
  // dana is an admin, everyone else has no role
  await sql(`UPDATE admin_roles SET role = 'admin', is_active = TRUE WHERE wallet_address = $1`, [dana.wallet]);
  // raids: fresh ones for this run
  await sql(`DELETE FROM raid_completions WHERE raid_id IN (SELECT id FROM raids WHERE description LIKE 'E2E honey%')`);
  await sql(`DELETE FROM raids WHERE description LIKE 'E2E honey%'`);
  const mk = async (name, reward, { expires = "now() + interval '1 day'", active = true, verification = 'unverified' } = {}) => {
    const r = await sql(`INSERT INTO raids (description, twitter_url, reward, profile_name, profile_handle, expires_at, is_active, verification_type)
                         VALUES ($1, 'https://x.com/BearXRPL/status/1900000000000000099', $2, 'BearXRPL', '@BearXRPL', ${expires}, $3, $4) RETURNING id`, [`E2E honey ${name}`, reward, active, verification]);
    raids[name] = Number(r[0].id);
  };
  await mk('web', 20);
  await mk('tg', 25);
  await mk('race', 10);
  await mk('expired', 15, { expires: "now() - interval '1 hour'" });
  await mk('inactive', 15, { active: false });
  await mk('huge', 5000);
  await mk('like', 12, { verification: 'like' });
  await mk('cache', 7);
}

async function main() {
  const health = await fetch(`${CONTROL}/health`, { headers: { 'x-sandbox-key': control.key } }).then((r) => r.json()).catch(() => null);
  if (!health?.ok) throw new Error(`sandbox is not running at ${CONTROL} (start it with: node run.js)`);
  console.log(`sandbox up (built ${health.built_at}); testing ${BASE}\n`);
  await setup();

  // ═══════════════════════════════ games ═══════════════════════════════
  await test('games', 'each game pays exactly the minutes the server tracked from heartbeats (client numbers ignored)', async () => {
    const before = await alice.points();
    for (const game of GAMES) {
      const s = await alice.startGame(game);
      check(s.status === 200 && s.token, `${game}: session starts`, s);
      check(s.body?.heartbeat_interval_seconds === 15, `${game}: heartbeat every 15 s`, s.body);
      let last;
      for (let i = 0; i < 4; i++) last = await alice.beat(game, s); // 4 × 15 s of play
      check(last.status === 200 && last.body.heartbeat_count === 4, `${game}: four heartbeats recorded`, last);
      check(last.body?.tracked_minutes === 1, `${game}: one minute tracked`, last.body);
      // Junk the client could send: none of it may count.
      const c = await alice.complete(game, s, { minutes_played: 500, client_minutes_played: 500, points_awarded: 500, total_points: 1e6, games_points: 1e6 });
      check(c.status === 200 && c.body.success === true, `${game}: completes`, c);
      check(c.body.points_awarded === 1 && c.body.tracked_minutes === 1, `${game}: pays 1 honey for 1 tracked minute`, c.body);
      const rows = await ledgerByKey(`game:${s.sid}`);
      check(rows.length === 1 && num(rows[0].delta) === 1 && rows[0].source === 'game' && rows[0].ref_id === game, `${game}: one ledger row (+1, game, ${game})`, rows);
      const act = await sql(`SELECT points FROM honey_points_activity WHERE lower(wallet_address) = $1 AND activity_type = 'game' AND activity_id = $2`, [alice.lower, game]);
      check(act.length === 1 && num(act[0].points) === 1, `${game}: one BEARdrops activity row (+1)`, act);
    }
    const after = await alice.points();
    check(num(after.total_points - before.total_points) === 4 && num(after.games_points - before.games_points) === 4 && after.raiding_points === before.raiding_points,
      '/api/points: +4 total, +4 games, raids untouched (read right after the writes)', [before, after]);
    const plays = await sql(`SELECT game_id, minutes_played, points_earned FROM daily_game_plays WHERE lower(wallet_address) = $1 ORDER BY game_id`, [alice.lower]);
    check(plays.length === 4 && plays.every((p) => num(p.minutes_played) === 1 && num(p.points_earned) === 1), 'daily_game_plays: one row per game, 1 minute each', plays);
  });

  await test('games', 'daily cap: 123 minutes shared by every game, then nothing; daily-status agrees at once', async () => {
    const warm = await alice.get(`/games/daily-status/${alice.wallet}/all-games`);
    check(warm.body.minutes_today === 4 && warm.body.remaining_minutes === 119, 'status before: 4 of 123', warm.body);
    check((await alice.get(`/games/daily-status/${alice.wallet}/all-games`)).cache === 'HIT', 'status is cached between writes', null);
    const before = await alice.points();
    const steps = [
      ['flappy-bear', 45, 30, 34], // a session is worth at most 30 minutes
      ['bear-ninja', 30, 30, 64],
      ['bear-jumpventure', 30, 30, 94],
      ['bear-pong', 30, 29, 123], // only 29 left of the day
    ];
    for (const [game, played, paid, today] of steps) {
      const { s, c } = await alice.play(game, played);
      check(c.status === 200 && c.body.success === true && c.body.points_awarded === paid && c.body.minutes_today === today,
        `${game}: ${played} min played → ${paid} paid, ${today}/123 today`, c.body);
      check((await ledgerByKey(`game:${s.sid}`)).length === 1, `${game}: ledgered once`, null);
      const st = await alice.get(`/games/daily-status/${alice.wallet}/all-games`);
      check(st.body.minutes_today === today && st.body.remaining_minutes === 123 - today, `daily-status shows ${today} right after (no stale cache)`, st.body);
    }
    const { s, c } = await alice.play('flappy-bear', 10);
    check(c.status === 200 && c.body.success === false && c.body.points_awarded === 0 && /limit/i.test(c.body.message || ''), 'at 123: the next session pays 0 ("Daily limit reached")', c.body);
    check((await ledgerByKey(`game:${s.sid}`)).length === 0, 'nothing ledgered at the cap', null);
    check((await sessionRow(s.sid)).status === 'consumed', 'and that session is used up (cannot be claimed later)', null);
    const st = (await alice.get(`/games/daily-status/${alice.wallet}/all-games`)).body;
    check(st.minutes_today === 123 && st.remaining_minutes === 0 && st.can_earn_points === false && st.points_earned_today === 123, 'all-games status: 123/123, cannot earn', st);
    for (const [game, mins] of [['flappy-bear', 31], ['bear-ninja', 31], ['bear-jumpventure', 31], ['bear-pong', 30]]) {
      const g = (await alice.get(`/games/daily-status/${alice.wallet}/${game}`)).body;
      check(g.minutes_today === mins && g.remaining_minutes === 0 && g.can_earn_points === false, `${game} status: ${mins} min today, and no minutes left (the cap is shared)`, g);
      const lowerCase = (await alice.get(`/games/daily-status/${alice.lower}/${game}`)).body;
      check(lowerCase.minutes_today === mins, `${game} status is the same for the lowercase address`, lowerCase);
    }
    const after = await alice.points();
    check(num(after.games_points - before.games_points) === 119 && num(after.total_points - before.total_points) === 119, '/api/points: +119 (123 for the day)', [before, after]);
  });

  await test('games', 'the day resets at 00:00 UTC (server date); 24h honey counts today only', async () => {
    // What midnight does: today's rows become yesterday's.
    await sql(`UPDATE daily_game_plays SET play_date = play_date - 1 WHERE lower(wallet_address) = $1`, [alice.lower]);
    await sql(`UPDATE honey_points_activity SET created_at = created_at - interval '1 day' WHERE lower(wallet_address) = $1`, [alice.lower]);
    const st = (await alice.get(`/games/daily-status/${alice.wallet}/all-games${bust()}`)).body;
    check(st.minutes_today === 0 && st.remaining_minutes === 123 && st.can_earn_points === true, 'a new day: 0/123', st);
    const h0 = (await alice.get(`/honey-points/24h?wallet=${alice.wallet}`)).body;
    check(h0.points === 0, "yesterday's activity is not today's", h0);
    const s = await alice.startGame('bear-ninja');
    for (let i = 0; i < 10; i++) await alice.beat('bear-ninja', s); // 10 × 15 s = 2.5 min
    const c = await alice.complete('bear-ninja', s);
    check(c.body.success === true && c.body.points_awarded === 2.5 && c.body.minutes_today === 2.5, 'pays again after midnight: 2.5 min → 2.5 honey', c.body);
    const h = (await alice.get(`/honey-points/24h?wallet=${alice.wallet}`)).body;
    check(h.points === 2.5, '/api/honey-points/24h: 2.5 (fractional honey is not rounded in the activity log)', h);
  });

  await test('games', 'game boards: best score kept, pong keeps wins/losses, junk refused, honey untouched', async () => {
    const ledgerBefore = (await alice.ledger()).length;
    const pointsBefore = await alice.points();
    const lower = await alice.post('/leaderboard', { wallet_address: alice.wallet, game_id: 'flappy-bear', score: 1000 });
    check(lower.status === 200 && lower.body.is_high_score === false && lower.body.entry?.score === 1204, 'a lower score keeps the best (1204)', lower.body);
    await alice.get('/leaderboard/flappy-bear?limit=5'); // warm
    const higher = await alice.post('/leaderboard', { wallet_address: alice.wallet, game_id: 'flappy-bear', score: 1500 });
    check(higher.body.is_high_score === true && higher.body.rank === 1, 'a higher score replaces it and ranks #1', higher.body);
    const board = (await alice.get('/leaderboard/flappy-bear?limit=5')).body.leaderboard || [];
    check(board[0]?.wallet_address === alice.wallet && board[0]?.score === 1500, 'the board shows 1500 on the next read', board[0]);
    const mine = (await alice.get(`/leaderboard/flappy-bear/${alice.wallet}`)).body;
    check(mine.entry?.score === 1500, 'the player entry shows 1500', mine);
    for (const [bad, why] of [[-5, 'negative'], [1e12, 'huge'], ['abc', 'text'], [12.5, 'fractional']]) {
      const r = await alice.post('/leaderboard', { wallet_address: alice.wallet, game_id: 'flappy-bear', score: bad });
      check(r.status === 400, `${why} score → 400`, r);
    }
    const spoof = await bob.post('/leaderboard', { wallet_address: alice.wallet, game_id: 'flappy-bear', score: 99999 });
    check(spoof.status === 403, "Bob can't post Alice's score", spoof.status);
    const anon = await alice.req('POST', '/leaderboard', { wallet_address: alice.wallet, game_id: 'flappy-bear', score: 99999 }, { auth: false });
    check(anon.status === 401, 'no session → 401', anon.status);
    const p1 = await alice.post('/leaderboard', { wallet_address: alice.wallet, game_id: 'bear-pong', score: 3, metadata: { wins: 3, losses: 1 } });
    const p2 = await alice.post('/leaderboard', { wallet_address: alice.wallet, game_id: 'bear-pong', score: 3, metadata: { wins: 3, losses: 2 } });
    check(p1.status === 200 && p2.body.entry?.metadata?.losses === 2, 'pong: a loss updates losses with the same wins', p2.body);
    check((await alice.ledger()).length === ledgerBefore, 'a score never moves honey (no ledger rows)', null);
    check((await alice.points()).total_points === pointsBefore.total_points, 'balance unchanged', null);
  });

  // ═══════════════════════════════ exploits (each must mint nothing) ═══════════════════════════════
  await test('exploits', 'no session, someone else\'s session, forged or wrong-type tokens: refused', async () => {
    const before = (await bob.ledger()).length;
    const s = await bob.startGame('flappy-bear');
    await bob.beat('flappy-bear', s);
    await accrue(s.sid, 10 * 60_000);
    const body = { wallet_address: bob.wallet, game_id: 'flappy-bear', session_token: s.token };
    for (const route of ['/games/session/start', '/games/session/heartbeat', '/games/complete']) {
      check((await bob.req('POST', route, body, { auth: false })).status === 401, `${route}: no wallet session → 401`, null);
      check((await alice.post(route, body)).status === 403, `${route}: Alice's session naming Bob → 403`, null);
    }
    const stolen = await alice.post('/games/complete', { ...body, wallet_address: alice.wallet });
    check(stolen.status === 403, "Alice claiming with Bob's game token → 403", stolen);
    const p = decode(s.token);
    const tampered = `${b64url(JSON.stringify({ ...p, wallet: alice.lower }))}.${s.token.split('.')[1]}`;
    check((await alice.post('/games/complete', { wallet_address: alice.wallet, game_id: 'flappy-bear', session_token: tampered })).status === 401, 'a token edited to name Alice (old signature) → 401', null);
    const wrongKey = sign({ ...p, sid: crypto.randomUUID() }, crypto.createHash('sha256').update('not-the-secret').digest());
    check((await bob.post('/games/complete', { ...body, session_token: wrongKey })).status === 401, 'a token signed with another secret → 401', null);
    check((await bob.post('/games/complete', { ...body, session_token: bob.token })).status === 401, 'the wallet session used as a game token → 401', null);
    check((await bob.req('POST', '/games/complete', body, { token: s.token })).status === 401, 'the game token used as the wallet session → 401', null);
    const unknown = sign({ type: 'game_session', sid: crypto.randomUUID(), wallet: bob.lower, game_id: 'flappy-bear', iat: Date.now(), exp: Date.now() + 3600e3 });
    check((await bob.post('/games/complete', { ...body, session_token: unknown })).status === 401, 'a validly signed token for a session the server never started → 401', null);
    check((await bob.post('/games/complete', { ...body, game_id: 'bear-ninja' })).status === 403, 'a flappy token claimed as ninja → 403', null);
    check((await bob.post('/games/session/start', { wallet_address: bob.wallet, game_id: 'bear-casino' })).status === 400, 'unknown game → 400', null);
    check((await bob.ledger()).length === before, 'nothing ledgered for Bob', null);
    const ok = await bob.complete('flappy-bear', s); // the real owner still can
    check(ok.body.points_awarded === 10, 'the session itself is intact: Bob claims his 10', ok.body);
  });

  await test('exploits', 'replays, no heartbeats, heartbeat floods and idle time pay nothing extra', async () => {
    const replay = await bob.complete('flappy-bear', { token: (await bob.startGame('flappy-bear')).token });
    check(replay.body.success === false && replay.body.points_awarded === 0 && /too short/i.test(replay.body.message), 'complete with no heartbeats → 0 ("too short")', replay.body);
    // replay a paid session
    const { s, c } = await bob.play('bear-ninja', 2);
    check(c.body.points_awarded === 2, 'a 2-minute session pays 2', c.body);
    const again = await bob.complete('bear-ninja', s);
    check(again.status === 409 && !again.body.points_awarded, 'replaying it → 409, nothing paid', again);
    check((await ledgerByKey(`game:${s.sid}`)).length === 1, 'still one ledger row for that session', null);
    // flood: heartbeats as fast as possible credit wall-clock time only
    const f = await bob.startGame('bear-jumpventure');
    const t0 = Date.now();
    for (let i = 0; i < 12; i++) await bob.beat('bear-jumpventure', f, { gapMs: 0 });
    await Promise.all(Array.from({ length: 8 }, () => bob.beat('bear-jumpventure', f, { gapMs: 0 })));
    const row = await sessionRow(f.sid);
    const wall = Date.now() - new Date(row.started_at).getTime();
    check(Number(row.accrued_active_ms) <= wall + 50 && Number(row.heartbeat_count) >= 12, `20 rapid heartbeats accrue at most the ${wall} ms that passed`, { accrued: row.accrued_active_ms, wall });
    const fc = await bob.complete('bear-jumpventure', f);
    check(num(fc.body.points_awarded || 0) <= num((Date.now() - t0) / 60000) + 0.1, 'and pay no more than that', fc.body);
    // idle time and fake visibility
    const i = await bob.startGame('bear-pong');
    const accrued = async () => Number((await sessionRow(i.sid)).accrued_active_ms);
    for (const [flags, why] of [
      [{ gapMs: 5 * 60_000 }, 'after 5 idle minutes'],
      [{ trusted_activity: false, inputAgoMs: 30_000 }, 'with no input for 30 s (the window is 25 s)'],
      [{ visible: false }, 'with the tab hidden'],
      [{ focused: false }, 'without focus'],
    ]) {
      const a0 = await accrued();
      const r = await bob.beat('bear-pong', i, flags);
      const a1 = await accrued();
      check(r.status === 200 && a1 === a0, `a heartbeat ${why} credits nothing`, { body: r.body, credited: a1 - a0 });
    }
    const a0 = await accrued();
    await bob.beat('bear-pong', i);
    const credited = (await accrued()) - a0;
    check(credited >= 15_000 && credited <= 20_000, 'a normal heartbeat 15 s later credits those 15 s', credited);
    const capped = await accrued();
    await bob.beat('bear-pong', i, { gapMs: 29_000 });
    check((await accrued()) - capped === 20_000, 'a 29 s gap credits at most 20 s', (await accrued()) - capped);
    await bob.complete('bear-pong', i);
  });

  await test('exploits', 'five completes of one session at once pay once', async () => {
    const s = await bob.startGame('flappy-bear');
    await accrue(s.sid, 5 * 60_000);
    const all = await Promise.all(Array.from({ length: 5 }, () => bob.complete('flappy-bear', s)));
    const paid = all.filter((r) => r.body?.points_awarded > 0);
    check(paid.length === 1 && paid[0].body.points_awarded === 5, 'exactly one pays 5', all.map((r) => [r.status, r.body?.points_awarded]));
    check(all.filter((r) => r.status === 409).length === 4, 'the other four → 409', all.map((r) => r.status));
    check((await ledgerByKey(`game:${s.sid}`)).length === 1, 'one ledger row', null);
  });

  await test('exploits', 'parallel sessions across games: one live session per wallet, so time cannot stack', async () => {
    const before = await bob.points();
    const ss = await Promise.all(GAMES.map((g) => bob.startGame(g)));
    check(ss.every((s) => s.status === 200 || s.status === 500), 'starts answered', ss.map((s) => s.status));
    const live = await sql(`SELECT session_id, game_id FROM game_reward_sessions WHERE lower(wallet_address) = $1 AND status = 'active'`, [bob.lower]);
    check(live.length === 1, 'exactly one active session', live);
    const beats = await Promise.all(GAMES.map((g, k) => (ss[k].token ? bob.beat(g, ss[k]) : null)));
    check(beats.filter((b) => b?.status === 200).length === 1, 'only the live one takes heartbeats; the replaced ones → 409', beats.map((b) => b?.status));
    for (const s of ss) if (s.sid) await accrue(s.sid, 20 * 60_000); // even with time on every one of them…
    const done = await Promise.all(GAMES.map((g, k) => (ss[k].token ? bob.complete(g, ss[k]) : null)));
    const paid = done.filter((d) => d?.body?.points_awarded > 0);
    check(paid.length === 1 && paid[0].body.points_awarded === 20, '…only the live session pays (20)', done.map((d) => [d?.status, d?.body?.points_awarded]));
    const after = await bob.points();
    check(num(after.total_points - before.total_points) === 20, 'Bob: +20 in all', [before.total_points, after.total_points]);
  });

  await test('exploits', 'an expired session pays nothing', async () => {
    const s = await bob.startGame('bear-ninja');
    await accrue(s.sid, 3 * 60_000);
    await sql(`UPDATE game_reward_sessions SET expires_at = now() - interval '1 second' WHERE session_id = $1`, [s.sid]);
    check((await bob.beat('bear-ninja', s)).status === 410, 'heartbeat → 410', null);
    check((await bob.complete('bear-ninja', s)).status === 410, 'complete → 410', null);
    check((await ledgerByKey(`game:${s.sid}`)).length === 0, 'nothing ledgered', null);
  });

  await test('exploits', 'client-set honey is refused everywhere (old endpoints)', async () => {
    const before = (await bob.ledger()).length;
    const p = await bob.post('/points', { wallet_address: bob.wallet, total_points: 99999, raiding_points: 99999, games_points: 99999 });
    check(p.status === 403, 'POST /api/points → 403 (disabled)', p);
    const bet = await bob.post('/pong/betting', { wallet_address: bob.wallet, did_win: true, bet_amount: 10000 });
    check(bet.status === 410, 'POST /api/pong/betting → 410 (removed)', bet);
    const act = await bob.post('/beardrops/activity', { wallet: bob.wallet, points: 99999, activity_type: 'game' });
    check(act.status === 410, 'POST /api/beardrops/activity → 410 (removed)', act);
    check((await bob.ledger()).length === before, 'nothing ledgered', null);
    const activity = await sql(`SELECT count(*)::int n FROM honey_points_activity WHERE lower(wallet_address) = $1 AND points >= 99999`, [bob.lower]);
    check(activity[0].n === 0, 'no activity rows from the client', activity);
  });

  await test('exploits', 'Carol (no $BEAR, no BEAR NFT) cannot earn anywhere', async () => {
    const g = await carol.post('/games/session/start', { wallet_address: carol.wallet, game_id: 'flappy-bear' });
    check(g.status === 403 && g.body.code === 'HONEY_ACCESS_REQUIRED', 'game session → 403 HONEY_ACCESS_REQUIRED', g);
    const forged = sign({ type: 'game_session', sid: crypto.randomUUID(), wallet: carol.lower, game_id: 'flappy-bear', iat: Date.now(), exp: Date.now() + 3600e3 });
    check((await carol.post('/games/complete', { wallet_address: carol.wallet, game_id: 'flappy-bear', session_token: forged })).status === 403, 'game complete → 403 (gate runs before the token)', null);
    check((await carol.post('/raids/session/start', { wallet_address: carol.wallet, raid_id: raids.web })).status === 403, 'raid session → 403', null);
    check((await carol.post('/raids/complete', { wallet_address: carol.wallet, raid_id: raids.web, session_token: raidToken(carol.wallet, raids.web) })).status === 403, 'raid complete (with a finished timer) → 403', null);
    check((await carol.post('/raids/tg-claim', { wallet_address: carol.wallet, raid_id: raids.web })).status === 403, 'telegram claim → 403', null);
    const rows = await sql(`SELECT (SELECT count(*)::int FROM honey_points WHERE lower(wallet_address) = $1) hp, (SELECT count(*)::int FROM honey_ledger WHERE wallet_address = $1) l, (SELECT count(*)::int FROM raid_completions WHERE lower(wallet_address) = $1) rc`, [carol.lower]);
    check(rows[0].hp === 0 && rows[0].l === 0 && rows[0].rc === 0, 'Carol has no honey row, ledger row or raid completion', rows[0]);
  });

  await test('exploits', 'a banned wallet cannot earn or spend; unbanned, it can', async () => {
    const ban = await dana.post('/admin/ban-user', { wallet_address: bob.wallet, reason: 'e2e' });
    check(ban.status === 200, 'Dana (admin) bans Bob', ban);
    const g = await bob.post('/games/session/start', { wallet_address: bob.wallet, game_id: 'bear-ninja' });
    check(g.status === 403 && g.body.code === 'WALLET_BANNED', 'game session → 403 WALLET_BANNED', g);
    const r = await bob.post('/raids/complete', { wallet_address: bob.wallet, raid_id: raids.web, session_token: raidToken(bob.wallet, raids.web) });
    check(r.status === 403, 'raid complete → 403', r.status);
    const buy = await bob.post('/cosmetics/purchase', { wallet_address: bob.wallet, cosmetic_id: 1 });
    check(buy.status === 403, 'cosmetic purchase → 403', buy.status);
    const unban = await dana.post('/admin/unban-user', { wallet_address: bob.wallet });
    check(unban.status === 200, 'Dana unbans Bob', unban);
    const g2 = await bob.post('/games/session/start', { wallet_address: bob.wallet, game_id: 'bear-ninja' });
    check(g2.status === 200, 'Bob can play again', g2.status);
  });

  // ═══════════════════════════════ raids ═══════════════════════════════
  await test('raids', 'a raid pays its own reward once; the 115 s timer is the server\'s; every board updates at once', async () => {
    // warm every read the page shows
    for (let k = 0; k < 2; k++) {
      await alice.get(`/points/${alice.wallet}`);
      await alice.get('/raids/leaderboard');
      await alice.get(`/honey-points/24h?wallet=${alice.wallet}`);
      await alice.get('/leaderboard?limit=15');
      await alice.get(`/raids/completed/${alice.wallet}`);
    }
    check((await alice.get('/raids/leaderboard')).cache === 'HIT', 'raid board is cached before the raid', null);
    const before = await alice.points();
    const h0 = (await alice.get(`/honey-points/24h?wallet=${alice.wallet}`)).body.points;
    const s = await alice.post('/raids/session/start', { wallet_address: alice.wallet, raid_id: raids.web });
    check(s.status === 200 && s.body.minimum_seconds === 115, 'raid session starts (115 s timer)', s.body);
    const early = await alice.post('/raids/complete', { wallet_address: alice.wallet, raid_id: raids.web, session_token: s.body.session_token });
    check(early.status === 400 && /timer/i.test(early.body.error), 'completing at once → 400 (timer not finished)', early);
    const r = await alice.post('/raids/complete', { wallet_address: alice.wallet, raid_id: raids.web, session_token: raidToken(alice.wallet, raids.web), points_awarded: 999999, reward: 999999 });
    check(r.status === 200 && r.body.points_awarded === 20 && r.body.alreadyCompleted === false, "after the timer: +20, the raid's reward (body numbers ignored)", r.body);
    const rows = await ledgerByKey(`raid:${raids.web}:${alice.lower}`);
    check(rows.length === 1 && num(rows[0].delta) === 20 && rows[0].source === 'raid' && rows[0].ref_id === String(raids.web), 'one ledger row: +20 raid', rows);
    const rc = await sql('SELECT * FROM raid_completions WHERE raid_id = $1', [raids.web]);
    check(rc.length === 1 && rc[0].wallet_address === alice.lower && num(rc[0].points_awarded) === 20, 'raid_completions: one row (lowercase wallet, 20)', rc);
    const act = await sql(`SELECT points FROM honey_points_activity WHERE lower(wallet_address) = $1 AND activity_type = 'raid' AND activity_id = $2`, [alice.lower, String(raids.web)]);
    check(act.length === 1 && num(act[0].points) === 20, 'one activity row (+20) for BEARdrops', act);
    const after = await alice.get(`/points/${alice.wallet}`);
    check(after.cache !== 'HIT' && num(after.body.raiding_points - before.raiding_points) === 20 && num(after.body.total_points - before.total_points) === 20, '/api/points: raids +20, total +20, fresh read', [before, after.body, after.cache]);
    const h = await alice.get(`/honey-points/24h?wallet=${alice.wallet}`);
    check(h.cache !== 'HIT' && num(h.body.points - h0) === 20, '/api/honey-points/24h: +20, fresh read', [h0, h.body]);
    const lb = await alice.get('/raids/leaderboard');
    const me = (lb.body.leaderboard || []).find((x) => x.wallet_address.toLowerCase() === alice.lower);
    check(lb.cache !== 'HIT' && me && num(me.total_points) === num(after.body.raiding_points), 'raid board: same honey-from-raids as /api/points, fresh read', [me, after.body.raiding_points]);
    const hb = await alice.get('/leaderboard?limit=15');
    const meHb = (hb.body.leaderboard || []).find((x) => x.wallet_address === alice.wallet);
    check(hb.cache !== 'HIT' && num(meHb?.total_points) === num(after.body.total_points), 'honey board: new total, fresh read', [meHb, hb.cache]);
    const done = await alice.get(`/raids/completed/${alice.wallet}`);
    check(done.body.completedRaids?.some((x) => Number(x.raid_id) === raids.web), 'completed list shows it at once', done.body);
    const cc = await alice.post('/raids/check-completion', { wallet_address: alice.wallet, raid_id: raids.web });
    check(cc.body.alreadyCompleted === true, 'check-completion: true', cc.body);
    const again = await alice.post('/raids/complete', { wallet_address: alice.wallet, raid_id: raids.web, session_token: raidToken(alice.wallet, raids.web) });
    check(again.body.alreadyCompleted === true && !again.body.points_awarded, 'a second completion pays nothing', again.body);
    const tg = await alice.post('/raids/tg-claim', { wallet_address: alice.wallet, raid_id: raids.web });
    check(tg.body.alreadyCompleted === true && !tg.body.points_awarded, 'nor does the Telegram door', tg.body);
    check((await alice.points()).total_points === after.body.total_points, 'balance unchanged by the repeats', null);
  });

  await test('raids', 'parallel claims (web and Telegram) pay once', async () => {
    const tg = await Promise.all(Array.from({ length: 4 }, () => alice.post('/raids/tg-claim', { wallet_address: alice.wallet, raid_id: raids.tg })));
    const paid = tg.filter((r) => r.body?.points_awarded > 0);
    check(paid.length === 1 && paid[0].body.points_awarded === 25, 'four Telegram claims at once: one pays 25', tg.map((r) => [r.status, r.body?.points_awarded, r.body?.alreadyCompleted]));
    const web = await alice.post('/raids/complete', { wallet_address: alice.wallet, raid_id: raids.tg, session_token: raidToken(alice.wallet, raids.tg) });
    check(web.body.alreadyCompleted === true, 'the web door after it pays nothing', web.body);
    const token = raidToken(bob.wallet, raids.race);
    const many = await Promise.all(Array.from({ length: 6 }, () => bob.post('/raids/complete', { wallet_address: bob.wallet, raid_id: raids.race, session_token: token })));
    const bobPaid = many.filter((r) => r.body?.points_awarded > 0);
    check(bobPaid.length === 1 && bobPaid[0].body.points_awarded === 10, 'six web completes at once: one pays 10', many.map((r) => [r.status, r.body?.points_awarded]));
    const rows = await sql('SELECT count(*)::int n FROM raid_completions WHERE raid_id = ANY($1)', [[raids.tg, raids.race]]);
    check(rows[0].n === 2, 'one completion row per (wallet, raid)', rows);
    const led = await sql(`SELECT count(*)::int n FROM honey_ledger WHERE source = 'raid' AND ref_id = ANY($1)`, [[String(raids.tg), String(raids.race)]]);
    check(led[0].n === 2, 'one ledger row per (wallet, raid)', led);
  });

  await test('raids', 'dead raids, mismatched or forged tokens, absurd rewards: refused', async () => {
    const before = (await alice.ledger()).length;
    const start = (id) => alice.post('/raids/session/start', { wallet_address: alice.wallet, raid_id: id });
    const done = (id, token = raidToken(alice.wallet, id)) => alice.post('/raids/complete', { wallet_address: alice.wallet, raid_id: id, session_token: token });
    check((await start(raids.expired)).status === 400, 'expired raid: no session', null);
    check((await done(raids.expired)).status === 400, 'expired raid: no pay', null);
    check((await done(raids.inactive)).status === 400, 'inactive raid: no pay', null);
    const huge = await done(raids.huge);
    check(huge.status === 400 && /configuration/i.test(huge.body.error), 'a 5,000-honey raid → 400 (rewards above 1,000 are refused)', huge);
    check((await done(999999)).status === 400, 'unknown raid → 400', null);
    check((await alice.post('/raids/tg-claim', { wallet_address: alice.wallet, raid_id: raids.expired })).status === 400, 'Telegram claim of an expired raid → 400', null);
    check((await done(raids.like, raidToken(alice.wallet, raids.web))).status === 403, "another raid's token → 403", null);
    check((await done(raids.like, raidToken(bob.wallet, raids.like))).status === 403, "Bob's token → 403", null);
    check((await bob.post('/raids/complete', { wallet_address: alice.wallet, raid_id: raids.like, session_token: raidToken(alice.wallet, raids.like) })).status === 403, "Bob's session naming Alice → 403", null);
    check((await alice.req('POST', '/raids/complete', { wallet_address: alice.wallet, raid_id: raids.like, session_token: raidToken(alice.wallet, raids.like) }, { auth: false })).status === 401, 'no session → 401', null);
    const forged = (() => { const iat = Date.now() - 120_000; return sign({ type: 'raid_session', sid: 'x', wallet: alice.lower, raid_id: String(raids.like), iat, exp: iat + 1800e3 }, crypto.createHash('sha256').update('guess').digest()); })();
    check((await done(raids.like, forged)).status === 401, 'a raid token signed with another secret → 401', null);
    const stale = (() => { const iat = Date.now() - 31 * 60_000; return sign({ type: 'raid_session', sid: 'y', wallet: alice.lower, raid_id: String(raids.like), iat, exp: iat + 30 * 60_000 }); })();
    check((await done(raids.like, stale)).status === 401, 'an expired raid session (31 min) → 401', null);
    check((await done(raids.like, alice.token)).status === 401, 'the wallet session as a raid token → 401', null);
    check((await alice.ledger()).length === before, 'nothing ledgered', null);
  });

  await test('raids', 'X verification: what the server enforces (honor system)', async () => {
    const x = await alice.post('/auth/twitter/start', { wallet_address: alice.wallet });
    check(x.status === 503, 'X linking fails closed in the sandbox (no Twitter keys) → 503', x);
    const r = await alice.post('/raids/complete', { wallet_address: alice.wallet, raid_id: raids.like, session_token: raidToken(alice.wallet, raids.like) });
    // verification_type is stored, but no route verifies it (verifyRaidParticipation is unused):
    // a "like" raid pays like any other, once, after the timer.
    check(r.status === 200 && r.body.points_awarded === 12, "a 'like'-verified raid pays without an X link (verification is not enforced)", r.body);
  });

  // ═══════════════════════════════ spending ═══════════════════════════════
  await test('spend', 'a cosmetic is charged exactly once, lands in the inventory, and can be worn', async () => {
    await alice.get(`/cosmetics/inventory/${alice.wallet}`);
    await alice.get(`/cosmetics/equipped/${alice.wallet}`);
    const before = await alice.points();
    const r = await alice.post('/cosmetics/purchase', { wallet_address: alice.wallet, cosmetic_id: 3, honey_cost: 0, price: 0 });
    check(r.status === 200 && num(r.body.new_balance) === num(before.total_points - 150), 'Yellow Ring: 150 off (catalog price, body price ignored)', r.body);
    const led = (await alice.ledger()).filter((x) => x.source === 'cosmetic_purchase' && x.ref_id === '3');
    check(led.length === 1 && num(led[0].delta) === -150, 'one ledger row: −150 cosmetic_purchase', led);
    const inv = await alice.get(`/cosmetics/inventory/${alice.wallet}`);
    check(inv.cache !== 'HIT' && inv.body.items?.some((i) => Number(i.cosmetic_id) === 3), 'inventory shows it on the next read', inv.body);
    const tx = await sql('SELECT honey_spent FROM cosmetics_transactions WHERE lower(wallet_address) = $1 AND cosmetic_id = 3', [alice.lower]);
    check(tx.length === 1 && Number(tx[0].honey_spent) === 150, 'cosmetics_transactions: one row', tx);
    const twice = await alice.post('/cosmetics/purchase', { wallet_address: alice.wallet, cosmetic_id: 3 });
    check(twice.status === 400 && /already own/i.test(twice.body.error), 'buying it again → 400, no charge', twice);
    check((await alice.points()).total_points === r.body.new_balance, 'balance unchanged by the repeat', null);
    const eq = await alice.post('/cosmetics/equip', { wallet_address: alice.wallet, cosmetic_id: 3, cosmetic_type: 'ring' });
    check(eq.status === 200, 'equip the ring', eq);
    const worn = await alice.get(`/cosmetics/equipped/${alice.wallet}`);
    check(worn.cache !== 'HIT' && Number(worn.body.equipped?.ring?.id) === 3, 'equipped shows it on the next read', worn.body);
    check((await alice.post('/cosmetics/equip', { wallet_address: alice.wallet, cosmetic_id: 12, cosmetic_type: 'banner' })).status === 403, 'equipping an item not owned → 403', null);
    const wrongSlot = await alice.post('/cosmetics/equip', { wallet_address: alice.wallet, cosmetic_id: 3, cosmetic_type: 'banner' });
    check(wrongSlot.status === 400, 'a ring worn as a banner → 400', wrongSlot);
    check((await alice.post('/cosmetics/purchase', { wallet_address: alice.wallet, cosmetic_id: 99999 })).status === 404, 'unknown item → 404', null);
    await sql(`UPDATE profiles SET equipped_ring_id = 8, equipped_banner_id = 16 WHERE wallet_address = $1`, [alice.wallet]);
  });

  await test('spend', 'not enough honey: refused, nothing charged', async () => {
    const before = await sam.points();
    const r = await sam.post('/cosmetics/purchase', { wallet_address: sam.wallet, cosmetic_id: 13 });
    check(r.status === 400 && /not enough/i.test(r.body.error), 'Sam (18 honey) buying a 200 banner → 400', r);
    check((await sam.points()).total_points === before.total_points, 'balance unchanged', null);
    check((await sam.ledger()).length === 1, 'no ledger row beyond the opening one', null);
    check((await sql('SELECT count(*)::int n FROM user_cosmetics WHERE lower(wallet_address) = $1', [sam.lower]))[0].n === 0, 'no inventory row', null);
  });

  await test('spend', 'double-clicks and parallel purchases cannot overspend', async () => {
    const five = await Promise.all(Array.from({ length: 5 }, () => bob.post('/cosmetics/purchase', { wallet_address: bob.wallet, cosmetic_id: 13 })));
    check(five.filter((r) => r.status === 200).length === 1, 'five clicks on one item: one purchase', five.map((r) => r.status));
    check((await bob.ledger()).filter((x) => x.source === 'cosmetic_purchase' && x.ref_id === '13').length === 1, 'one charge', null);
    // bring Bob to 320 honey through the admin route (ledgered), then buy 150 + 150 + 200 at once
    const now = (await bob.points()).total_points;
    const adj = await dana.post('/admin/adjust-points', { wallet_address: bob.wallet, amount: num(320 - now), reason: 'e2e: set up an overspend attempt' });
    check(adj.status === 200 && num(adj.body.total_points) === 320, 'Bob set to 320 (admin, ledgered)', adj.body);
    const buys = await Promise.all([1, 3, 12].map((id) => bob.post('/cosmetics/purchase', { wallet_address: bob.wallet, cosmetic_id: id })));
    const ok = buys.filter((r) => r.status === 200);
    const spent = (await bob.ledger()).filter((x) => x.source === 'cosmetic_purchase' && ['1', '3', '12'].includes(x.ref_id));
    const after = await bob.points();
    check(after.total_points >= 0 && num(-sum(spent)) <= 320, `never more than the 320 he had (spent ${-sum(spent)})`, buys.map((r) => [r.status, r.body.error]));
    check(ok.length === spent.length && ok.length >= 1 && num(after.total_points) === num(320 + sum(spent)), 'one charge per delivered item, balance = 320 − charges', { ok: ok.length, spent: spent.length, after: after.total_points });
    const owned = await sql('SELECT count(*)::int n FROM user_cosmetics WHERE lower(wallet_address) = $1 AND cosmetic_id = ANY($2::bigint[])', [bob.lower, [1, 3, 12]]);
    check(owned[0].n === ok.length, 'inventory rows = purchases', owned);
  });

  await test('spend', 'store tokens, NFTs and BEARdrops refuse safely here (payout keys absent); nobody else can spend your honey', async () => {
    const before = (await alice.ledger()).length;
    const t = await alice.post('/store/purchase-token', { wallet_address: alice.wallet, token_type: 'SPIFFY' });
    check(t.status === 503, 'token purchase → 503 (store not configured), before any charge', t);
    check((await bob.post('/store/purchase-token', { wallet_address: alice.wallet, token_type: 'SPIFFY' })).status === 403, "Bob spending Alice's honey → 403", null);
    check((await bob.post('/cosmetics/purchase', { wallet_address: alice.wallet, cosmetic_id: 12 })).status === 403, "Bob buying a cosmetic on Alice's honey → 403", null);
    check((await bob.post('/store/request-nft', { wallet_address: alice.wallet, nft_token_id: 'A'.repeat(64) })).status === 403, "Bob requesting an NFT on Alice's honey → 403", null);
    const fake = await alice.post('/store/request-nft', { wallet_address: alice.wallet, nft_token_id: '0'.repeat(64) });
    check(fake.status === 400, 'an NFT the store does not hold → 400, no charge', fake);
    const claim = await alice.post('/beardrops/claim', { wallet_address: alice.wallet });
    check(claim.status === 503, 'BEARdrops claim → 503 (airdrop not configured)', claim);
    check((await bob.post('/beardrops/claim', { wallet_address: alice.wallet })).status === 403, "Bob claiming Alice's BEARdrop → 403", null);
    check((await alice.ledger()).length === before, "Alice's ledger unchanged", null);
  });

  // ═══════════════════════════════ admin ═══════════════════════════════
  await test('admin', 'honey admin routes refuse everyone but admins (and masters, where it says so)', async () => {
    const before = (await bob.ledger()).length;
    const routes = [
      ['/admin/adjust-points', { wallet_address: alice.wallet, amount: 100000 }],
      ['/admin/bulk-points', { wallets: [alice.wallet], amount: 100000 }],
      ['/admin/set-user-points', { target_wallet: alice.wallet, points: 100000 }],
      ['/admin/reset-wallet', { target_wallet: bob.wallet }],
      ['/admin/reset-economy', { reset_amount: 100000 }],
      ['/admin/merge-ghost-wallets', {}],
      [`/games/reset-daily/${alice.wallet}`, {}],
      ['/admin/ban-user', { wallet_address: bob.wallet }],
      ['/admin/game-settings', { settings: { max_daily_minutes: 9999 } }],
      ['/memes/reset-week', {}],
    ];
    for (const [route, body] of routes) {
      check((await alice.post(route, body)).status === 403, `Alice (no role) ${route} → 403`, null);
      check((await alice.req('POST', route, body, { auth: false })).status === 401, `no session ${route} → 401`, null);
    }
    await sql(`UPDATE admin_roles SET role = 'moderator' WHERE wallet_address = $1`, [dana.wallet]);
    check((await dana.post('/admin/adjust-points', { wallet_address: bob.wallet, amount: 5 })).status === 403, 'a moderator → 403', null);
    await sql(`UPDATE admin_roles SET role = 'admin' WHERE wallet_address = $1`, [dana.wallet]);
    for (const [route, body] of routes.slice(2, 6)) {
      check((await dana.post(route, body)).status === 403, `admin (not master) ${route} → 403`, null);
    }
    const add = await dana.post('/admin/adjust-points', { wallet_address: bob.wallet, amount: 7, reason: 'e2e bonus' });
    check(add.status === 200, 'admin +7 to Bob', add);
    const rows = (await bob.ledger()).slice(before);
    check(rows.length === 1 && num(rows[0].delta) === 7 && rows[0].source === 'manual_add' && rows[0].actor === dana.lower && rows[0].reason === 'e2e bonus', 'one ledger row: +7 manual_add, actor Dana, reason kept', rows);
    const over = await dana.post('/admin/adjust-points', { wallet_address: bob.wallet, amount: -1e7 });
    check(over.status === 400, 'taking more than Bob has → 400', over);
    check((await bob.ledger()).length === before + 1, 'and no ledger row for it', null);
  });

  // ═══════════════════════════════ memes ═══════════════════════════════
  await test('meme', 'the removed meme contest pays nothing: entering and voting are closed (410)', async () => {
    const form = (name, wallet = alice.wallet) => {
      const f = new FormData();
      f.append('wallet_address', wallet);
      f.append('file_name', name);
      f.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), name);
      return f;
    };
    const before = (await alice.ledger()).length;
    const r = await alice.post('/memes/submit', form(`e2e-${Date.now()}.png`));
    check(r.status === 410, 'a meme submission → 410 (contest closed)', r);
    const v = await alice.post('/memes/1/vote', { wallet_address: alice.wallet });
    check(v.status === 410, 'a vote → 410 (contest closed)', v);
    const c = await carol.post('/memes/submit', form('carol.png', carol.wallet));
    check(c.status === 410, 'Carol → 410 as well', c.status);
    const after = await alice.ledger();
    check(after.length === before && !after.some((x) => /meme/.test(x.source || '')), 'no honey moved', after.slice(before));
    const reads = await alice.get('/memes/current-week');
    check(reads.status === 200, 'old links still read (current-week → 200)', reads.status);
  });

  // ═══════════════════════════════ the ledger ═══════════════════════════════
  await test('ledger', 'every movement is in honey_ledger once; balances, breakdown and activity log agree with it', async () => {
    for (const p of WALLETS) {
      const rows = await p.ledger();
      const pts = await p.points();
      check(num(pts.total_points) === sum(rows), `${p.key}: total_points (${pts.total_points}) = ledger sum (${sum(rows)})`, rows.map((r) => [r.source, r.delta]));
      let run = 0;
      const broken = rows.filter((r) => { run = num(run + Number(r.delta)); return r.balance_after !== null && num(r.balance_after) !== run; });
      check(broken.length === 0, `${p.key}: every balance_after is the running sum`, broken);
      if (p === carol) { check(rows.length === 0, 'carol: no ledger rows at all', rows); continue; }
      const o = OPENING[p.key];
      const by = (src) => sum(rows.filter((r) => r.source === src));
      check(num(pts.raiding_points) === num(o.raiding + by('raid')), `${p.key}: raiding_points = opening + raid credits (${pts.raiding_points})`, [o.raiding, by('raid')]);
      check(num(pts.games_points) === num(o.games + by('game')), `${p.key}: games_points = opening + game credits (${pts.games_points})`, [o.games, by('game')]);
      const plays = await sql('SELECT COALESCE(sum(points_earned), 0) s FROM daily_game_plays WHERE lower(wallet_address) = $1', [p.lower]);
      check(num(plays[0].s) === by('game'), `${p.key}: daily_game_plays points = game ledger (${by('game')})`, plays);
      const done = await sql(`SELECT COALESCE(sum(points_awarded), 0) s, count(*)::int n FROM raid_completions WHERE lower(wallet_address) = $1 AND raid_id IN (SELECT id FROM raids WHERE description LIKE 'E2E honey%')`, [p.lower]);
      check(num(done[0].s) === by('raid') && done[0].n === rows.filter((r) => r.source === 'raid').length, `${p.key}: raid completions = raid ledger rows`, done);
      // honey_points_activity: one row per earning (games, raids, memes), same amount
      const act = await sql('SELECT activity_type, points FROM honey_points_activity WHERE lower(wallet_address) = $1', [p.lower]);
      for (const [type, src] of [['game', 'game'], ['raid', 'raid'], ['meme_submission', 'meme_submission_reward']]) {
        const a = act.filter((x) => x.activity_type === type);
        const l = rows.filter((r) => r.source === src);
        check(a.length === l.length && sum(a, 'points') === sum(l), `${p.key}: ${type} activity = ledger (${a.length} rows, ${sum(a, 'points')} vs ${l.length}, ${sum(l)})`, null);
      }
    }
    const dup = await sql('SELECT idempotency_key, count(*)::int n FROM honey_ledger WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1');
    check(dup.length === 0, 'no idempotency key twice', dup);
  });

  // ═══════════════════════════════ one number for "honey from raids" ═══════════════════════════════
  await test('consistency', 'the Raids page figure and the raid board show the same honey-from-raids for everyone', async () => {
    const lb = (await carol.get('/raids/leaderboard')).body.leaderboard || [];
    const keys = lb.map((r) => r.wallet_address.toLowerCase());
    check(new Set(keys).size === keys.length, 'one row per wallet (letter cases merged)', keys);
    for (const row of lb) {
      const p = (await carol.get(`/points/${row.wallet_address}`)).body;
      check(num(row.total_points) === num(p.raiding_points), `${row.display_name || row.wallet_address}: board ${row.total_points} = /api/points raiding_points ${p.raiding_points}`, null);
      const n = await sql('SELECT count(*)::int n FROM raid_completions WHERE lower(wallet_address) = $1', [row.wallet_address.toLowerCase()]);
      check(row.total_raids === n[0].n, `${row.display_name || row.wallet_address}: ${n[0].n} raids`, row);
    }
    const sorted = lb.every((r, k) => k === 0 || num(lb[k - 1].total_points) >= num(r.total_points));
    check(sorted, 'ranked by honey from raids', lb.map((r) => r.total_points));
  });

  // leave the shared personas as the other tests expect them
  for (const [k, [ring, banner]] of Object.entries(SEED_EQUIPPED)) {
    await sql(`UPDATE profiles SET equipped_ring_id = $2, equipped_banner_id = $3 WHERE wallet_address = $1`, [PERSONAS[k].wallet, ring, banner]);
  }
  await sql(`UPDATE admin_roles SET role = 'admin', is_active = TRUE WHERE wallet_address = $1`, [dana.wallet]);

  const failed = results.filter((r) => r.failures.length);
  const checks = results.reduce((a, r) => a + r.checks, 0);
  console.log(`\n${results.length - failed.length}/${results.length} flows passed (${checks} checks)`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });

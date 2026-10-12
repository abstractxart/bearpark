// End-to-end checks for every social feature, against a RUNNING sandbox
// (node run.js). Requests go through the front server exactly as the browser's
// do; the sandbox control port is used only to set preconditions (roles, clean
// follow state) and to read the database back.
//
//   node e2e-social.js                 all groups
//   node e2e-social.js board wall      only some groups (board, profile, wall, follows, notes, cache, misc)
//
// Exit code 0 when everything passes.

const fs = require('fs');
const path = require('path');
const { mintToken } = require('./mint');
const { PERSONAS } = require('./personas');

const BASE = process.env.SANDBOX_URL || 'http://localhost:8810';
const control = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.SANDBOX_DATA || '.data', 'control.json'), 'utf8'));
const CONTROL = `http://127.0.0.1:${control.port}/__sandbox`;

async function sql(text, params = []) {
  const r = await fetch(`${CONTROL}/sql`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sandbox-key': control.key }, body: JSON.stringify({ sql: text, params }) });
  const body = await r.json();
  if (!r.ok) throw new Error(`control sql failed: ${body.error}`);
  return body.rows;
}

class Person {
  constructor(key) {
    this.key = key;
    this.p = PERSONAS[key];
    this.wallet = this.p.wallet;
    this.token = mintToken(this.wallet);
  }
  async req(method, url, body, { auth = true } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) headers.authorization = `Bearer ${this.token}`;
    const r = await fetch(`${BASE}/api${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json, cache: r.headers.get('x-cache') };
  }
  get(url) { return this.req('GET', url); }
  post(url, body = {}) { return this.req('POST', url, body); }
  del(url, body = {}) { return this.req('DELETE', url, body); }
  notes() { return this.get(`/notifications/${this.wallet}`).then((r) => r.body.notifications || []); }
}

const alice = new Person('alice');
const bob = new Person('bob');
const carol = new Person('carol');
const dana = new Person('dana');

// ── a tiny harness ──
const results = [];
let current = null;
function check(cond, what, detail) {
  current.checks += 1;
  if (!cond) {
    current.failures.push(detail === undefined ? what : `${what} — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}`);
  }
  return !!cond;
}
async function test(group, name, fn) {
  if (ONLY.length && !ONLY.includes(group)) return;
  current = { group, name, checks: 0, failures: [] };
  const t0 = Date.now();
  try { await fn(); } catch (err) { current.failures.push(`threw: ${err.stack || err.message}`); }
  current.ms = Date.now() - t0;
  results.push(current);
  const mark = current.failures.length ? '✗' : '✓';
  console.log(`${mark} [${group}] ${name} (${current.checks} checks, ${current.ms} ms)`);
  for (const f of current.failures) console.log(`    - ${f}`);
}
const ONLY = process.argv.slice(2);
const newest = (notes, type, pred = () => true) => notes.find((n) => n.type === type && pred(n.data || {}));
const RX = ['like', 'laugh', 'heart', 'cry', 'thumbs_down', 'troll'];
const stamp = () => new Date().toISOString().slice(11, 19);

async function main() {
  const health = await fetch(`${CONTROL}/health`, { headers: { 'x-sandbox-key': control.key } }).then((r) => r.json()).catch(() => null);
  if (!health?.ok) throw new Error(`sandbox is not running at ${CONTROL} (start it with: node run.js)`);
  console.log(`sandbox up (built ${health.built_at}); testing ${BASE}\n`);

  // Clean slate for the parts that depend on state.
  await sql(`DELETE FROM follows WHERE (follower_wallet = $1 AND following_wallet = $2) OR (follower_wallet = $2 AND following_wallet = $1)`, [alice.wallet, bob.wallet]);
  await sql(`UPDATE admin_roles SET role = 'admin', is_active = TRUE WHERE wallet_address = $1`, [dana.wallet]);
  await sql(`UPDATE profiles SET display_name = 'Alice' WHERE wallet_address = $1`, [alice.wallet]);
  await sql(`DELETE FROM profiles WHERE wallet_address = $1`, [carol.wallet]);

  // ─────────────────────────────── auth ───────────────────────────────
  await test('misc', 'writes need the signed session of the wallet they name', async () => {
    const anon = await alice.req('POST', '/bulletin/posts', { wallet_address: alice.wallet, content: 'x' }, { auth: false });
    check(anon.status === 401, 'no token → 401', anon);
    const spoof = await bob.post('/bulletin/posts', { wallet_address: alice.wallet, content: 'pretending to be Alice' });
    check(spoof.status === 403, "Bob naming Alice's wallet → 403", spoof);
    const forged = await alice.req('POST', '/follow', { follower_wallet: alice.wallet, following_wallet: bob.wallet }, { auth: false });
    check(forged.status === 401, 'follow without a token → 401', forged);
  });

  // ─────────────────────────────── bulletin board ───────────────────────────────
  let postA;
  let postB;
  await test('board', 'post without a preview; both people see it on their next read (cache dropped)', async () => {
    const warm = await bob.get('/bulletin/posts?limit=20&offset=0'); // fill the read cache first
    check(warm.status === 200 && Array.isArray(warm.body), 'feed loads', warm.status);
    const again = await bob.get('/bulletin/posts?limit=20&offset=0');
    check(again.cache === 'HIT', 'second read is a cache hit', again.cache);
    const r = await alice.post('/bulletin/posts', { wallet_address: alice.wallet, content: `E2E post from Alice ${stamp()}` });
    check(r.status === 200 && r.body?.id, 'post created', r);
    postA = r.body;
    check(postA.author_name === 'Alice', 'author_name from the profile', postA.author_name);
    check(postA.comment_count === 0, 'comment_count starts at 0', postA.comment_count);
    for (const who of [alice, bob]) {
      const feed = await who.get('/bulletin/posts?limit=20&offset=0');
      check(feed.body?.[0]?.id === postA.id, `${who.key} sees it at the top on the next read`, feed.body?.[0]?.id);
      check(feed.body?.[0]?.reactions && typeof feed.body[0].reactions.counts === 'object', `${who.key}: reactions embedded in the feed`, feed.body?.[0]);
      check(feed.body?.[0]?.reaction_count === 0, `${who.key}: reaction_count 0`, feed.body?.[0]?.reaction_count);
    }
  });

  await test('board', 'link preview (YouTube and website) and a post that carries one', async () => {
    const yt = await alice.get(`/link-preview?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}`);
    check(yt.status === 200 && yt.body?.type === 'youtube' && yt.body?.title, 'YouTube preview', yt.body);
    check(!/maxresdefault/.test(yt.body?.image || ''), 'a thumbnail every video has (not maxresdefault)', yt.body?.image);
    const short = await alice.get(`/link-preview?url=${encodeURIComponent('https://youtube.com/shorts/jNQXAC9IVRw')}`);
    check(short.body?.type === 'youtube', 'Shorts links are YouTube too', short.body);
    const js = await alice.get(`/link-preview?url=${encodeURIComponent('javascript:alert(1)')}`);
    check(js.status === 400, 'non-http links are refused', js);
    const site = await alice.get(`/link-preview?url=${encodeURIComponent('https://xrpl.org/')}`);
    check(site.status === 200 && site.body?.url === 'https://xrpl.org/' && site.body?.title, 'website preview (or the host as a fallback)', site.body);
    const junk = await alice.get('/link-preview?url=not-a-url');
    check(junk.status === 400 || (junk.status === 200 && junk.body?.title), 'a malformed url is answered, not a crash', junk);
    const none = await alice.get('/link-preview');
    check(none.status === 400, 'missing url → 400', none);
    const still = await alice.get('/bulletin/posts?limit=1');
    check(still.status === 200, 'server still up after the malformed url', still.status);
    const r = await bob.post('/bulletin/posts', { wallet_address: bob.wallet, content: `Watch this https://www.youtube.com/watch?v=dQw4w9WgXcQ ${stamp()}`, link_preview: yt.body });
    check(r.status === 200 && r.body?.link_preview?.type === 'youtube', 'post stores the preview', r.body);
    postB = r.body;
    const feed = await alice.get('/bulletin/posts?limit=5');
    check(feed.body?.find((p) => p.id === postB.id)?.link_preview?.title === yt.body.title, 'preview comes back in the feed', feed.body?.[0]);
  });

  await test('board', 'post validation: empty, oversized, wrong types', async () => {
    const empty = await alice.post('/bulletin/posts', { wallet_address: alice.wallet, content: '   ' });
    check(empty.status === 400, 'blank content → 400', empty);
    const big = await alice.post('/bulletin/posts', { wallet_address: alice.wallet, content: 'x'.repeat(5001) });
    check(big.status === 400, '5,001 characters → 400', big.status);
    const obj = await alice.post('/bulletin/posts', { wallet_address: alice.wallet, content: { evil: true } });
    check(obj.status === 400, 'object content → 400', obj.status);
  });

  await test('board', 'react / un-react with all six types; counts, embedded reactions and notifications', async () => {
    await sql('DELETE FROM notifications WHERE wallet_address = $1 AND type = $2', [alice.wallet, 'bulletin_post_reaction']);
    for (const type of RX) {
      const r = await bob.post(`/bulletin/posts/${postA.id}/react`, { wallet_address: bob.wallet, reaction_type: type });
      check(r.status === 200 && r.body.action === 'added' && r.body.counts[type] === 1, `add ${type}`, r.body);
    }
    const feed = await alice.get('/bulletin/posts?limit=5');
    const mine = feed.body.find((p) => p.id === postA.id);
    check(mine?.reaction_count === 6, 'reaction_count 6 in the feed right away', mine?.reaction_count);
    check(JSON.stringify(mine?.reactions?.userReactions?.[bob.wallet]?.sort()) === JSON.stringify([...RX].sort()), "Bob's six in userReactions", mine?.reactions);
    const rx = await alice.get(`/bulletin/posts/${postA.id}/reactions`);
    check(Object.values(rx.body.counts || {}).reduce((a, b) => a + b, 0) === 6, 'GET …/reactions agrees', rx.body);
    const notes = (await alice.notes()).filter((n) => n.type === 'bulletin_post_reaction' && n.data.postId === String(postA.id));
    check(notes.length >= 1, 'Alice gets bulletin_post_reaction', notes.length);
    check(notes.length <= 1, 'one notification for a burst of reactions, not one per tap', notes.length);
    check(notes[0]?.data?.wallet === bob.wallet && notes[0]?.data?.displayName === 'Bob', 'it names Bob', notes[0]?.data);
    for (const type of RX) {
      const r = await bob.post(`/bulletin/posts/${postA.id}/react`, { wallet_address: bob.wallet, reaction_type: type });
      check(r.status === 200 && r.body.action === 'removed' && !r.body.counts[type], `remove ${type}`, r.body);
    }
    const after = await bob.get('/bulletin/posts?limit=5');
    check(after.body.find((p) => p.id === postA.id)?.reaction_count === 0, 'back to 0 for everyone', after.body.find((p) => p.id === postA.id));
    const bad = await bob.post(`/bulletin/posts/${postA.id}/react`, { wallet_address: bob.wallet, reaction_type: 'angry' });
    check(bad.status === 400, 'unknown reaction type → 400', bad);
    const own = await alice.post(`/bulletin/posts/${postA.id}/react`, { wallet_address: alice.wallet, reaction_type: 'heart' });
    check(own.status === 200, 'reacting to your own post works', own);
    const selfNote = (await alice.notes()).filter((n) => n.type === 'bulletin_post_reaction' && n.data.wallet === alice.wallet);
    check(selfNote.length === 0, 'no notification for reacting to yourself', selfNote.length);
    await alice.post(`/bulletin/posts/${postA.id}/react`, { wallet_address: alice.wallet, reaction_type: 'heart' });
    const missing = await bob.post('/bulletin/posts/999999/react', { wallet_address: bob.wallet, reaction_type: 'like' });
    check(missing.status === 404, 'reacting to a post that does not exist → 404', missing);
  });

  let cBob;
  let cReply;
  let cBobReply;
  await test('board', 'comment, reply, reply-to-self; counts and notifications', async () => {
    const warm = await alice.get(`/bulletin/posts/${postA.id}/comments`);
    check(Array.isArray(warm.body) && warm.body.length === 0, 'no comments yet', warm.body);
    const r = await bob.post('/bulletin/comments', { post_id: postA.id, wallet_address: bob.wallet, content: 'Nice one Alice' });
    check(r.status === 200 && r.body?.id && r.body.author_name === 'Bob', 'Bob comments', r);
    cBob = r.body;
    const list = await alice.get(`/bulletin/posts/${postA.id}/comments`);
    check(list.body?.some((c) => c.id === cBob.id), 'Alice sees it on her next read (cache dropped)', list.body);
    check(list.body?.[0]?.reactions && typeof list.body[0].reactions.counts === 'object', 'reactions embedded in comments', list.body?.[0]);
    const n1 = newest(await alice.notes(), 'bulletin_comment', (d) => d.commentId === String(cBob.id));
    check(n1 && n1.data.postId === String(postA.id) && n1.data.wallet === bob.wallet && n1.read === false, 'Alice: bulletin_comment with postId/commentId', n1);
    const rr = await alice.post('/bulletin/comments', { post_id: postA.id, wallet_address: alice.wallet, content: 'Thanks Bob!', parent_id: cBob.id });
    check(rr.status === 200 && String(rr.body?.parent_id) === String(cBob.id), 'Alice replies', rr.body);
    cReply = rr.body;
    const n2 = newest(await bob.notes(), 'bulletin_reply', (d) => d.commentId === String(cReply.id));
    check(n2 && n2.data.postId === String(postA.id), 'Bob: bulletin_reply', n2);
    const self = await bob.post('/bulletin/comments', { post_id: postA.id, wallet_address: bob.wallet, content: 'and one more thing', parent_id: cBob.id });
    cBobReply = self.body;
    const n3 = (await bob.notes()).filter((n) => n.data?.commentId === String(cBobReply.id));
    check(n3.length === 0, 'no notification for replying to yourself', n3);
    const n4 = newest(await alice.notes(), 'bulletin_comment', (d) => d.commentId === String(cBobReply.id));
    check(!n4, 'a reply is not also a "commented on your post"', n4);
    const feed = await bob.get('/bulletin/posts?limit=5');
    check(feed.body.find((p) => p.id === postA.id)?.comment_count === 3, 'comment_count 3 in the feed', feed.body.find((p) => p.id === postA.id)?.comment_count);
    const bad = await bob.post('/bulletin/comments', { post_id: 999999, wallet_address: bob.wallet, content: 'into the void' });
    check(bad.status === 404, 'comment on a missing post → 404', bad);
    const wrongParent = await bob.post('/bulletin/comments', { post_id: postA.id, wallet_address: bob.wallet, content: 'x', parent_id: 501 });
    check(wrongParent.status === 400, 'reply to a comment from another post → 400', wrongParent);
    const tooLong = await bob.post('/bulletin/comments', { post_id: postA.id, wallet_address: bob.wallet, content: 'y'.repeat(2001) });
    check(tooLong.status === 400, '2,001-character comment → 400', tooLong.status);
  });

  await test('board', 'reactions on comments + bulletin_comment_reaction', async () => {
    const r = await alice.post(`/bulletin/comments/${cBob.id}/react`, { wallet_address: alice.wallet, reaction_type: 'laugh' });
    check(r.status === 200 && r.body.action === 'added' && r.body.counts.laugh === 1, 'Alice reacts to Bob\'s comment', r.body);
    const list = await bob.get(`/bulletin/posts/${postA.id}/comments`);
    const c = list.body.find((x) => x.id === cBob.id);
    check(c?.reactions?.counts?.laugh === 1 && c.reactions.userReactions[alice.wallet]?.includes('laugh'), 'embedded on the next read', c?.reactions);
    const n = newest(await bob.notes(), 'bulletin_comment_reaction', (d) => d.commentId === String(cBob.id));
    check(n && n.data.postId === String(postA.id) && Array.isArray(n.data.reactions), 'Bob: bulletin_comment_reaction with postId', n);
    const off = await alice.post(`/bulletin/comments/${cBob.id}/react`, { wallet_address: alice.wallet, reaction_type: 'laugh' });
    check(off.body.action === 'removed', 'un-react', off.body);
    const bad = await alice.post(`/bulletin/comments/${cBob.id}/react`, { wallet_address: alice.wallet, reaction_type: 'nope' });
    check(bad.status === 400, 'unknown type → 400', bad);
  });

  await test('board', 'deletes: own comment (replies cascade), not someone else\'s, moderators can', async () => {
    const steal = await carol.del(`/bulletin/comments/${cReply.id}`, { wallet_address: carol.wallet });
    check(steal.status === 403, "Carol can't delete Alice's reply", steal);
    const gone = await bob.del(`/bulletin/comments/${cBob.id}`, { wallet_address: bob.wallet });
    check(gone.status === 200, 'Bob deletes his comment', gone);
    const list = await alice.get(`/bulletin/posts/${postA.id}/comments`);
    check(Array.isArray(list.body) && list.body.length === 0, 'its replies went with it, visible at once', list.body);
    const feed = await alice.get('/bulletin/posts?limit=5');
    check(feed.body.find((p) => p.id === postA.id)?.comment_count === 0, 'comment_count back to 0', feed.body.find((p) => p.id === postA.id)?.comment_count);
    const missing = await bob.del('/bulletin/comments/999999', { wallet_address: bob.wallet });
    check(missing.status === 404, 'deleting a missing comment → 404', missing);
    // moderator
    const c2 = (await bob.post('/bulletin/comments', { post_id: postA.id, wallet_address: bob.wallet, content: 'spam spam spam' })).body;
    await sql(`UPDATE admin_roles SET role = 'moderator' WHERE wallet_address = $1`, [dana.wallet]);
    const mod = await dana.del(`/bulletin/comments/${c2.id}`, { wallet_address: dana.wallet });
    check(mod.status === 200, 'a moderator removes a comment', mod);
    await sql(`UPDATE admin_roles SET role = 'admin' WHERE wallet_address = $1`, [dana.wallet]);
    // an admin_roles row stored lowercase (as restore-admin-access.sql writes them) still counts
    await sql(`UPDATE admin_roles SET wallet_address = lower(wallet_address) WHERE wallet_address = $1`, [dana.wallet]);
    const c3 = (await bob.post('/bulletin/comments', { post_id: postA.id, wallet_address: bob.wallet, content: 'more spam' })).body;
    const lower = await dana.del(`/bulletin/comments/${c3.id}`, { wallet_address: dana.wallet });
    check(lower.status === 200, 'admin row stored in lowercase still moderates', lower);
    const role = await dana.get(`/admin/check-role/${dana.wallet}`);
    check(role.body?.role?.role === 'admin', 'check-role finds a lowercase admin row (so the UI shows Delete)', role.body);
    await sql(`UPDATE admin_roles SET wallet_address = $1 WHERE lower(wallet_address) = lower($1)`, [dana.wallet]);
  });

  await test('board', 'post deletes: owner, not others, moderators', async () => {
    const steal = await bob.del(`/bulletin/posts/${postA.id}`, { wallet_address: bob.wallet });
    check(steal.status === 403, "Bob can't delete Alice's post", steal);
    const mod = await dana.del(`/bulletin/posts/${postB.id}`, { wallet_address: dana.wallet });
    check(mod.status === 200, "a moderator can remove Bob's post", mod);
    const r = await alice.del(`/bulletin/posts/${postA.id}`, { wallet_address: alice.wallet });
    check(r.status === 200, 'Alice deletes her post', r);
    const feed = await bob.get('/bulletin/posts?limit=20');
    check(!feed.body.some((p) => p.id === postA.id || p.id === postB.id), 'both gone for Bob at once', feed.body.slice(0, 3).map((p) => p.id));
    const again = await alice.del(`/bulletin/posts/${postA.id}`, { wallet_address: alice.wallet });
    check(again.status === 404, 'deleting it again → 404', again);
    const rows = await sql('SELECT count(*)::int AS n FROM bulletin_comments WHERE post_id = $1', [postA.id]);
    check(rows[0].n === 0, 'its comments cascaded', rows);
    const dead = [...await alice.notes(), ...await bob.notes()].filter((n) => n.data?.postId === String(postA.id));
    check(dead.length === 0, 'no bell still links to the deleted post', dead.map((n) => `${n.type}`));
  });

  await test('board', 'pagination: pages do not overlap and cover the board', async () => {
    const total = (await sql('SELECT count(*)::int AS n FROM bulletin_posts'))[0].n;
    const p1 = (await carol.get('/bulletin/posts?limit=20&offset=0')).body;
    const p2 = (await carol.get('/bulletin/posts?limit=20&offset=20')).body;
    check(p1.length === Math.min(20, total), 'page 1 is full', p1.length);
    check(p2.length === Math.max(0, Math.min(20, total - 20)), 'page 2 holds the rest', p2.length);
    check(!p2.some((p) => p1.some((q) => q.id === p.id)), 'no overlap', null);
    check(p1.every((p, i) => i === 0 || Date.parse(p1[i - 1].created_at) >= Date.parse(p.created_at)), 'newest first', null);
    const capped = (await carol.get('/bulletin/posts?limit=1000')).body;
    check(capped.length <= 100, 'limit capped at 100', capped.length);
  });

  // ─────────────────────────────── profiles ───────────────────────────────
  await test('profile', 'edit name / avatar / bio; everyone sees it on the next read', async () => {
    const warm = await bob.get(`/profile/${alice.wallet}`);
    check(warm.body?.profile?.display_name === 'Alice', 'Bob reads Alice', warm.body?.profile?.display_name);
    const avatar = JSON.stringify({ nftId: 'E2E', imageUrl: 'https://ipfs.io/ipfs/bafybeicosh5bbjcq6xc24tmmpuzrvepd37pgef4oa2yw5z7o4gj3vu4osm/pixel-bear-%23777.png', fallbackImageUrl: null, bearName: 'Pixel BEAR #777', isAnimated: false });
    const r = await alice.post('/profile', { wallet_address: alice.wallet, display_name: 'Alice Honeypaw', avatar_nft: avatar });
    check(r.status === 200, 'saved', r);
    const bio = await alice.post('/profile/bio', { wallet_address: alice.wallet, bio: 'Updated by e2e' });
    check(bio.status === 200, 'bio saved', bio);
    for (const who of [alice, bob]) {
      const p = (await who.get(`/profile/${alice.wallet}`)).body.profile;
      check(p.display_name === 'Alice Honeypaw' && p.avatar_nft === avatar && p.bio === 'Updated by e2e', `${who.key} sees the new profile at once`, p);
    }
    const users = (await bob.get('/users')).body.users;
    check(users.find((u) => u.wallet_address === alice.wallet)?.display_name === 'Alice Honeypaw', '/users has the new name', null);
    const board = (await bob.get('/leaderboard?limit=5')).body.leaderboard;
    check(board.find((u) => u.wallet_address === alice.wallet)?.display_name === 'Alice Honeypaw', 'the honey board has the new name', board?.[0]);
    const posts = (await bob.get('/bulletin/posts?limit=100')).body.filter((p) => p.wallet_address === alice.wallet);
    check(posts.length && posts.every((p) => p.author_name === 'Alice Honeypaw' && p.author_avatar === avatar), "old posts show Alice's current name and bear", posts.map((p) => p.author_name));
    const comments = (await bob.get('/bulletin/posts/126/comments')).body.filter((c) => c.wallet_address === alice.wallet);
    check(comments.length && comments.every((c) => c.author_name === 'Alice Honeypaw'), 'and her old comments', comments.map((c) => c.author_name));
    const wall = (await bob.get(`/comments/${PERSONAS.gwen.wallet}`)).body.comments.filter((c) => c.commenter_wallet === alice.wallet);
    check(wall.length && wall.every((c) => c.commenter_name === 'Alice Honeypaw'), 'and her wall comments', wall.map((c) => c.commenter_name));
    await alice.post('/profile', { wallet_address: alice.wallet, display_name: 'Alice', avatar_nft: PERSONAS.alice.avatar });
    await alice.post('/profile/bio', { wallet_address: alice.wallet, bio: PERSONAS.alice.bio });
  });

  await test('profile', 'validation and first-time setup', async () => {
    const long = await alice.post('/profile', { wallet_address: alice.wallet, display_name: 'x'.repeat(51), avatar_nft: null });
    check(long.status === 400, '51-character name → 400', long.status);
    const blank = await alice.post('/profile', { wallet_address: alice.wallet, display_name: '   ', avatar_nft: null });
    check(blank.status === 400, 'blank name → 400', blank);
    const longBio = await alice.post('/profile/bio', { wallet_address: alice.wallet, bio: 'b'.repeat(501) });
    check(longBio.status === 400, '501-character bio → 400', longBio.status);
    const other = await bob.post('/profile', { wallet_address: alice.wallet, display_name: 'Hacked' });
    check(other.status === 403, "Bob can't edit Alice", other.status);
    const none = await carol.get(`/profile/${carol.wallet}`);
    check(none.body?.success && none.body.profile === null, 'Carol has no profile yet', none.body);
    const setup = await carol.post('/profile', { wallet_address: carol.wallet, display_name: 'Carol', avatar_nft: null });
    check(setup.status === 200, 'Carol sets one up', setup);
    const now = (await bob.get(`/profile/${carol.wallet}`)).body.profile;
    check(now?.display_name === 'Carol', 'Bob sees Carol at once', now);
    const dir = (await bob.get('/users')).body.users;
    check(dir.some((u) => u.wallet_address === carol.wallet), 'Carol is in the directory at once', null);
  });

  // ─────────────────────────────── wall ───────────────────────────────
  let wc;
  let wr;
  await test('wall', 'comment and reply on a profile wall + profile_comment / profile_reply', async () => {
    await alice.get(`/comments/${alice.wallet}`); // warm the cache
    const r = await bob.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: bob.wallet, comment_text: 'Hi Alice!', commenter_name: 'Bob', commenter_avatar: PERSONAS.bob.avatar });
    check(r.status === 200 && r.body.comment?.id, 'Bob writes on Alice\'s wall', r);
    wc = r.body.comment;
    const wall = (await alice.get(`/comments/${alice.wallet}`)).body.comments;
    check(wall.some((c) => String(c.id) === String(wc.id)), 'Alice sees it on her next read', wall.map((c) => c.id));
    const n = newest(await alice.notes(), 'profile_comment', (d) => String(d.commentId) === String(wc.id));
    check(n && n.data.profileWallet === alice.wallet && n.data.wallet === bob.wallet && n.read === false, 'Alice: profile_comment notification', n);
    const rr = await alice.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: alice.wallet, comment_text: 'Hey Bob 👋', parent_id: wc.id });
    check(rr.status === 200 && String(rr.body.comment?.parent_id) === String(wc.id), 'Alice replies', rr);
    wr = rr.body.comment;
    const n2 = newest(await bob.notes(), 'profile_reply', (d) => String(d.commentId) === String(wr.id));
    check(n2 && n2.data.profileWallet === alice.wallet, 'Bob: profile_reply notification', n2);
    const own = await alice.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: alice.wallet, comment_text: 'Note to self' });
    const n3 = (await alice.notes()).filter((x) => String(x.data?.commentId) === String(own.body.comment.id));
    check(n3.length === 0, 'no notification for writing on your own wall', n3);
    await alice.del(`/comments/${own.body.comment.id}`, { wallet_address: alice.wallet });
    const spoof = await carol.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: bob.wallet, comment_text: 'as Bob' });
    check(spoof.status === 403, "Carol can't post as Bob", spoof.status);
    const empty = await bob.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: bob.wallet, comment_text: '  ' });
    check(empty.status === 400, 'blank comment → 400', empty);
    const badProfile = await bob.post('/comments', { profile_wallet: 'not-a-wallet', commenter_wallet: bob.wallet, comment_text: 'hi' });
    check(badProfile.status === 400, 'profile_wallet must be an address', badProfile.status);
    const twin = await bob.post('/comments', { profile_wallet: alice.wallet.toLowerCase(), commenter_wallet: bob.wallet, comment_text: 'on a twin wall' });
    check(twin.status === 400, 'a lowercased wall address is refused (no twin walls)', twin.status);
    const spoofName = await bob.post('/comments', { profile_wallet: carol.wallet, commenter_wallet: bob.wallet, comment_text: 'hello Carol', commenter_name: 'Alice' });
    check(spoofName.body?.comment?.commenter_name === 'Bob', 'the name comes from the profile, not the request', spoofName.body?.comment?.commenter_name);
    const spoofNote = newest(await carol.notes(), 'profile_comment', (d) => String(d.commentId) === String(spoofName.body?.comment?.id));
    check(spoofNote?.data?.displayName === 'Bob', "…and so does the notification's", spoofNote?.data);
    await bob.del(`/comments/${spoofName.body?.comment?.id}`, { wallet_address: bob.wallet });
  });

  await test('wall', 'reactions on wall comments + reaction notification', async () => {
    const r = await bob.post(`/comments/${wr.id}/react`, { wallet_address: bob.wallet, reaction_type: 'heart' });
    check(r.status === 200 && r.body.action === 'added' && r.body.counts.heart === 1, 'Bob reacts to Alice\'s reply', r.body);
    const wall = (await alice.get(`/comments/${alice.wallet}`)).body.comments;
    const c = wall.find((x) => String(x.id) === String(wr.id));
    check(c?.reactions?.counts?.heart === 1, 'embedded on the next read', c?.reactions);
    const n = newest(await alice.notes(), 'reaction', (d) => String(d.commentId) === String(wr.id));
    check(n && n.data.profileWallet === alice.wallet && n.data.reactions?.length, 'Alice: reaction notification linking to her wall', n);
    const off = await bob.post(`/comments/${wr.id}/react`, { wallet_address: bob.wallet, reaction_type: 'heart' });
    check(off.body.action === 'removed' && !off.body.counts.heart, 'un-react', off.body);
    for (const type of RX) {
      const x = await bob.post(`/comments/${wr.id}/react`, { wallet_address: bob.wallet, reaction_type: type });
      check(x.body.action === 'added', `add ${type}`, x.body);
    }
    const all = (await alice.get(`/comments/${wr.id}/reactions`)).body;
    check(Object.keys(all.counts || {}).length === 6, 'all six land', all.counts);
    const burst = (await alice.notes()).filter((x) => x.type === 'reaction' && String(x.data.commentId) === String(wr.id));
    check(burst.length === 1, 'one notification per reactor per comment, not one per tap', burst.length);
    for (const type of RX) await bob.post(`/comments/${wr.id}/react`, { wallet_address: bob.wallet, reaction_type: type });
    const missing = await bob.post('/comments/999999/react', { wallet_address: bob.wallet, reaction_type: 'like' });
    check(missing.status === 404, 'reacting to a missing comment → 404', missing);
  });

  await test('wall', 'deletes: author, profile owner, admin; not a stranger', async () => {
    const stranger = await carol.del(`/comments/${wc.id}`, { wallet_address: carol.wallet });
    check(stranger.status === 403, "Carol can't delete Bob's comment on Alice's wall", stranger);
    const c1 = (await bob.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: bob.wallet, comment_text: 'delete me (author)' })).body.comment;
    check((await bob.del(`/comments/${c1.id}`, { wallet_address: bob.wallet })).status === 200, 'author deletes', null);
    const c2 = (await bob.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: bob.wallet, comment_text: 'delete me (owner)' })).body.comment;
    check((await alice.del(`/comments/${c2.id}`, { wallet_address: alice.wallet })).status === 200, 'profile owner deletes', null);
    const c3 = (await bob.post('/comments', { profile_wallet: alice.wallet, commenter_wallet: bob.wallet, comment_text: 'delete me (admin)' })).body.comment;
    check((await dana.del(`/comments/${c3.id}`, { wallet_address: dana.wallet })).status === 200, 'admin deletes', null);
    const parent = await alice.del(`/comments/${wc.id}`, { wallet_address: alice.wallet });
    check(parent.status === 200, 'owner deletes the thread', parent);
    const wall = (await bob.get(`/comments/${alice.wallet}`)).body.comments;
    check(!wall.some((c) => [wc.id, wr.id, c1.id, c2.id, c3.id].map(String).includes(String(c.id))), 'all gone for Bob at once, reply cascaded', wall.map((c) => c.id));
    const missing = await alice.del('/comments/999999', { wallet_address: alice.wallet });
    check(missing.status === 404, 'missing → 404', missing);
    const dead = [...await alice.notes(), ...await bob.notes()].filter((n) => [wc.id, wr.id].map(String).includes(String(n.data?.commentId)) && ['profile_comment', 'profile_reply', 'reaction'].includes(n.type));
    check(dead.length === 0, 'no bell still links to the deleted thread (reply included)', dead.map((n) => n.type));
  });

  // ─────────────────────────────── follows ───────────────────────────────
  await test('follows', 'follow / unfollow both ways; counts, lists, status, notification', async () => {
    const before = { a: (await bob.get(`/follow/counts/${alice.wallet}`)).body, b: (await alice.get(`/follow/counts/${bob.wallet}`)).body };
    await alice.get(`/follow/followers/${bob.wallet}`);
    await alice.get(`/follow/status?follower_wallet=${alice.wallet}&following_wallet=${bob.wallet}`);
    const f = await alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: bob.wallet });
    check(f.status === 200 && f.body.action === 'followed', 'Alice follows Bob', f);
    const st = (await alice.get(`/follow/status?follower_wallet=${alice.wallet}&following_wallet=${bob.wallet}`)).body;
    check(st.isFollowing === true, 'status true at once', st);
    const cb = (await carol.get(`/follow/counts/${bob.wallet}`)).body;
    check(cb.followers === before.b.followers + 1, "Bob's followers +1 for everyone", [before.b, cb]);
    const ca = (await carol.get(`/follow/counts/${alice.wallet}`)).body;
    check(ca.following === before.a.following + 1, "Alice's following +1", [before.a, ca]);
    const list = (await carol.get(`/follow/followers/${bob.wallet}`)).body.followers;
    check(list[0]?.follower_wallet === alice.wallet && list[0]?.display_name === 'Alice', "Alice tops Bob's followers list with her name", list[0]);
    const ing = (await carol.get(`/follow/following/${alice.wallet}`)).body.following;
    check(ing.some((x) => x.following_wallet === bob.wallet), "Bob in Alice's following list", null);
    const n = newest(await bob.notes(), 'follower', (d) => d.wallet === alice.wallet);
    check(n && n.data.displayName === 'Alice' && n.read === false, 'Bob: follower notification', n);
    const back = await bob.post('/follow', { follower_wallet: bob.wallet, following_wallet: alice.wallet });
    check(back.body.action === 'followed', 'Bob follows back', back.body);
    const un = await alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: bob.wallet });
    check(un.body.action === 'unfollowed', 'Alice unfollows', un.body);
    const un2 = await bob.post('/follow', { follower_wallet: bob.wallet, following_wallet: alice.wallet });
    check(un2.body.action === 'unfollowed', 'Bob unfollows', un2.body);
    const end = (await carol.get(`/follow/counts/${bob.wallet}`)).body;
    check(end.followers === before.b.followers && end.following === before.b.following, 'counts back where they were', [before.b, end]);
    const self = await alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: alice.wallet });
    check(self.status === 400, 'self-follow → 400', self);
    const caseTwin = await alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: bob.wallet.toLowerCase() });
    check(caseTwin.status === 400 || caseTwin.body.action === 'followed', 'a lowercased address is refused or treated as the same wallet', caseTwin);
    if (caseTwin.body?.action === 'followed') {
      const st2 = (await alice.get(`/follow/status?follower_wallet=${alice.wallet}&following_wallet=${bob.wallet}`)).body;
      check(st2.isFollowing === true, 'status agrees whatever the letter case', st2);
      await alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: bob.wallet });
    }
    const ghost = await alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: 'rNotARealAddress' });
    check(ghost.status === 400, 'invalid address → 400', ghost.status);
  });

  await test('follows', 'double-tap: two follows at once leave one row', async () => {
    await Promise.all([alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: PERSONAS.kai.wallet }), alice.post('/follow', { follower_wallet: alice.wallet, following_wallet: PERSONAS.kai.wallet })]);
    const rows = await sql('SELECT count(*)::int AS n FROM follows WHERE follower_wallet = $1 AND following_wallet = $2', [alice.wallet, PERSONAS.kai.wallet]);
    check(rows[0].n <= 1, 'at most one follow row', rows[0].n);
    await sql('DELETE FROM follows WHERE follower_wallet = $1 AND following_wallet = $2', [alice.wallet, PERSONAS.kai.wallet]);
  });

  // ─────────────────────────────── notifications ───────────────────────────────
  await test('notes', 'mark read: only your own; one request for all', async () => {
    const mine = await bob.notes();
    const unread = mine.filter((n) => !n.read);
    check(unread.length > 0, 'Bob has unread notifications', unread.length);
    const steal = await alice.post(`/notifications/${unread[0].id}/read`, { wallet_address: alice.wallet });
    check(steal.status === 403 || steal.status === 404, "Alice can't mark Bob's notification", steal);
    const anon = await bob.req('POST', `/notifications/${unread[0].id}/read`, {}, { auth: false });
    check(anon.status === 401, 'needs a session', anon.status);
    const one = await bob.post(`/notifications/${unread[0].id}/read`, { wallet_address: bob.wallet });
    check(one.status === 200, 'Bob marks one', one);
    check((await bob.notes()).find((n) => n.id === unread[0].id)?.read === true, 'it reads as read at once', null);
    const all = await bob.post('/notifications/read-all', { wallet_address: bob.wallet });
    check(all.status === 200, 'read-all', all);
    check((await bob.notes()).every((n) => n.read), 'all read', null);
    const other = await alice.post('/notifications/read-all', { wallet_address: bob.wallet });
    check(other.status === 403, "Alice can't read-all Bob's", other.status);
  });

  // ─────────────────────────────── cosmetics on social surfaces ───────────────────────────────
  await test('misc', 'rings and banners for the people on social surfaces (batched)', async () => {
    const r = await carol.get(`/cosmetics/equipped-batch?wallets=${[alice.wallet, bob.wallet, carol.wallet].join(',')}`);
    check(r.body.equipped[alice.wallet]?.ring?.image_url && r.body.equipped[alice.wallet]?.banner, 'Alice: ring + banner', r.body.equipped[alice.wallet]);
    check(r.body.equipped[bob.wallet]?.ring?.name === 'Green Ring', 'Bob: green ring', r.body.equipped[bob.wallet]);
    check(r.body.equipped[carol.wallet]?.ring === null, 'Carol: none', r.body.equipped[carol.wallet]);
    const x = (await carol.get(`/points/${bob.wallet}`)).body;
    check(x.twitter_connected === true && x.twitter_username === 'bob_bears', 'X link status for the profile', x);
  });

  // ─────────────────────────────── summary ───────────────────────────────
  const failed = results.filter((r) => r.failures.length);
  const checks = results.reduce((a, r) => a + r.checks, 0);
  console.log(`\n${results.length - failed.length}/${results.length} flows passed (${checks} checks)`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });

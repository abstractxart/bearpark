// Fixtures for a fresh sandbox: the park as it might look on a normal week.
// Times are relative to now(), so the board always reads "2h ago", "3d ago".
// Social state is chosen so the tests start clean: Alice and Bob do NOT follow
// each other, and neither has unread notifications from the other.

const fs = require('fs');
const path = require('path');
const { PERSONAS: P } = require('./personas');

const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replace(/'/g, "''")}'`);
const ago = (spec) => `now() - interval ${lit(spec)}`;
const W = (key) => P[key].wallet;

function seedSql() {
  const out = [];
  const sql = (s) => out.push(s.trim());

  // ── cosmetics: production's catalog (public GET /api/cosmetics/catalog) ──
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cosmetics-catalog.json'), 'utf8'));
  sql('DELETE FROM user_cosmetics');
  sql('DELETE FROM cosmetics_transactions');
  sql('UPDATE profiles SET equipped_ring_id = NULL, equipped_banner_id = NULL');
  sql('DELETE FROM cosmetics_catalog');
  sql('ALTER TABLE cosmetics_catalog DROP CONSTRAINT IF EXISTS cosmetics_catalog_rarity_check');
  for (const c of catalog) {
    sql(`INSERT INTO cosmetics_catalog (id, cosmetic_type, name, description, image_url, honey_cost, rarity, is_animated, ring_type, css_gradient, created_at)
         VALUES (${lit(c.id)}, ${lit(c.cosmetic_type)}, ${lit(c.name)}, ${lit(c.description)}, ${lit(c.image_url)}, ${lit(c.honey_cost)}, ${lit(c.rarity)}, ${lit(!!c.is_animated)}, ${lit(c.ring_type)}, ${lit(c.css_gradient)}, ${ago('300 days')})`);
  }
  sql(`SELECT setval(pg_get_serial_sequence('cosmetics_catalog', 'id'), (SELECT max(id) FROM cosmetics_catalog))`);

  // ── people ──
  const order = Object.keys(P);
  order.forEach((key, i) => {
    const p = P[key];
    if (p.name) {
      sql(`INSERT INTO profiles (wallet_address, display_name, avatar_nft, bio, created_at, updated_at)
           VALUES (${lit(p.wallet)}, ${lit(p.name)}, ${lit(p.avatar)}, ${lit(p.bio)}, ${ago(`${120 - i * 9} days`)}, ${ago(`${30 - i} days`)})`);
    }
    if (p.honey) {
      sql(`INSERT INTO honey_points (wallet_address, total_points, raiding_points, games_points, created_at, updated_at)
           VALUES (${lit(p.wallet)}, ${p.honey}, ${p.raiding}, ${Math.round((p.honey - p.raiding) * 10) / 10}, ${ago(`${120 - i * 9} days`)}, ${ago(`${i + 1} hours`)})`);
    }
    if (p.role) {
      sql(`INSERT INTO admin_roles (wallet_address, role, assigned_by, is_active, notes)
           VALUES (${lit(p.wallet)}, ${lit(p.role)}, 'sandbox', TRUE, 'sandbox moderator persona')
           ON CONFLICT (wallet_address) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE`);
    }
  });

  // Cosmetics owned and worn
  const own = [['alice', 8], ['alice', 1], ['alice', 16], ['bob', 2], ['gwen', 30], ['gwen', 19], ['dana', 3], ['paula', 9]];
  for (const [k, id] of own) sql(`INSERT INTO user_cosmetics (wallet_address, cosmetic_id, purchased_at) VALUES (${lit(W(k).toLowerCase())}, ${id}, ${ago('20 days')})`);
  const wear = { alice: [8, 16], bob: [2, null], gwen: [30, 19], dana: [3, null], paula: [9, null] };
  for (const [k, [ring, banner]] of Object.entries(wear)) {
    sql(`UPDATE profiles SET equipped_ring_id = ${lit(ring)}, equipped_banner_id = ${lit(banner)} WHERE wallet_address = ${lit(W(k))}`);
  }

  // X links (the table server.js creates on first use; same definition)
  sql(`CREATE TABLE IF NOT EXISTS twitter_connections (
         wallet_address TEXT PRIMARY KEY, twitter_user_id TEXT NOT NULL UNIQUE, twitter_username TEXT NOT NULL,
         connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  sql(`INSERT INTO twitter_connections (wallet_address, twitter_user_id, twitter_username) VALUES
         (${lit(W('bob').toLowerCase())}, '1000000000000000001', 'bob_bears'),
         (${lit(W('gwen').toLowerCase())}, '1000000000000000002', 'grizzlygwen')`);

  // ── follows (Alice and Bob deliberately NOT following each other) ──
  const follows = [['gwen', 'alice'], ['alice', 'gwen'], ['eve', 'alice'], ['paula', 'alice'], ['alice', 'paula'], ['pete', 'bob'], ['kai', 'bob'],
    ['dana', 'alice'], ['dana', 'bob'], ['dana', 'gwen'], ['sam', 'gwen'], ['bob', 'pete'], ['bob', 'gwen'], ['eve', 'gwen']];
  follows.forEach(([a, b], i) => sql(`INSERT INTO follows (follower_wallet, following_wallet, created_at) VALUES (${lit(W(a))}, ${lit(W(b))}, ${ago(`${40 - i} days`)})`));

  // ── the bulletin board: 26 posts (more than one page of 20) ──
  const posts = [
    ['gwen', 'Who else is grinding Jumpventure this week? I finally cleared level 9 without a hit.', '2 hours'],
    ['alice', 'Morning BEARs! Raid is live, go get that honey.', '5 hours'],
    ['eve', 'This one made my day\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ', '9 hours', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up (Official Video)', description: 'Rick Astley • Watch on YouTube', image: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', type: 'youtube' }],
    ['bob', 'Pixel BEAR #3118 says hi.', '14 hours'],
    ['paula', 'Reminder: BEARdrops snapshot is at 00:00 UTC. Keep your 24h honey above the line.', '1 day'],
    ['pete', 'Read the docs before you ask in chat: https://docs.xrpl.org/', '1 day 3 hours', { url: 'https://docs.xrpl.org/', title: 'XRPL Documentation', description: 'Learn how to build on the XRP Ledger.', image: null, type: 'website' }],
    ['kai', 'gm', '1 day 9 hours'],
    ['dana', 'Board rules: be kind, no scams, no DMs asking for seeds. Mods will remove anything shady.', '2 days'],
    ['gwen', 'Flappy BEAR high score thread. Post yours below.', '2 days 5 hours'],
    ['sam', 'New here. What should I play first?', '3 days'],
    ['alice', 'Shoutout to everyone who joined the raid yesterday — record turnout!', '3 days 6 hours'],
    ['eve', 'Meme of the week entries close Sunday. Get them in.', '4 days'],
    ['bob', 'Anyone trading Pixel BEARs? Looking for a 4-digit number.', '4 days 8 hours'],
    ['paula', 'Snow day in the park. ❄️🐻', '5 days'],
    ['pete', 'Tip: BEAR Pong is way easier on desktop.', '6 days'],
    ['gwen', 'Spinning rings look so good on the honey board.', '7 days'],
    ['kai', 'Just bought my first ring!', '8 days'],
    ['alice', 'Three-day streak on the daily games. Honey stacking.', '9 days'],
    ['dana', 'Welcome to all the new BEARs this week!', '10 days'],
    ['sam', 'Is there a guide for the raids?', '11 days'],
    ['eve', 'Long post incoming.\n\nI have been in the park since the start and honestly the community is what keeps me here. The games are fun, the raids are fun, but the people make it. Thanks all.', '12 days'],
    ['bob', 'Ninja is underrated.', '14 days'],
    ['paula', 'Polar bears > grizzlies. Fight me.', '16 days'],
    ['gwen', 'Grizzlies > polar bears. Obviously.', '16 days 1 hour'],
    ['pete', 'First post on the new board!', '20 days'],
    ['alice', 'Hello Bears! 🐻 Have a great one!', '25 days'],
  ];
  posts.forEach(([k, content, when, preview], i) => {
    const p = P[k];
    sql(`INSERT INTO bulletin_posts (id, wallet_address, author_name, author_avatar, content, link_preview, comment_count, created_at, updated_at)
         VALUES (${100 + posts.length - i}, ${lit(p.wallet)}, ${lit(p.name || 'Anonymous')}, ${p.avatar ? `to_jsonb(${lit(p.avatar)}::text)` : 'NULL'}, ${lit(content)}, ${preview ? `${lit(JSON.stringify(preview))}::jsonb` : 'NULL'}, 0, ${ago(when)}, ${ago(when)})`);
  });
  sql(`SELECT setval(pg_get_serial_sequence('bulletin_posts', 'id'), 200)`);
  const postId = (i) => 100 + posts.length - i; // index in `posts` → id

  // Comments (threaded) — ids fixed so replies can point at them
  const comments = [
    // [id, post index, author, text, parent id, ago]
    [501, 0, 'alice', 'Level 9 is brutal. Congrats!', null, '1 hour'],
    [502, 0, 'gwen', 'Thanks! Took me 40 tries.', 501, '50 minutes'],
    [503, 0, 'kai', 'Teach me your ways', null, '40 minutes'],
    [504, 2, 'pete', 'Classic.', null, '8 hours'],
    [505, 2, 'eve', 'You got rolled 😂', 504, '7 hours'],
    [506, 8, 'alice', '1,204 on Flappy. Beat that.', null, '2 days'],
    [507, 8, 'paula', '1,310 😎', 506, '2 days'],
    [508, 8, 'alice', 'Rematch tonight.', 507, '1 day 23 hours'],
    [509, 9, 'dana', 'Start with Flappy BEAR, then try the raids page.', null, '2 days 20 hours'],
    [510, 9, 'bob', 'And set up your profile so people can find you!', null, '2 days 19 hours'],
    [511, 21, 'gwen', 'Agreed, Ninja is so good.', null, '13 days'],
  ];
  for (const [id, pi, k, text, parent, when] of comments) {
    const p = P[k];
    sql(`INSERT INTO bulletin_comments (id, post_id, wallet_address, content, author_name, author_avatar, parent_id, created_at, updated_at)
         VALUES (${id}, ${postId(pi)}, ${lit(p.wallet)}, ${lit(text)}, ${lit(p.name || 'Anonymous')}, ${p.avatar ? `to_jsonb(${lit(p.avatar)}::text)` : 'NULL'}, ${lit(parent)}, ${ago(when)}, ${ago(when)})`);
  }
  sql(`SELECT setval(pg_get_serial_sequence('bulletin_comments', 'id'), 900)`);

  // Reactions on posts and comments
  const postRx = [[0, 'alice', 'heart'], [0, 'bob', 'like'], [0, 'eve', 'like'], [1, 'gwen', 'like'], [1, 'paula', 'heart'], [2, 'pete', 'laugh'], [2, 'gwen', 'laugh'],
    [2, 'alice', 'troll'], [4, 'alice', 'like'], [7, 'alice', 'like'], [7, 'bob', 'like'], [7, 'gwen', 'heart'], [7, 'eve', 'like'], [13, 'gwen', 'heart'], [20, 'alice', 'heart'], [20, 'dana', 'cry']];
  for (const [pi, k, type] of postRx) sql(`INSERT INTO bulletin_post_reactions (post_id, wallet_address, reaction_type, created_at) VALUES (${postId(pi)}, ${lit(W(k))}, ${lit(type)}, ${ago('1 hour')})`);
  const commentRx = [[501, 'gwen', 'heart'], [507, 'alice', 'thumbs_down'], [507, 'gwen', 'laugh'], [509, 'sam', 'like']];
  for (const [cid, k, type] of commentRx) sql(`INSERT INTO bulletin_comment_reactions (comment_id, wallet_address, reaction_type, created_at) VALUES (${cid}, ${lit(W(k))}, ${lit(type)}, ${ago('30 minutes')})`);

  // ── profile walls ──
  const wall = [
    // [id, profile, author, text, parent, ago]
    [701, 'alice', 'gwen', 'Thanks for carrying the raid yesterday!', null, '1 day'],
    [702, 'alice', 'alice', 'Anytime 🐻', 701, '23 hours'],
    [703, 'alice', 'eve', 'Love the new ring.', null, '3 days'],
    [704, 'bob', 'pete', 'Still want that 4-digit Pixel BEAR?', null, '2 days'],
    [705, 'gwen', 'alice', 'Jumpventure queen 👑', null, '4 days'],
  ];
  for (const [id, owner, k, text, parent, when] of wall) {
    const p = P[k];
    sql(`INSERT INTO profile_comments (id, profile_wallet, commenter_wallet, commenter_name, commenter_avatar, comment_text, parent_id, created_at, updated_at)
         VALUES (${id}, ${lit(W(owner))}, ${lit(p.wallet)}, ${lit(p.name)}, ${lit(p.avatar)}, ${lit(text)}, ${lit(parent)}, ${ago(when)}, ${ago(when)})`);
  }
  sql(`SELECT setval(pg_get_serial_sequence('profile_comments', 'id'), 900)`);
  for (const [cid, k, type] of [[701, 'paula', 'heart'], [703, 'gwen', 'like'], [705, 'gwen', 'heart']]) {
    sql(`INSERT INTO comment_reactions (comment_id, wallet_address, reaction_type, created_at) VALUES (${cid}, ${lit(W(k))}, ${lit(type)}, ${ago('10 hours')})`);
  }

  // ── notifications: Alice has history (read) and one unread from Paula ──
  const note = (k, type, data, when, read) => sql(`INSERT INTO notifications (wallet_address, type, data, is_read, created_at)
     VALUES (${lit(W(k))}, ${lit(type)}, ${lit(JSON.stringify(data))}::jsonb, ${read}, ${ago(when)})`);
  const by = (k) => ({ wallet: W(k), displayName: P[k].name, avatarNft: P[k].avatar });
  note('alice', 'follower', by('gwen'), '30 days', true);
  note('alice', 'follower', by('eve'), '20 days', true);
  note('alice', 'bulletin_post_reaction', { ...by('gwen'), reactions: ['👍'], postId: String(postId(1)) }, '2 hours', true);
  note('alice', 'follower', by('paula'), '6 hours', false);
  note('gwen', 'bulletin_comment', { ...by('alice'), commentText: 'Level 9 is brutal. Congrats!', commentId: '501', postId: String(postId(0)) }, '1 hour', false);

  // ── raids: one live, one finished ──
  sql(`INSERT INTO raids (description, twitter_url, tweet_text, reward, profile_name, profile_handle, expires_at, is_active, verification_type, created_at)
       VALUES ('Like and repost the BEAR Park launch post', 'https://x.com/BearXRPL/status/1900000000000000001', 'BEAR Park is live. Play, raid, earn honey.', 20, 'BearXRPL', '@BearXRPL', now() + interval '3 days', TRUE, 'unverified', ${ago('5 hours')}),
              ('Reply to the weekly AMA thread', 'https://x.com/BearXRPL/status/1900000000000000002', 'AMA: ask us anything about $BEAR', 15, 'BearXRPL', '@BearXRPL', ${ago('2 days')}, TRUE, 'unverified', ${ago('6 days')})`);
  for (const [k, raid] of [['alice', 2], ['gwen', 2], ['paula', 2], ['dana', 2]]) {
    sql(`INSERT INTO raid_completions (wallet_address, raid_id, points_awarded, completed_at)
         SELECT ${lit(W(k).toLowerCase())}, id, 15, ${ago('3 days')} FROM raids WHERE description LIKE 'Reply to the weekly%' LIMIT 1`);
  }

  // ── game boards ──
  const scores = [['alice', 'flappy-bear', 1204], ['paula', 'flappy-bear', 1310], ['gwen', 'bear-jumpventure', 8800], ['bob', 'bear-ninja', 5400], ['eve', 'flappy-bear', 640], ['kai', 'bear-pong', 12]];
  for (const [k, game, score] of scores) {
    sql(`INSERT INTO game_leaderboards (wallet_address, game_id, score, metadata) VALUES (${lit(W(k))}, ${lit(game)}, ${score}, '{}'::jsonb)`);
  }

  // ── merch: a second product next to the setup script's Pocket Jester ──
  sql(`INSERT INTO merch_inventory (id, name, description, price, low_stock_threshold, stock, images)
       VALUES ('honey-hoodie', 'HONEY HOODIE', 'Heavyweight hoodie, embroidered honey pot.', 55, 3, '{"S":4,"M":6,"L":2,"XL":0,"2XL":1}'::jsonb, '[]'::jsonb)
       ON CONFLICT (id) DO NOTHING`);

  return out.join(';\n') + ';\n';
}

module.exports = { seedSql };

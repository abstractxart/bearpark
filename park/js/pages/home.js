// Home: a Metro start screen of live tiles — everything that changes for you
// today, one tap from where it lives.

import { h, icon, fill } from '../core/dom.js';
import { bind, skFigure, avatar, displayName, profileHref, pane, skRows, empty } from '../core/ui.js';
import { roll, leaf } from '../core/motion.js';
import { points, profile, dailyGames, honeyBoard, raids, equippedFor, honey24h } from '../core/data.js';
import { holdings } from '../core/ledger.js';
import { bearFeed, bearCandles, LINKS } from '../core/market.js';
import { sparkline } from '../core/chart.js';
import { num, price, pct, tone, compact, usd, short, duration, untilUtcMidnight } from '../core/format.js';
import { dropStatus } from './earn/drops.js';
import { authorOf, paintAvatar, timeLeft } from './raids/flow.js';
import { GAMES, ART } from '../core/art.js';
import { bearCity, liveTile, surprise, gameReturn, leaveForGame } from '../core/fun.js';

export const title = 'Home';

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

// A hello for everyone arriving at the rebuilt park: what's new and where it
// lives. Shown on the first few visits to Home, or until it's closed.
const NEW_KEY = 'bp:new:v1';
function whatsNew(wallet) {
  let seen = 0;
  try { seen = Number(localStorage.getItem(NEW_KEY) || 0); } catch { return null; }
  if (!(seen >= 0 && seen < 4)) return null; // -1: closed
  // Counted once per visit (tab session), not per trip back to Home.
  try {
    if (!sessionStorage.getItem(NEW_KEY)) { sessionStorage.setItem(NEW_KEY, '1'); localStorage.setItem(NEW_KEY, String(seen + 1)); }
  } catch { /* private mode: shown each visit */ }
  const item = (href, ic, title, sub) => h('a.home-new__item', { href },
    h('span.home-new__ic', icon(ic)), h('span.home-new__txt', h('b', title), h('small', sub)));
  const close = h('button.icon-btn.home-new__x', { type: 'button', 'aria-label': 'Close' }, icon('close'));
  const el = h('section.frost.home-new', { 'data-e': '', 'aria-label': 'What’s new' },
    h('div.home-new__head', h('span.chip.chip--gold', 'New'), h('h2.home-new__title', 'Welcome to the new BEAR Park'), close),
    h('p.home-new__lede', 'Rebuilt from the ground up, faster everywhere — and Bear City is back. Tap a bear up there.'),
    h('div.home-new__grid',
      item('#/community', 'users', 'The board is live', 'Post, react, follow BEARs'),
      item(profileHref(wallet), 'user', 'Make it yours', 'Your BEAR as your avatar'),
      item('#/play', 'gamepad', 'Honey every minute', 'Four games, all on the boards'),
      item('#/earn', 'gift', 'Daily BEARdrops', 'Earn honey, claim $BEAR')));
  close.addEventListener('click', () => {
    try { localStorage.setItem(NEW_KEY, '-1'); } catch { /* fine */ }
    const out = el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 200, easing: 'ease-in' });
    out.finished.catch(() => {}).then(() => el.remove());
  });
  return el;
}

export default function home({ wallet, signal, navigate }) {
  const name = h('span', short(wallet));
  profile(wallet).subscribe((s) => { if (s.value?.display_name) name.textContent = s.value.display_name; }, signal);

  // ── tiles ──
  const honeyFig = h('div.tile__value.num', skFigure('3em'));
  const honeySub = h('div.tile__sub', ' ');
  points(wallet).subscribe((s) => {
    if (s.value) {
      if (!honeyFig.dataset.rolled) honeyFig.replaceChildren();
      roll(honeyFig, num(s.value.total_points, 0));
      honeySub.textContent = `${num(s.value.raiding_points, 0)} from raids · ${num(s.value.games_points, 0)} from games`;
    } else if (s.error && !honeyFig.dataset.rolled) {
      fill(honeyFig, h('span.failed', '—'));
      honeySub.textContent = "couldn't load · retrying";
    }
  }, signal);

  const priceSlot = h('div.tile__value.tile__value--md');
  const priceSub = h('div.tile__sub', ' ');
  const spark = h('div', { style: { marginTop: 'auto' } });
  bind(priceSlot, bearFeed, (v) => h('span.num', price(v.price), h('span.stat__unit', 'XRP')), { signal });
  bearFeed.subscribe((s) => {
    if (s.value) priceSub.replaceChildren(h(`span.${tone(s.value.change24h)}`, pct(s.value.change24h)), ' 24h', s.value.priceUsd ? ` · ${usd(s.value.priceUsd)}` : '');
  }, signal);
  bearCandles('7D').subscribe((s) => {
    if (s.value?.length && !spark.firstChild) spark.append(sparkline(s.value.map((c) => c.c), { width: 180, height: 40 }));
  }, signal);

  const bagSlot = h('div.tile__value.tile__value--md');
  const bagSub = h('div.tile__sub', ' ');
  bind(bagSlot, holdings(wallet), (v) => h('span.num', compact(v.bear)), { signal });
  holdings(wallet).subscribe((s) => {
    const feed = bearFeed.get().value;
    if (s.value && feed?.price) bagSub.textContent = `≈ ${num(s.value.bear * feed.price, 0)} XRP`;
  }, signal);

  const minutes = h('div.tile__value.tile__value--md');
  const meter = h('i');
  const minutesSub = h('div.tile__sub', ' ');
  bind(minutes, dailyGames(wallet), (v) => h('span.num', `${num(v.minutes_today, 0)}`, h('span.stat__unit', `/ ${v.max_minutes} MIN`)), { signal });
  dailyGames(wallet).subscribe((s) => {
    if (!s.value) return;
    meter.style.setProperty('--v', Math.min(1, s.value.minutes_today / s.value.max_minutes));
    minutesSub.textContent = s.value.remaining_minutes > 0 ? `${s.value.remaining_minutes} paid minutes left today` : `Resets in ${duration(untilUtcMidnight())}`;
  }, signal);

  const rankSlot = h('div.tile__value.tile__value--md');
  bind(rankSlot, honeyBoard(wallet), (v) => (v.userRank ? h('span.num', `#${num(v.userRank, 0)}`) : h('span', { style: { fontSize: '20px' } }, 'Unranked')), { signal });

  const raidSlot = h('div.tile__value.tile__value--md');
  const raidSub = h('div.tile__sub', ' ');
  bind(raidSlot, raids, (list) => h('span.num', list.length ? `${list.length} live` : 'None live'), { signal });
  raids.subscribe((s) => {
    if (!s.value) return;
    const best = s.value.reduce((m, r) => Math.max(m, Number(r.reward) || 0), 0);
    raidSub.textContent = s.value.length ? `Up to ${num(best, 0)} honey each` : 'New raids drop through the day';
  }, signal);

  const dropSlot = h('div.tile__value.tile__value--md', skFigure('2.6em'));
  const dropSub = h('div.tile__sub', ' ');
  // The same feed Earn reads: claim-status shares a 5-a-minute limit, so it's read once.
  dropStatus(wallet).subscribe((st) => {
    const r = st.value;
    if (!r) { if (st.error) { fill(dropSlot, h('span.failed', '—')); dropSub.textContent = "couldn't load"; } return; }
    if (r.canClaim) { fill(dropSlot, h('span', 'Ready')); dropSub.textContent = `${num(r.totalPending, 2)} $BEAR to claim`; }
    else if (r.totalPending > 0) { fill(dropSlot, h('span.num', num(r.totalPending, 1))); dropSub.textContent = `$BEAR waiting · ${num(r.honey, 0)}/${r.min} honey today`; }
    else { fill(dropSlot, h('span', r.claimedToday ? 'Claimed' : 'Earning')); dropSub.textContent = `${num(r.honey, 0)}/${r.min} honey today`; }
  }, signal);

  const tile = (to, label, value, sub, extra = null, cls = '', ext = false) => h(`a.tile${cls}`, { href: to, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null }, h('div.tile__label', label), h('div.stack', { style: { '--gap': '4px' } }, value, sub), extra);

  // ── live tiles: a second face flips in now and then, Windows Phone style ──
  const stackOf = (...kids) => h('div.stack', { style: { '--gap': '4px' } }, kids);

  // honey: your total ↔ the last 24 hours
  const dayFig = h('div.tile__value.num', skFigure('2.4em'));
  let dayText = null;
  honey24h(wallet).subscribe((s) => {
    if (s.value == null) return;
    dayText = num(s.value, s.value % 1 ? 1 : 0);
    roll(dayFig, dayText);
  }, signal);
  const honeyFaces = [
    h('div', h('div.tile__label', 'Your honey'), stackOf(honeyFig, honeySub)),
    h('div', h('div.tile__label', 'Last 24 hours'), stackOf(dayFig, h('div.tile__sub', 'Counts toward BEARdrops'))),
  ];
  const honeyTile = h('a.tile.tile--wide.tile--gold.home-honey', { href: '#/earn' },
    h('img.tile__mascot', { src: ART.honey, alt: '' }), h('div.live', honeyFaces));
  liveTile(honeyTile, {
    live: honeyTile.lastChild, faces: honeyFaces, ready: [null, () => dayText != null], every: 8200, delay: 5200, signal,
    onShow: (k) => { if (k === 1 && dayText) { delete dayFig.dataset.rolled; roll(dayFig, dayText); } },
  });

  // $BEAR: price ↔ market cap
  const capSlot = h('div.tile__value.tile__value--md');
  const capSub = h('div.tile__sub', ' ');
  bind(capSlot, bearFeed, (v) => h('span.num', `$${compact(v.marketCap)}`), { signal });
  bearFeed.subscribe((s) => {
    if (s.value) capSub.textContent = `${num(s.value.holders, 0)} holders · ${compact(s.value.tvl)} XRP pooled`;
  }, signal);
  const bearFaces = [
    h('div', h('div.tile__label', '$BEAR'), stackOf(priceSlot, priceSub), spark),
    h('div', h('div.tile__label', 'Market cap'), stackOf(capSlot, capSub)),
  ];
  const bearTile = h('a.tile', { href: '#/bear' }, h('div.live', bearFaces));
  liveTile(bearTile, { live: bearTile.lastChild, faces: bearFaces, ready: [null, () => !!bearFeed.get().value?.marketCap], every: 7000, delay: 2600, signal });

  // raids: how many ↔ the newest raid's author
  const nextAva = h('span.live-ava');
  const nextWho = h('b', ' ');
  const nextSub = h('div.tile__sub', ' ');
  const paintNext = () => {
    const r = raids.get().value?.[0];
    if (!r) return;
    const a = authorOf(r);
    if (nextAva.dataset.src !== (a.avatar || '-')) { nextAva.dataset.src = a.avatar || '-'; paintAvatar(nextAva, a.avatar); }
    nextWho.textContent = a.handle ? `@${a.handle}` : (a.name || 'A post on X');
    nextSub.textContent = `${num(r.reward, 0)} honey · ${timeLeft(Date.parse(r.expires_at) - Date.now())}`;
  };
  raids.subscribe(paintNext, signal);
  const raidFaces = [
    h('div', h('div.tile__label', 'Raids'), stackOf(raidSlot, raidSub)),
    h('div', h('div.tile__label', 'Newest raid'), stackOf(h('div.live-who', nextAva, nextWho), nextSub)),
  ];
  const raidTile = h('a.tile.tile--purple', { href: '#/raids' }, h('div.live', raidFaces));
  liveTile(raidTile, {
    live: raidTile.lastChild, faces: raidFaces, ready: [null, () => (raids.get().value || []).length > 0], every: 7600, delay: 7800, signal,
    onShow: (k) => { if (k === 1) paintNext(); },
  });

  const wall = h('div.tile-wall.home-wall',
    honeyTile,
    bearTile,
    tile('#/bear', 'You hold', bagSlot, bagSub),
    tile('#/play', 'Games today', minutes, h('div.stack', { style: { '--gap': '8px' } }, h('div.meter', meter), minutesSub)),
    tile('#/earn', 'Honey rank', rankSlot, h('div.tile__sub', 'of every BEAR')),
    raidTile,
    tile('#/earn', 'BEARdrops', dropSlot, dropSub, null, '.tile--green.home-drops'));

  // Back from a game with more honey: say so, and let it burst from the honey tile.
  gameReturn({ wallet, origin: () => honeyTile, signal });

  // ── games ──
  const games = h('section.section',
    h('div.section__head', h('h2.section-title', 'Jump back in'), h('a.btn.btn--sm.btn--line', { href: '#/play' }, 'Leaderboards', icon('chevron-right'))),
    h('div.tile-wall.home-games', { 'data-reveal': 'rows' }, GAMES.map((g) => h('a.tile', { href: g.path, style: { minHeight: '176px' } },
      h('img.tile__art', { src: g.art, alt: '', loading: 'lazy', style: { opacity: '.92' } }), h('span.tile__scrim'),
      h('div.tile__label', g.tag),
      h('div', h('div', { style: { font: '700 19px/1.2 var(--font)' } }, g.name), h('div.tile__sub', g.blurb))))));

  // ── top earners ──
  const board = h('div.rows', skRows(5));
  honeyBoard(wallet).subscribe(async (s) => {
    if (!s.value) { if (s.error) fill(board, empty('Could not load the board', 'It retries on its own.')); return; }
    const top = s.value.leaderboard.slice(0, 6);
    const rings = await equippedFor(top.map((p) => p.wallet_address));
    fill(board, top.map((p, i) => h(`a.row${p.wallet_address === wallet ? '.row--you' : ''}`, { href: profileHref(p.wallet_address) },
      h(`span.row__rank${i < 3 ? `.row__rank--${i + 1}` : ''}`, i + 1),
      avatar(p.avatar_nft, { size: 36, ring: rings[p.wallet_address]?.ring }),
      h('div.row__main', h('div.row__title', displayName(p)), h('div.row__sub', `${num(p.raiding_points, 0)} raid · ${num(p.games_points, 0)} games`)),
      h('div.row__value.up', num(p.total_points, 0), h('small', 'HNY')))));
    leaf(board.children);
  }, signal);

  const trade = h('a.tile.home-trade', { href: LINKS.trade, target: '_blank', rel: 'noopener' },
    h('div.tile__label', 'BEAR Swap'),
    h('div', h('div', { style: { font: '300 28px/1.1 var(--font)', letterSpacing: '-.6px' } }, 'Trade ', h('span.gold', '$BEAR'), ' with the lowest fees on XRPL'),
      h('div.tile__sub', { style: { marginTop: '8px' } }, 'Opens swap.bearpark.xyz ', icon('external'))));

  // ── "Where would you like to go?" — the old hero's jump menu as one playful
  // reel, leaning toward what's live for you right now ──
  const places = () => {
    const live = (raids.get().value || []).length > 0;
    const ready = !!dropStatus(wallet).get().value?.canClaim;
    const minutesLeft = Number(dailyGames(wallet).get().value?.remaining_minutes) > 0;
    return [
      { label: 'Raids', weight: live ? 4 : 0.5, go: () => navigate('/raids') },
      { label: 'BEARdrops', weight: ready ? 4 : 0.5, go: () => navigate('/earn') },
      ...GAMES.map((g) => ({
        label: g.id === 'bear-jumpventure' ? 'Jumpventure' : g.name,
        weight: minutesLeft ? 1.3 : 0.6,
        go: () => { leaveForGame(wallet, g.id); location.href = g.path; },
      })),
      { label: 'Friends', weight: 1, go: () => navigate('/community?tab=friends') },
      { label: 'Shop', weight: 1, go: () => navigate('/shop') },
      { label: '$BEAR', weight: 0.8, go: () => navigate('/bear') },
      { label: 'Leaderboards', weight: 0.8, go: () => navigate('/play?tab=boards') },
    ];
  };
  const where = h('div.home-where',
    h('span.home-where__q', h('span.home-where__long', 'Where would you like to go?'), h('span.home-where__short', { 'aria-hidden': 'true' }, 'Where to?')),
    surprise({ choices: places, all: places().map((p) => p.label) }));

  name.className = 'gold';
  const band = h('header.park-band.home-band.has-city', { 'data-e': '' },
    h('img', { src: ART.park, srcset: ART.parkSet, sizes: '(min-width: 1280px) 1240px, 100vw', alt: '', decoding: 'async' }),
    h('div.zune', h('div.eyebrow', greeting()), h('h1.park-title', 'Hey, ', name), where));
  // Bear City: the park's BEARs stroll the grass under your name.
  bearCity(band, {
    count: innerWidth < 640 ? 3 : innerWidth < 1100 ? 4 : 5,
    feet: [9, 24],
    size: innerWidth < 640 ? [40, 52] : [50, 66],
    signal,
  });

  const el = h('main.page',
    band,
    whatsNew(wallet),
    h('div', { 'data-e': '' }, wall),
    h('div.cols.cols--main.section',
      h('div', { 'data-e': '' }, games),
      h('div.stack', { 'data-e': '', style: { '--gap': '16px' } },
        pane({ title: 'Top honey earners', aside: h('a.btn--text.btn', { href: '#/earn' }, 'All'), body: [board] }),
        trade)));
  return el;
}

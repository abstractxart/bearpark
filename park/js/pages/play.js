// Play: the Bearcade. Today's paid minutes, the four games with your best on
// each, and every leaderboard, live.
//
// The honey rule (backend/server.js: /api/games/complete → atomic_time_play):
// one honey per minute of active play, counted in tenths, shared across all
// four games, up to `max_minutes` a UTC day (dailyGames(w)). Scores live in
// game_leaderboards, one row per wallet per board, replaced only by a better
// run (Pong's row carries wins/losses and is ranked by a rating instead).
//
// The Daily run board is "flappy-bear-daily-<date>" where <date> is the
// player's LOCAL day — that is how Flappy BEAR keys it (src/missions.ts
// dateKey), and the server takes a board within a day either side of UTC.

import { h, icon, fill } from '../core/dom.js';
import {
  pageHead, sectionHead, pivot, skRows, skFigure, skLine, errorLine, empty,
  avatar, displayName, profileHref, loadCss,
} from '../core/ui.js';
import { roll, leaf, skip } from '../core/motion.js';
import { dailyGames, profile, equipped, equippedFor } from '../core/data.js';
import { api, live } from '../core/api.js';
import { GAMES, ART } from '../core/art.js';
import { num, short, ago, clock, untilUtcMidnight, plural } from '../core/format.js';
import { gameReturn } from '../core/fun.js';

export const title = 'Play';

const TOP = 25;            // rows a board shows before "Show all"
const LIMIT = 100;         // rows a board fetches
const DAILY_EPOCH = '2026-10-10'; // Flappy BEAR's Daily #1 (src/daily.ts)

const game = (id) => GAMES.find((g) => g.id === id);
const BOARDS = [
  { id: 'flappy-bear', label: 'Flappy BEAR', game: game('flappy-bear'), kind: 'All-time best' },
  { id: 'daily', label: 'Daily run', game: game('flappy-bear'), daily: true },
  { id: 'bear-slice', label: 'BEAR Ninja', game: game('bear-ninja'), kind: 'All-time best' },
  { id: 'bear-jumpventure', label: 'Jumpventure', game: game('bear-jumpventure'), kind: 'All-time best' },
  { id: 'bear-pong', label: 'Pong Lab', game: game('bear-pong'), pong: true, kind: 'Ranked by rating' },
];

const ALIASES = {
  flappy: 'flappy-bear', flappybear: 'flappy-bear', 'flappy-bear-daily': 'daily',
  ninja: 'bear-slice', 'bear-ninja': 'bear-slice', slice: 'bear-slice',
  jumpventure: 'bear-jumpventure', jump: 'bear-jumpventure',
  pong: 'bear-pong', bearpong: 'bear-pong', 'pong-lab': 'bear-pong',
};
/** ?board= accepts a tab id, a game id, a board id or a dated daily board. */
function resolveBoard(value) {
  if (!value) return null;
  const s = String(value).toLowerCase();
  if (s.startsWith('flappy-bear-daily')) return 'daily';
  const id = ALIASES[s] || s;
  return BOARDS.some((b) => b.id === id) ? id : null;
}

// ── days ──
const pad = (n) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utcDay = () => new Date().toISOString().slice(0, 10);
const dayMs = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const dailyNumber = (day) => Math.round((dayMs(day) - dayMs(DAILY_EPOCH)) / 864e5) + 1;
const dayLabel = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
const boardId = (b, day) => (b.daily ? `flappy-bear-daily-${day}` : b.id);
const resetNote = () => `Midnight UTC · ${new Date(Date.now() + untilUtcMidnight()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} your time`;

// ── scores ──
const sameWallet = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const winsOf = (e) => Number(e?.wins ?? e?.metadata?.wins ?? e?.score) || 0;
const lossesOf = (e) => Number(e?.losses ?? e?.metadata?.losses) || 0;
const rateOf = (e) => { const w = winsOf(e); const l = lossesOf(e); return w + l ? w / (w + l) : 0; };
const ratingOf = (e) => Number(e?.weighted_score) || Math.round(rateOf(e) * 1000 + winsOf(e) * 5);
const sortValue = (b, e) => (b.pong ? ratingOf(e) : Number(e?.score) || 0);
const pctText = (r) => `${Math.round(r * 100)}%`;
const record = (e) => `${num(winsOf(e), 0)}–${num(lossesOf(e), 0)}`;
const joined = (...parts) => parts.filter(Boolean).join(' · ');

// ── feeds ──
/** A board's top 100, refreshed every minute while it is on screen. */
function boardFeed(id, daily) {
  return live(`park:play:board:${id}`, async () => {
    try {
      return ((await api(`/leaderboard/${encodeURIComponent(id)}?limit=${LIMIT}`)).leaderboard || []).slice(0, LIMIT);
    } catch (err) {
      // A day nobody has flown yet is an empty board, not an error.
      if (daily && err.status >= 400 && err.status < 500) return [];
      throw err;
    }
  }, { every: 60_000 });
}

/** Your row on one board ({ entry } — null when you have no score). Fetched once a visit. */
const bestFeed = (board, w) => live(`park:play:best:${board}:${w}`,
  async () => ({ entry: (await api(`/leaderboard/${encodeURIComponent(board)}/${w}`)).entry || null }));

/** Coming back from a game reloads the site: refetch what the run could have changed. */
const freshen = (feed, ms = 15_000) => { if (Date.now() - (feed.get().at || 0) > ms) feed.refresh(); };

const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

export default function play({ wallet, query, signal, scope }) {
  loadCss('play');

  let cur = null;              // the open board: { b, id, list, error, sig, animate, grew }
  let day = localDay();
  let settle = false;          // a link to the boards is still landing (see toBoards)
  let settleTimer = 0;
  const expanded = new Set();  // boards showing all rows

  // ───────────────────────── today ─────────────────────────
  const daily = dailyGames(wallet);

  /** A light figure whose digits roll; a calm dash if it never loaded. */
  function figure(unit = '') {
    const n = h('span.num', skFigure('2.2em'));
    const u = unit ? h('span.stat__unit', { hidden: true }, unit) : null;
    return {
      el: h('div.tile__value', n, u),
      unit: u,
      set(text) { if (u) u.hidden = false; roll(n, text); },
      fail() { if (n.dataset.rolled) return; if (u) u.hidden = true; fill(n, h('span.failed', '—')); },
    };
  }

  const minutes = figure('MIN');
  const meter = h('i');
  const minSub = h('div.tile__sub', ' ');
  const honey = figure('HNY');
  const honeySub = h('div.tile__sub', 'from games');
  const paid = figure('MIN');
  const paidSub = h('div.tile__sub', ' ');
  const clockEl = h('div.tile__value.num.play-clock', { role: 'timer' }, clock(untilUtcMidnight()));
  const clockSub = h('div.tile__sub', resetNote());
  const capNote = h('span', '.');

  const paidTile = h('div.tile.play-paid',
    h('div.tile__label', 'Paid minutes left'), h('div.stack', { style: { '--gap': '4px' } }, paid.el, paidSub));

  let meterSet = false;
  daily.subscribe((s) => {
    const v = s.value;
    if (!v) {
      if (s.error) {
        [minutes, honey, paid].forEach((f) => f.fail());
        minSub.textContent = "couldn't load · retrying";
        paidSub.textContent = "couldn't load · retrying";
      }
      return;
    }
    const max = Number(v.max_minutes) || 0;
    const played = Number(v.minutes_today) || 0;
    const left = Math.max(0, Number(v.remaining_minutes) || 0);
    const capped = v.can_earn_points === false || (max > 0 && left <= 0);
    minutes.unit.textContent = `/ ${num(max, 0)} MIN`;
    minutes.set(num(played, 1));
    const fillTo = () => meter.style.setProperty('--v', max ? Math.min(1, played / max) : 0);
    if (meterSet) fillTo(); else { meterSet = true; requestAnimationFrame(() => requestAnimationFrame(fillTo)); }
    minSub.textContent = capped ? 'Cap reached · scores still count'
      : played > 0 ? `${Math.max(1, Math.round((played / max) * 100))}% of today’s paid time` : 'Nothing played yet today';
    honey.set(num(v.points_earned_today, 1));
    paid.set(num(left, 1));
    paidTile.classList.toggle('tile--green', !capped);
    paidSub.textContent = capped ? 'Back at midnight UTC' : 'Shared by all four games';
    capNote.textContent = max ? `, up to ${num(max, 0)} minutes a day.` : '.';
  }, signal);
  freshen(daily);

  const today = h('div.tile-wall.play-today', { 'data-e': '' },
    h('div.tile.play-mins',
      h('div.tile__label', 'Played today'),
      h('div.stack', { style: { '--gap': '10px' } }, minutes.el, h('div.meter', meter), minSub)),
    h('a.tile.tile--gold.play-honey', { href: '#/earn' },
      h('img.tile__mascot', { src: ART.honey, alt: '', decoding: 'async' }),
      h('div.tile__label', 'Honey today'),
      h('div.stack', { style: { '--gap': '4px' } }, honey.el, honeySub)),
    paidTile,
    h('div.tile.play-reset',
      h('div.tile__label', 'Resets in'),
      h('div.stack', { style: { '--gap': '4px' } }, clockEl, clockSub)));

  // ───────────────────────── games ─────────────────────────
  function bestNodes(g, e) {
    if (!e) return h('span.play-game__none', 'No score yet');
    if (g.id === 'bear-pong') return [h('span.num', num(winsOf(e), 0)), h('small', `${record(e)} · ${pctText(rateOf(e))}`)];
    return [h('span.num', num(e.score, 0)), e.rank ? h('small', `#${num(e.rank, 0)}`) : null];
  }

  function gameTile(g) {
    const fig = h('div.play-game__fig', skFigure('2.4em'));
    const feed = bestFeed(g.board, wallet);
    feed.subscribe((s) => {
      if (s.value) fill(fig, bestNodes(g, s.value.entry));
      else if (s.error) fill(fig, h('span.failed', '—'));
      if (cur && !cur.b.daily && cur.b.game.board === g.board) { paintYou(); paintStanding(); }
    }, signal);
    freshen(feed);
    return h('a.tile.play-game', { href: g.path },
      h('div.play-game__art', h('img', { src: g.art, alt: '', loading: 'lazy', decoding: 'async' })),
      h('span.tri'),
      h('div.play-game__body',
        h('div.tile__label', g.tag),
        h('div.play-game__name', g.name),
        h('p.play-game__blurb', g.blurb),
        h('div.play-game__foot',
          h('div.play-game__best', h('div.caption', g.id === 'bear-pong' ? 'Your wins' : 'Your best'), fig),
          h('span.play-game__go', { 'aria-hidden': 'true' }, icon('play', 'play-solid'), h('span', 'Play')))));
  }

  const games = h('div.play-games', { 'data-e': '' }, GAMES.map(gameTile));

  // ───────────────────────── boards ─────────────────────────
  const initial = resolveBoard(query.get('board')) || 'flappy-bear';
  const meta = h('div.play-board__meta');
  const rowsEl = h('div.rows', { 'data-reveal': 'rows' }, skRows(8));
  const youEl = h('div.play-you');
  const note = h('p.play-board__note');
  const moreBtn = h('button.btn.btn--line.btn--sm.play-more', { type: 'button', onclick: toggleAll });
  const footEl = h('div.play-board__foot', note, moreBtn);

  const piv = pivot(BOARDS.map(({ id, label }) => ({ id, label })), {
    selected: initial, align: 'start', label: 'Leaderboards',
    onChange: (id, user) => {
      open(id);
      if (user) history.replaceState(history.state, '', `#/play?board=${id}`);
    },
  });

  const boardPane = h('section.frost.frost--section.play-board', { 'data-e': '', 'aria-label': 'Leaderboard' },
    h('div.play-board__tabs', piv), h('div.rule'), meta, rowsEl, youEl, footEl);

  // your standing on the open board: the one armed action lives here
  const standLabel = h('div.tile__label');
  const standFig = h('div.play-stand__rank', skFigure('1.6em'));
  const standSub = h('div.tile__sub', ' ');
  const standFacts = h('div.play-stand__facts');
  const standGo = h('a.btn.btn--gold.btn--block.play-stand__go');
  const stand = h('aside.tile.tile--purple.play-stand', { 'data-e': '', 'aria-label': 'Your standing' },
    h('img.tile__mascot', { src: ART.coin, alt: '', loading: 'lazy', decoding: 'async' }),
    standLabel, h('div.play-stand__head', standFig, standSub), standFacts, standGo);

  const boardsSec = h('section.section.play-boards-sec',
    sectionHead('Leaderboards', 'Wallet-verified scores'),
    h('div.play-boards', boardPane, stand));

  let sub = null;
  signal.addEventListener('abort', () => sub?.abort(), { once: true });

  function open(key, { force = false } = {}) {
    const b = BOARDS.find((x) => x.id === key);
    if (!b) return;
    const id = boardId(b, day);
    if (!force && cur?.id === id) return;
    sub?.abort();
    sub = new AbortController();
    const me = { b, id, list: null, error: null, sig: '', animate: true, grew: 0 };
    cur = me;
    fill(rowsEl, skRows(8));
    paintMeta();
    paintYou();
    paintFoot();
    paintStanding();
    boardFeed(id, b.daily).subscribe((s) => {
      if (cur !== me) return;
      if (s.value) { me.list = s.value; me.error = null; paint(); }
      else if (s.error && !me.list) { me.error = s.error; paint(); }
    }, sub.signal);
  }

  const avas = new Map(); // one avatar node per person: no image reloads on refresh or tab change
  function avaFor(e, ring) {
    const k = `${e.wallet_address}|${e.avatar_nft || ''}|${ring?.image_url || ''}`;
    let node = avas.get(k);
    if (!node) { node = avatar(e.avatar_nft, { size: 36, ring, name: displayName(e) }); avas.set(k, node); }
    return node;
  }

  const rankEl = (rank) => h(`span.row__rank${rank && rank <= 3 ? `.row__rank--${rank}` : ''}`, rank ? num(rank, 0) : '—');

  function valueEl(b, e) {
    if (!b.pong) return h('div.row__value', num(e.score, 0));
    return h('div.play-val',
      h('div.row__value', num(winsOf(e), 0), h('small', 'W')),
      h('div.row__sub', `${record(e)} · ${pctText(rateOf(e))}`));
  }

  function row(b, e, rank, ring) {
    const you = sameWallet(e.wallet_address, wallet);
    const ghost = b.daily && rank === 1 && e.metadata?.has_ghost;
    const subline = b.pong
      ? joined(`Rating ${num(ratingOf(e), 0)}`, e.updated_at && `played ${ago(e.updated_at)}`)
      : joined(short(e.wallet_address), e.updated_at && ago(e.updated_at));
    return h(`a.row${you ? '.row--you' : ''}${rank <= 3 ? `.play-row--${rank}` : ''}`, { href: profileHref(e.wallet_address) },
      rankEl(rank),
      avaFor(e, ring),
      h('div.row__main',
        h('div.row__title.play-row__title', h('span.play-row__name', displayName(e)),
          you ? h('span.chip.chip--gold', 'You') : null,
          ghost ? h('span.chip.chip--purple', { title: 'The run everyone races today' }, 'Ghost') : null),
        h('div.row__sub', subline)),
      valueEl(b, e));
  }

  function emptyBoard(b) {
    if (b.daily) return empty('No runs yet today', `Daily #${dailyNumber(day)} is open. Fly it first and everyone else races your ghost.`);
    return empty('No scores yet', 'The first run on the board takes #1.');
  }

  async function paint() {
    await paintRows();
    if (settle && !signal.aborted) { settle = false; scrollBoards(true); }
  }

  async function paintRows() {
    const me = cur;
    const { b, list } = me;
    paintMeta();
    paintYou();
    paintFoot();
    paintStanding();
    if (!list) {
      me.sig = '';
      fill(rowsEl, h('div.play-board__err', errorLine("Couldn't load this board. It tries again every minute.")));
      return;
    }
    const all = expanded.has(b.id);
    const shown = all ? list : list.slice(0, TOP);
    const sig = `${all}|${shown.map((e) => `${e.wallet_address}:${sortValue(b, e)}:${lossesOf(e)}:${e.display_name || ''}:${e.avatar_nft ? 1 : 0}`).join(',')}`;
    if (sig === me.sig) return;
    me.sig = sig;
    if (!list.length) { fill(rowsEl, emptyBoard(b)); return; }
    const rings = await equippedFor(shown.map((e) => e.wallet_address));
    if (cur !== me || me.sig !== sig || signal.aborted) return;
    fill(rowsEl, shown.map((e, i) => row(b, e, i + 1, rings[e.wallet_address]?.ring)));
    if (me.animate) {
      me.animate = false;
      if (onScreen(rowsEl)) leaf(rowsEl.children);
    } else if (me.grew) {
      leaf([...rowsEl.children].slice(me.grew));
    }
    me.grew = 0;
  }

  function paintMeta() {
    const { b, list } = cur;
    const left = b.daily ? `Daily #${dailyNumber(day)} · ${dayLabel(day)}` : b.kind;
    let right = '';
    if (list?.length) right = b.daily ? `${plural(list.length, 'run')} today` : `${list.length >= LIMIT ? `${LIMIT}+` : num(list.length, 0)} players`;
    fill(meta, h('span.eyebrow.eyebrow--sm', left), h('span.section__aside', right));
  }

  function paintFoot() {
    const { b, list } = cur;
    note.textContent = b.pong ? 'Ranked by rating: 10 for every percent of win rate, plus 5 a win.'
      : b.daily ? 'One course for everyone, new at your midnight. Today’s #1 is the ghost the others race.'
      : '';
    note.hidden = !note.textContent;
    const all = expanded.has(b.id);
    moreBtn.hidden = !list || list.length <= TOP;
    moreBtn.textContent = all ? `Show top ${TOP}` : `Show all ${list ? list.length : ''}`;
    moreBtn.setAttribute('aria-expanded', String(all));
    footEl.hidden = note.hidden && moreBtn.hidden;
  }

  function toggleAll() {
    const { b } = cur;
    if (expanded.has(b.id)) expanded.delete(b.id);
    else { expanded.add(b.id); cur.grew = TOP; }
    paint().then(() => {
      if (!expanded.has(b.id) && !onScreen(moreBtn)) moreBtn.scrollIntoView({ block: 'center', behavior: skip() ? 'auto' : 'smooth' });
    });
  }

  /** Where you stand on the open board: { known, rank, entry, outside }. */
  function standingOf({ b, list }) {
    const i = list ? list.findIndex((e) => sameWallet(e.wallet_address, wallet)) : -1;
    if (i >= 0) return { known: true, rank: i + 1, entry: list[i] };
    if (b.daily) return { known: !!list, rank: null, entry: null, outside: (list?.length || 0) >= LIMIT };
    const s = bestFeed(b.game.board, wallet).get();
    if (!s.value) return { known: false, failed: !!s.error };
    const e = s.value.entry;
    // Pong's stored rank counts wins, not the rating the board is sorted by.
    return { known: true, rank: e && !b.pong ? Number(e.rank) || null : null, entry: e, outside: !!e };
  }

  /** Pin your row under the board when it isn't among the rows shown. */
  function paintYou() {
    const me = cur;
    const { b, list } = me;
    if (!list || !list.length) { fill(youEl); return; } // an empty board already says how to get on it
    const shownCount = expanded.has(b.id) ? list.length : Math.min(TOP, list.length);
    const i = list.findIndex((e) => sameWallet(e.wallet_address, wallet));
    if (i >= 0 && i < shownCount) { fill(youEl); return; }
    const st = i >= 0 ? { known: true, rank: i + 1, entry: list[i] } : standingOf(me);
    if (!st.known) { fill(youEl); return; }
    const p = profile(wallet).get().value;
    const ring = equipped(wallet).get().value?.ring || null;
    const ava = avatar(p?.avatar_nft, { size: 36, ring, name: 'You' });
    if (!st.entry) {
      const why = b.daily ? (st.outside ? 'Not in today’s top 100' : 'No run on today’s course yet') : 'No score on this board yet';
      fill(youEl, h('div.row.row--you', rankEl(null), ava,
        h('div.row__main', h('div.row__title', 'You'), h('div.row__sub', why)),
        h('a.btn.btn--line.btn--sm', { href: b.game.path }, 'Play')));
      return;
    }
    fill(youEl, h('a.row.row--you', { href: profileHref(wallet) }, rankEl(st.rank), ava,
      h('div.row__main', h('div.row__title', 'You'), h('div.row__sub', p?.display_name || short(wallet))),
      valueEl(b, st.entry)));
  }

  const fact = (k, v) => h('div.fact', h('span', k), h('b', v));

  function paintStanding() {
    const { b, list, error } = cur;
    standLabel.textContent = b.daily ? `Your run · Daily #${dailyNumber(day)}` : `Your standing · ${b.label}`;
    standGo.href = b.game.path;
    fill(standGo, icon('play', 'play-solid'), b.daily ? 'Fly today’s course' : `Play ${b.game.name}`);

    if (!list) {
      if (error) { fill(standFig, h('span.failed', '—')); standSub.textContent = "couldn't load · retrying"; fill(standFacts); }
      else { fill(standFig, skFigure('1.6em')); standSub.textContent = ' '; fill(standFacts, h('div.stack', { style: { '--gap': '10px' } }, skLine('80%'), skLine('64%'))); }
      return;
    }
    const st = standingOf(cur);
    if (!st.known) {
      if (st.failed) { fill(standFig, h('span.failed', '—')); standSub.textContent = "couldn't load · retrying"; }
      else { fill(standFig, skFigure('1.6em')); standSub.textContent = ' '; }
      fill(standFacts);
      return;
    }
    const players = list.length >= LIMIT ? `${LIMIT}+` : num(list.length, 0);
    const facts = [];
    const leader = list[0];
    const valText = (e) => (b.pong ? record(e) : num(e.score, 0));

    if (st.entry) {
      standFig.classList.remove('play-stand__rank--word');
      fill(standFig, st.rank ? `#${num(st.rank, 0)}` : '—');
      standSub.textContent = st.rank ? (b.daily ? `of ${plural(list.length, 'run')} today` : `of ${players} players`) : `Outside the top ${LIMIT}`;
      if (b.pong) {
        facts.push(fact('Record', record(st.entry)), fact('Win rate', pctText(rateOf(st.entry))), fact('Rating', num(ratingOf(st.entry), 0)));
      } else {
        facts.push(fact(b.daily ? 'Today’s best' : 'Your best', num(st.entry.score, 0)));
      }
      const unit = b.pong ? ' rating' : '';
      if (st.rank > 1 && list[st.rank - 2]) {
        const next = list[st.rank - 2];
        facts.push(fact(`Next up · #${st.rank - 1}`, displayName(next)));
        facts.push(fact('Gap', `${num(Math.max(0, sortValue(b, next) - sortValue(b, st.entry)), 0)}${unit}`));
      } else if (st.rank === 1 && list[1]) {
        facts.push(fact('Lead over #2', `+${num(Math.max(0, sortValue(b, st.entry) - sortValue(b, list[1])), 0)}${unit}`));
      }
    } else {
      standFig.classList.add('play-stand__rank--word');
      fill(standFig, 'Unranked');
      standSub.textContent = b.daily ? (st.outside ? 'Not in today’s top 100' : 'No run on today’s course yet') : 'No score on this board yet';
      if (!b.pong && list.length >= TOP) facts.push(fact(`Top ${TOP} starts at`, num(list[TOP - 1].score, 0)));
    }
    if (leader && !sameWallet(leader.wallet_address, wallet)) {
      facts.push(fact(b.daily && leader.metadata?.has_ghost ? 'Ghost to race' : 'Leader', joined(displayName(leader), valText(leader))));
    }
    fill(standFacts, facts);
  }

  // keep the pinned row's face current
  profile(wallet).subscribe(() => { if (cur?.list) paintYou(); }, signal);
  equipped(wallet).subscribe(() => { if (cur?.list) paintYou(); }, signal);

  open(initial);

  // ───────────────────────── clock ─────────────────────────
  let utc = utcDay();
  const tick = () => {
    clockEl.textContent = clock(untilUtcMidnight());
    if (utcDay() !== utc) { utc = utcDay(); clockSub.textContent = resetNote(); daily.refresh(); }
    if (localDay() !== day) {
      day = localDay();
      if (cur?.b.daily) open('daily', { force: true });
    }
  };
  const timer = setInterval(tick, 1000);
  scope.add(() => clearInterval(timer));

  // ───────────────────────── page ─────────────────────────
  // A link to the boards lands on them; while the board is still a skeleton
  // the page can be too short to get there, so land again once its rows are in
  // (unless the person has started scrolling themselves).
  const unsettle = () => { settle = false; };
  for (const type of ['wheel', 'touchstart', 'keydown']) scope.on(window, type, unsettle, { passive: true });
  scope.add(() => clearTimeout(settleTimer));
  function scrollBoards(smooth) {
    // smooth scrolling stalls in a hidden tab; skip() covers that and reduced motion
    boardsSec.scrollIntoView({ block: 'start', behavior: smooth && !skip() ? 'smooth' : 'auto' });
  }
  function toBoards(smooth = true) {
    settle = true;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(unsettle, 4000);
    setTimeout(() => { if (!signal.aborted) scrollBoards(smooth); }, 80);
  }

  const lede = h('span', 'One honey for every minute you play, in any of the four games', capNote,
    ' Your best runs land on the boards below.');

  const el = h('main.page.play',
    pageHead({
      eyebrow: 'BEARCADE', title: 'Play', gold: 'Play', lede,
      aside: h('button.btn.btn--line.btn--sm.play-jump', { type: 'button', onclick: () => toBoards(true) }, 'Leaderboards', icon('arrow-down')),
    }),
    today,
    games,
    boardsSec);

  el.onQuery = (q) => {
    const id = resolveBoard(q.get('board'));
    if (id) piv.select(id);
    if (id || q.get('tab') === 'boards') toBoards(true);
  };
  if (query.get('tab') === 'boards' || resolveBoard(query.get('board'))) toBoards(true);

  // Back from a game with more honey: "+N honey from that run", bursting from Honey today.
  gameReturn({ wallet, origin: () => el.querySelector('.play-honey'), signal });

  return el;
}

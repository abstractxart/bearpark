// Earn: honey (what you have, how you get more, who has the most) and the
// daily BEARdrop it unlocks. The honey figures are the shared feeds the header
// reads, so the chip and this page can never disagree.

import { h, icon, fill } from '../core/dom.js';
import { pageHead, pane, skFigure, skRows, failedFigure, errorLine, avatar, displayName, profileHref, loadCss } from '../core/ui.js';
import { roll, leaf } from '../core/motion.js';
import { points, profile, equipped, dailyGames, honey24h, honeyBoard, raids, equippedFor } from '../core/data.js';
import { num, duration, untilUtcMidnight } from '../core/format.js';
import { ART } from '../core/art.js';
import { createDrops, dropsConfig } from './earn/drops.js';

export const title = 'Earn';

export default function earn({ wallet, signal, scope }) {
  loadCss('earn');
  const drops = createDrops({ wallet, signal, scope });

  // ── the honey hero: a gold tile with the pot ──
  const honeyFig = h('span.earn-honey__fig.num', skFigure('3.2em'));
  const split = h('div.earn-split', { 'aria-hidden': 'true' }, h('i.earn-split__games'), h('i.earn-split__raids'));
  const legend = h('div.earn-split__legend', ' ');
  let honeyPainted = false;
  points(wallet).subscribe((s) => {
    const v = s.value;
    if (!v) {
      if (s.error && !honeyPainted) { fill(honeyFig, failedFigure()); legend.textContent = ''; }
      return;
    }
    if (!honeyPainted) honeyFig.replaceChildren();
    honeyPainted = true;
    roll(honeyFig, num(v.total_points, 0));
    const games = Number(v.games_points) || 0;
    const raid = Number(v.raiding_points) || 0;
    split.style.setProperty('--g', games);
    split.style.setProperty('--r', raid);
    split.hidden = games + raid <= 0;
    split.children[0].hidden = games <= 0;
    split.children[1].hidden = raid <= 0;
    fill(legend,
      h('span', h('i.earn-dot.earn-dot--games'), h('b.num', num(games, 0)), ' from games'),
      h('span', h('i.earn-dot.earn-dot--raids'), h('b.num', num(raid, 0)), ' from raids'));
  }, signal);

  const hero = h('div.earn-honey.tile.tile--gold',
    h('img.tile__mascot.earn-honey__pot', { src: ART.honey, alt: '', decoding: 'async' }),
    h('div.tile__label', 'Your honey'),
    h('div.earn-honey__body',
      h('div.earn-honey__line', honeyFig, h('span.earn-honey__unit', 'HNY')),
      split, legend));

  // ── today and rank ──
  const todayFig = h('div.tile__value', skFigure('2em'));
  const todaySub = h('div.tile__sub', ' ');
  let todayPainted = false;
  const paintToday = () => {
    const s = honey24h(wallet).get();
    const min = dropsConfig.get().value?.min;
    if (s.value === undefined || s.value === null) {
      if (s.error && !todayPainted) { fill(todayFig, failedFigure()); todaySub.textContent = ''; }
      return;
    }
    if (!todayPainted) todayFig.replaceChildren();
    todayPainted = true;
    roll(todayFig, num(s.value, 1));
    fill(todaySub, min ? (s.value >= min ? 'Enough for today’s BEARdrop' : `${num(min - s.value, 1)} more for today’s BEARdrop`) : 'Since 00:00 UTC');
  };
  honey24h(wallet).subscribe(paintToday, signal);
  dropsConfig.subscribe(paintToday, signal);

  const rankFig = h('div.tile__value', skFigure('1.6em'));
  const rankSub = h('div.tile__sub', ' ');
  let rankPainted = false;
  honeyBoard(wallet).subscribe((s) => {
    if (!s.value) {
      if (s.error && !rankPainted) { fill(rankFig, failedFigure()); rankSub.textContent = ''; }
      return;
    }
    const r = Number(s.value.userRank);
    if (!rankPainted) rankFig.replaceChildren();
    rankPainted = true;
    if (r > 0) { roll(rankFig, `#${num(r, 0)}`); rankSub.textContent = r === 1 ? 'Top of the board' : r <= 25 ? 'On the board' : 'Of every BEAR'; }
    else { rankFig.textContent = 'Unranked'; rankFig.classList.add('earn-rank--none'); rankSub.textContent = 'Earn honey to join the board'; }
  }, signal);

  const wall = h('div.earn-wall', { 'data-e': '' },
    hero,
    h('div.tile', h('div.tile__label', 'Honey today'), h('div.stack', { style: { '--gap': '4px' } }, todayFig, todaySub, h('div.tile__sub.faint', 'Since 00:00 UTC · resets in ', resetClock(scope)))),
    h('button.tile', { type: 'button', onclick: () => boardPane.scrollIntoView({ behavior: smooth(), block: 'start' }) },
      h('div.tile__label', 'Honey rank'), h('div.stack', { style: { '--gap': '4px' } }, rankFig, rankSub)),
    drops.tile);

  // ── how to earn ──
  const how = howToEarn({ wallet, signal, toDrops: () => drops.pane.scrollIntoView({ behavior: smooth(), block: 'start' }) });

  // ── top honey earners ──
  const { el: boardPane } = board({ wallet, signal });

  return h('main.page.earn',
    pageHead({
      eyebrow: 'HONEY',
      title: 'Earn honey',
      gold: 'honey',
      lede: 'Every game minute and every raid pays honey. Earn a little each day to keep claiming your daily BEARdrop.',
    }),
    wall,
    h('div.cols.cols--main.section.earn-cols',
      h('div.stack', { 'data-e': '', style: { '--gap': '16px' } }, how, drops.pane),
      h('div', { 'data-e': '' }, boardPane)));
}

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** "17h 31m" to the UTC reset, ticking once a minute (seconds in the last hour). */
function resetClock(scope) {
  const el = h('span.num');
  const paint = () => { el.textContent = duration(untilUtcMidnight()); };
  paint();
  const t = setInterval(paint, 1000);
  scope.add(() => clearInterval(t));
  return el;
}

// ---------------------------------------------------------------------------
// How to earn: three Metro rows with the live numbers beside the rules.

function howToEarn({ wallet, signal, toDrops }) {
  const gamesVal = h('div.row__value', skFigure('3em'));
  const gamesMeter = h('i');
  const gamesSub = h('div.row__sub', '1 honey a minute of play');
  dailyGames(wallet).subscribe((s) => {
    const v = s.value;
    if (!v) { if (s.error && !gamesVal.dataset.ok) fill(gamesVal, h('span.failed', '—')); return; }
    gamesVal.dataset.ok = '1';
    fill(gamesVal, h('span.num', num(v.minutes_today, 1)), h('small', `/ ${num(v.max_minutes, 0)} MIN`));
    gamesMeter.style.setProperty('--v', Math.min(1, (Number(v.minutes_today) || 0) / (Number(v.max_minutes) || 1)));
    gamesSub.textContent = v.remaining_minutes > 0
      ? `1 honey a minute, up to ${num(v.max_minutes, 0)} min a day`
      : `Today’s ${num(v.max_minutes, 0)} paid minutes are used · resets 00:00 UTC`;
  }, signal);

  const raidVal = h('div.row__value', skFigure('2.4em'));
  const raidSub = h('div.row__sub', 'Like, repost and reply to $BEAR posts on X');
  raids.subscribe((s) => {
    const list = s.value;
    if (!list) { if (s.error && !raidVal.dataset.ok) fill(raidVal, h('span.failed', '—')); return; }
    raidVal.dataset.ok = '1';
    fill(raidVal, list.length ? [h('span.num', num(list.length, 0)), h('small', 'LIVE')] : h('span.muted', 'None live'));
    const best = list.reduce((m, r) => Math.max(m, Number(r.reward) || 0), 0);
    raidSub.textContent = list.length && best ? `Up to ${num(best, 0)} honey a raid · like, repost, reply on X` : 'Like, repost and reply to $BEAR posts on X';
  }, signal);

  const dropVal = h('div.row__value', skFigure('2.4em'));
  const dropMeter = h('i');
  const dropSub = h('div.row__sub', 'Earn honey each UTC day to claim your BEARdrop');
  const paintDrop = () => {
    const s = honey24h(wallet).get();
    const c = dropsConfig.get();
    if (s.value == null || !c.value) {
      if ((s.error && s.value == null) || (c.error && !c.value)) { if (!dropVal.dataset.ok) fill(dropVal, h('span.failed', '—')); }
      return;
    }
    dropVal.dataset.ok = '1';
    const min = c.value.min;
    fill(dropVal, h('span.num', num(Math.min(s.value, 9999), 1)), h('small', `/ ${num(min, 0)} TODAY`));
    dropMeter.style.setProperty('--v', min ? Math.min(1, s.value / min) : 1);
    dropSub.textContent = `${num(min, 0)} honey since 00:00 UTC unlocks that day’s BEARdrop claim`;
  };
  honey24h(wallet).subscribe(paintDrop, signal);
  dropsConfig.subscribe(paintDrop, signal);

  const row = (href, tone, glyph, title, sub, value, meter) => h(typeof href === 'function' ? 'button.row.how' : 'a.row.how',
    typeof href === 'function' ? { type: 'button', onclick: href } : { href },
    h(`span.how__ico.how__ico--${tone}`, icon(glyph)),
    h('div.row__main', h('div.row__title', title), sub),
    h('div.how__end', value, meter ? h('div.meter.how__meter', { 'aria-hidden': 'true' }, meter) : null),
    icon('chevron-right', 'row__chev'));

  return pane({
    title: 'How to earn',
    aside: 'Resets 00:00 UTC',
    body: h('div.rows',
      row('#/play', 'purple', 'gamepad', 'Play games', gamesSub, gamesVal, gamesMeter),
      row('#/raids', 'green', 'flag', 'Raid on X', raidSub, raidVal, null),
      row(toDrops, 'gold', 'gift', 'Keep your BEARdrop', dropSub, dropVal, dropMeter)),
  });
}

// ---------------------------------------------------------------------------
// Top honey earners: the full board of 25, you highlighted, or pinned below.

function board({ wallet, signal }) {
  const list = h('div.rows', skRows(8));
  const pinned = h('div.earn-pin');
  let lastKey = '';
  let painted = false;

  honeyBoard(wallet).subscribe(async (s) => {
    if (!s.value) {
      if (s.error && !painted) fill(list, h('div.pane-body', errorLine("The board couldn't load. It retries on its own.", { small: true })));
      return;
    }
    const top = s.value.leaderboard.slice(0, 25);
    const key = JSON.stringify(top.map((p) => [p.wallet_address, p.total_points, p.display_name, p.avatar_nft?.length])) + s.value.userRank;
    if (key === lastKey) return;
    lastKey = key;
    const rings = await equippedFor(top.map((p) => p.wallet_address));
    if (signal.aborted) return;
    const mine = top.findIndex((p) => p.wallet_address === wallet || p.wallet_address?.toLowerCase() === wallet.toLowerCase());
    fill(list, top.map((p, i) => personRow(p, i + 1, rings[p.wallet_address]?.ring, i === mine)));
    if (!painted) leaf(list.children);
    painted = true;
    paintPinned(mine < 0 ? s.value.userRank : null, mine < 0);
  }, signal);

  // You, outside the top 25: your own row, pinned under the board.
  let pinState = { show: false, rank: null };
  function paintPinned(rank, show) {
    pinState = { show, rank };
    if (!show) { fill(pinned); return; }
    const p = profile(wallet).get().value;
    const ring = equipped(wallet).get().value?.ring;
    const pts = points(wallet).get().value;
    const me = { wallet_address: wallet, display_name: p?.display_name, avatar_nft: p?.avatar_nft, total_points: pts?.total_points, raiding_points: pts?.raiding_points, games_points: pts?.games_points };
    fill(pinned, h('div.rule'), personRow(me, rank, ring, true, true));
  }
  const repin = () => { if (pinState.show) paintPinned(pinState.rank, true); };
  profile(wallet).subscribe(repin, signal);
  equipped(wallet).subscribe(repin, signal);
  points(wallet).subscribe(repin, signal);

  const el = pane({ title: 'Top honey earners', aside: 'Top 25', body: [list, pinned] });
  el.id = 'earn-board';
  return { el };
}

function personRow(p, rank, ring, you, pinned = false) {
  const total = p.total_points;
  return h(`a.row${you ? '.row--you' : ''}`, { href: profileHref(p.wallet_address), 'aria-current': you ? 'true' : null },
    h(`span.row__rank${rank && rank <= 3 ? `.row__rank--${rank}` : ''}${pinned ? '.earn-pin__rank' : ''}`, rank ? (pinned ? `#${num(rank, 0)}` : rank) : '—'),
    avatar(p.avatar_nft, { size: 36, ring }),
    h('div.row__main',
      h('div.row__title.earn-who', h('span.earn-who__name', displayName(p)), you ? h('span.chip.chip--gold.earn-you', 'You') : null),
      h('div.row__sub', total == null ? 'Not ranked yet' : `${num(p.raiding_points, 0)} raid · ${num(p.games_points, 0)} games`)),
    h('div.row__value.up', total == null ? h('span.failed', '—') : num(total, 0), h('small', 'HNY')));
}

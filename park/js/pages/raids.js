// Raids: boost $BEAR on X, earn honey. Live raids as rich cards (the post, its
// author, the reward, what it asks, the time left), a join flow that survives a
// reload (pages/raids/flow.js), your raid record, the X link, and the board.

import { h, icon, fill } from '../core/dom.js';
import { pageHead, pane, pivot, skRows, skFigure, empty, statement, errorLine, avatar, displayName, profileHref, confirmDialog, toast, loadCss } from '../core/ui.js';
import { roll, leaf, rise } from '../core/motion.js';
import { points, raids, role, equippedFor } from '../core/data.js';
import { LINKS } from '../core/market.js';
import { ART } from '../core/art.js';
import { num, ago, plural } from '../core/format.js';
import {
  KINDS, kindOf, pays, postUrl, authorOf, timeLeft, mss, doneFeed, boardFeed, streakOf,
  timers, untilClaim, linkX, unlinkX, openJoin, paintAvatar,
} from './raids/flow.js';

export const title = 'Raids';

const TABS = [{ id: 'live', label: 'Live' }, { id: 'done', label: 'Done' }, { id: 'all', label: 'All' }];
const SOON = 2 * 3600_000;
const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const JOINABLE = new Set(['open', 'timing', 'ready']);
const BOARD_TOP = 10;
const HISTORY_FIRST = 12;

export default function raidsPage({ wallet, query, signal, scope }) {
  loadCss('raids');
  const me = wallet.toLowerCase();
  const done = doneFeed(wallet);
  timers.prune(wallet);

  let tab = TABS.some((t) => t.id === query.get('tab')) ? query.get('tab') : 'live';
  let deep = /^\d+$/.test(query.get('raid') || '') ? query.get('raid') : null;

  let live;                 // live raids (undefined until the first answer)
  let liveAt = 0;
  let liveFailed = false;
  let doneList;             // your completions
  let doneFailed = false;
  let doneById = new Map();
  const cards = new Map();  // raid id → card
  let joinOpen = null;      // the card whose dialog is open

  // ── head ──
  const adminSlot = h('div.raids-admin');
  const head = pageHead({
    eyebrow: 'BOOST $BEAR ON X',
    title: 'Raids',
    gold: 'Raids',
    lede: 'Like, repost or reply to the posts below and earn honey for every raid you finish.',
    aside: adminSlot,
  });

  // ── your record ──
  const honeyFig = h('div.tile__value.num', skFigure('2.2em'));
  const honeySub = h('div.tile__sub', ' ');
  const doneFig = h('div.tile__value.num', skFigure('1.4em'));
  const doneSub = h('div.tile__sub', ' ');
  const rankFig = h('div.tile__value.num', skFigure('1.6em'));
  const rankSub = h('div.tile__sub', ' ');
  const xWho = h('div.raids-x__who', skFigure('4em'));
  const xSub = h('div.tile__sub', ' ');
  const xAct = h('div.raids-x__act');
  const xErr = h('div.raids-x__err');
  let xBusy = false;

  const stack = (...kids) => h('div.stack', { style: { '--gap': '4px' } }, kids);
  const wall = h('div.raids-wall',
    h('div.tile.tile--gold.raids-honey',
      h('img.tile__mascot', { src: ART.honey, alt: '', loading: 'lazy', decoding: 'async' }),
      h('div.tile__label', 'Honey from raids'), stack(honeyFig, honeySub)),
    h('div.tile.tile--purple', h('div.tile__label', 'Raids done'), stack(doneFig, doneSub)),
    h('div.tile.tile--green', h('div.tile__label', 'Raid rank'), stack(rankFig, rankSub)),
    h('div.tile.raids-x',
      h('div.spread', h('div.tile__label', 'X account'), h('span.raids-x__mark', icon('x'))),
      stack(xWho, xSub), xAct, xErr));

  // ── the raids ──
  const count = h('div.section__aside.raids-count', ' ');
  const notice = h('div.raids-notice');
  const grid = h('div.raids-grid');
  const listEl = h('div.raids-list');
  const piv = pivot(TABS, {
    selected: tab, align: 'start', label: 'Show raids',
    onChange: (id) => { tab = id; syncUrl(); renderList(true); },
  });
  const raidsCol = h('section.raids-main', { 'data-e': '' },
    h('div.raids-bar', piv, count), h('div.rule'), notice, listEl);

  // ── the board ──
  const boardRows = h('div.rows', skRows(6));
  const boardMore = h('div.raids-more');
  const how = pane({
    title: 'How raids work',
    body: [h('ol.raids-how', [
      ['Pick a live raid', 'Every card is a post on X that could use a boost.'],
      ['Like, repost or reply', 'Open the post from the raid, do what it asks, then give the timer about two minutes.'],
      ['Claim your honey', 'It lands at once and counts toward today’s BEARdrops.'],
    ].map(([t, b], i) => h('li.raids-how__step', h('span.raids-how__n', String(i + 1)),
      h('div', h('div.raids-how__t', t), h('div.raids-how__b', b)))))],
  });

  const boardPane = pane({ title: 'Top raiders', aside: 'All time', body: [boardRows, boardMore] });
  boardPane.dataset.reveal = '';
  how.dataset.reveal = '';

  const el = h('main.page.raids-page',
    head,
    h('div', { 'data-e': '' }, wall),
    h('div.cols.cols--main.section.raids-cols',
      raidsCol,
      h('div.stack', { 'data-e': '', style: { '--gap': '16px' } }, boardPane, how)));

  // ── standing pieces of the list ──
  const quiet = h('section.park-band.raids-quiet',
    h('img', { src: ART.park, srcset: ART.parkSet, sizes: '100vw', alt: '', loading: 'lazy', decoding: 'async' }),
    h('div.raids-quiet__copy',
      h('div.eyebrow', 'All quiet on X'),
      h('h3.raids-quiet__title', 'No raids live right now'),
      h('p.raids-quiet__body', 'New raids drop through the day. Follow @BearXRPL on X to catch the next one first.'),
      h('div.cluster', h('a.btn', { href: LINKS.x, target: '_blank', rel: 'noopener noreferrer' }, icon('x'), 'Follow @BearXRPL'))));
  const caught = h('div.frost.frost--pad.raids-caught',
    statement({ tone: 'ok', title: 'All caught up', body: 'You’ve done every live raid. New ones drop through the day.' }));
  const nothingDone = h('div.frost', empty('No raids done yet', 'Join a live raid and it lands here with the honey it paid.'));
  const liveFailedEl = h('div.frost', empty('Could not load the raids', 'It retries on its own.'));
  const skCards = h('div.raids-grid', { 'aria-busy': 'true' }, [0, 1].map((i) => h('div.raid.frost.raid--sk',
    h('span.sk.sk--line', { style: { '--w': '42%', '--d': `${i * 90}ms` } }),
    h('span.sk.sk--block', { style: { '--h': '112px', '--d': `${i * 90}ms` } }),
    h('span.sk.sk--line', { style: { '--w': '84%', '--d': `${i * 90}ms` } }),
    h('div.spread', h('span.sk', { style: { width: '72px', height: '34px' } }), h('span.sk', { style: { width: '148px', height: '50px', borderRadius: '16px' } })))));

  // =========================================================================
  // Cards

  function sig(r) {
    return JSON.stringify([r.description, r.twitter_url, r.tweet_text, r.reward, r.profile_name, r.profile_handle,
      r.image_url, r.verification_type, r.expires_at, r.created_at]);
  }

  function makeCard(raid) {
    const c = { raid, state: null, soon: null, ended: false };
    c.time = h('span.raid__time.num');
    c.bar = h('i');
    c.chips = h('div.raid__chips');
    c.action = h('div.raid__action');
    c.join = h('button.btn.btn--gold', { type: 'button', onclick: (e) => join(c, e.currentTarget) });
    c.el = h('article.raid.frost', { id: `raid-${raid.id}` });
    build(c);
    return c;
  }

  /** The parts of a card that only change when the raid itself does. */
  function build(c) {
    const raid = c.raid;
    const who = authorOf(raid);
    c.sig = sig(raid);
    c.url = postUrl(raid);
    c.state = null;
    c.soon = null;
    c.el.setAttribute('aria-label', `Raid: ${raid.description || who.name || 'a post on X'}`);
    const media = who.media ? h('div.raid__media', h('img', {
      src: who.media, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer',
      onerror: (e) => e.currentTarget.parentElement?.remove(),
    })) : null;
    c.el.replaceChildren(
      h('div.raid__head', c.chips, h('span.raid__when', icon('clock'), c.time)),
      h('div.raid__post',
        h('div.raid__who', paintAvatar(h('span.raid__pfp'), who.avatar),
          h('div.raid__id', h('div.raid__name', who.name || 'Post on X'), who.handle ? h('div.raid__handle', `@${who.handle}`) : null),
          h('span.raid__xmark', icon('x'))),
        raid.tweet_text ? h('p.raid__text', raid.tweet_text) : null,
        media),
      raid.description ? h('p.raid__ask', raid.description) : null,
      h('div.raid__bar', { 'aria-hidden': 'true' }, c.bar),
      h('div.raid__foot',
        h('div.raid__reward', h('span.raid__fig.num', num(raid.reward, 0)), h('span.raid__unit', 'Honey')),
        c.action));
    update(c);
  }

  function stateOf(c, now = Date.now()) {
    if (doneById.has(String(c.raid.id))) return 'done';
    const ends = Date.parse(c.raid.expires_at);
    if (c.ended || (Number.isFinite(ends) && ends <= now)) return 'ended';
    if (!pays(c.raid)) return 'unpaid';
    const t = timers.get(wallet, c.raid.id);
    if (!t) return 'open';
    return untilClaim(t, now) > 0 ? 'timing' : 'ready';
  }

  /** Time left, the bar, chips and the action — run every second. */
  function update(c, now = Date.now()) {
    const ends = Date.parse(c.raid.expires_at);
    const left = Number.isFinite(ends) ? ends - now : NaN;
    const text = Number.isFinite(left) ? timeLeft(left) : 'Open-ended';
    if (c.time.textContent !== text) c.time.textContent = text;
    const born = Date.parse(c.raid.created_at);
    const span = ends - born;
    c.bar.style.setProperty('--v', span > 0 ? Math.min(1, Math.max(0, left / span)).toFixed(4) : '1');

    const soon = left > 0 && left < SOON;
    if (soon !== c.soon) {
      c.soon = soon;
      c.el.classList.toggle('raid--soon', soon);
      const K = KINDS[kindOf(c.raid)];
      fill(c.chips,
        h(`span.chip${pays(c.raid) ? '' : '.raid__chip--off'}`, icon(K.icon), K.label),
        soon ? h('span.chip.raid__chip--soon', 'Ending soon') : null);
    }

    const st = stateOf(c, now);
    // While its dialog is open a card keeps its button: the dialog folds back into it.
    const hold = joinOpen === c && !JOINABLE.has(st);
    if (st !== c.state && !hold) { c.state = st; paintAction(c); }
    if (c.state === 'timing') {
      const t = timers.get(wallet, c.raid.id);
      const label = c.join.querySelector('.raid__clock');
      if (t && label) label.textContent = mss(untilClaim(t, now));
    }
  }

  function paintAction(c) {
    const st = c.state;
    c.el.classList.toggle('raid--done', st === 'done');
    c.el.classList.toggle('raid--over', st === 'ended' || st === 'unpaid');
    c.el.classList.toggle('raid--unpaid', st === 'unpaid');
    const view = c.url ? h('a.btn.btn--line.btn--sm', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'View post', icon('external')) : null;
    if (st === 'open') {
      c.join.className = 'btn btn--gold';
      fill(c.join, 'Join raid', icon('arrow-right'));
      fill(c.action, c.join);
    } else if (st === 'timing') {
      c.join.className = 'btn';
      fill(c.join, icon('timer'), 'Claim in ', h('span.raid__clock.num', '0:00'));
      fill(c.action, c.join);
    } else if (st === 'ready') {
      c.join.className = 'btn btn--gold';
      fill(c.join, icon('honey'), 'Claim honey');
      fill(c.action, c.join);
    } else if (st === 'done') {
      const rec = doneById.get(String(c.raid.id));
      fill(c.action, h('span.chip.chip--green', icon('check'), rec?.points_awarded ? `Done · +${num(rec.points_awarded, 0)}` : 'Done'), view);
    } else if (st === 'unpaid') {
      fill(c.action, h('span.raid__note', 'No honey on this one'), view);
    } else {
      fill(c.action, h('span.raid__note', 'Raid ended'), view);
    }
  }

  function join(c, origin) {
    if (joinOpen || !JOINABLE.has(stateOf(c))) return;
    joinOpen = c;
    openJoin({
      raid: c.raid, wallet, origin,
      onChange: () => update(c),
      onPaid: (r) => paid(c, r),
      onEnded: () => { c.ended = true; update(c); },
      onClose: () => {
        joinOpen = null;
        c.el.classList.remove('raid--focus');
        if (signal.aborted) return;
        update(c);
        renderList(false);
      },
    });
  }

  /** The server paid: show it everywhere at once, then confirm from the server. */
  function paid(c, r) {
    const id = String(c.raid.id);
    const got = Number(r?.points_awarded) || Number(c.raid.reward) || 0;
    const list = done.get().value || [];
    if (!doneById.has(id)) {
      done.set([{ raid_id: c.raid.id, completed_at: new Date().toISOString(), points_awarded: r?.alreadyCompleted ? null : got }, ...list]);
    }
    if (!r?.alreadyCompleted) {
      const v = points(wallet).get().value;
      if (v) {
        points(wallet).set({
          ...v,
          total_points: r?.total_points != null ? Number(r.total_points) : (Number(v.total_points) || 0) + got,
          raiding_points: (Number(v.raiding_points) || 0) + got,
        });
      }
    }
    dispatchEvent(new CustomEvent('honeyPointsUpdated'));
    points(wallet).refresh();
    done.refresh();
    boardFeed.refresh();
  }

  // =========================================================================
  // The list

  function syncCards() {
    const ids = new Set(live.map((r) => String(r.id)));
    for (const [id, c] of cards) {
      if (!ids.has(id) && joinOpen !== c) { cards.delete(id); c.el.remove(); }
    }
    for (const r of live) {
      const id = String(r.id);
      const c = cards.get(id);
      if (!c) cards.set(id, makeCard(r));
      else if (sig(r) !== c.sig) { c.raid = r; build(c); }
      else update(c);
    }
  }

  const ends = (c) => Date.parse(c.raid.expires_at) || Infinity;
  const finished = (c) => Date.parse(doneById.get(String(c.raid.id))?.completed_at) || 0;

  let histMemo = { key: null, el: null, all: false };
  function historyBlock() {
    if (doneList === undefined) {
      return doneFailed ? h('div.frost', empty('Could not load your raids', 'It retries on its own.')) : pane({ title: 'Your raid history', body: [skRows(3)] });
    }
    const past = doneList.filter((d) => !cards.has(String(d.raid_id)));
    if (!past.length) return null;
    const key = `${past.length}:${past[0]?.raid_id}:${past[0]?.completed_at}`;
    if (histMemo.key === key && histMemo.el) return histMemo.el;
    const rows = h('div.rows');
    const more = h('div.raids-more');
    const paint = (all) => {
      histMemo.all = all;
      fill(rows, (all ? past : past.slice(0, HISTORY_FIRST)).map((d) => h('div.row',
        h('span.raids-hist__ico', icon('check')),
        h('div.row__main', h('div.row__title', `Raid #${d.raid_id}`), h('div.row__sub', whenDone(d.completed_at))),
        d.points_awarded != null ? h('div.row__value.up', `+${num(d.points_awarded, 0)}`, h('small', 'HNY')) : null)));
      fill(more, past.length > HISTORY_FIRST ? h('button.btn.btn--text', { type: 'button', onclick: () => paint(!all) }, all ? 'Show fewer' : `Show all ${past.length}`) : null);
    };
    paint(histMemo.all);
    histMemo = { key, el: pane({ title: 'Your raid history', aside: plural(past.length, 'raid'), body: [rows, more] }), all: histMemo.all };
    return histMemo.el;
  }

  function renderList(animate) {
    if (live === undefined) {
      fill(listEl, liveFailed ? liveFailedEl : skCards);
      paintCount();
      return;
    }
    syncCards();
    const all = [...cards.values()];
    const isDone = (c) => c.state === 'done' && joinOpen !== c;
    const open = all.filter((c) => !isDone(c)).sort((a, b) => ends(a) - ends(b));
    const finishedCards = all.filter(isDone).sort((a, b) => finished(b) - finished(a));
    const show = tab === 'live' ? open : tab === 'done' ? finishedCards : [...open, ...finishedCards];

    const fresh = [];
    for (const c of show) {
      if (c.el.parentNode !== grid || animate) fresh.push(c.el);
      grid.append(c.el);
    }
    for (const node of [...grid.children]) if (!show.some((c) => c.el === node)) node.remove();

    const parts = [];
    if (show.length) parts.push(grid);
    else if (tab === 'live') parts.push(live.length ? caught : quiet);
    else if (tab === 'all' && !live.length) parts.push(quiet);
    if (tab !== 'live') {
      const hist = historyBlock();
      if (hist) parts.push(hist);
      else if (tab === 'done' && !show.length && doneList !== undefined) parts.push(nothingDone);
    }
    const before = [...listEl.children];
    const mounted = el.isConnected; // before mounting, the page entrance brings it all in
    if (parts.length !== before.length || parts.some((p, i) => p !== before[i])) {
      fill(listEl, parts);
      if (animate && mounted) leaf(parts.filter((p) => p !== grid));
    }
    if (fresh.length && mounted) leaf(fresh);
    paintCount();
  }

  function paintCount() {
    const bits = [];
    if (live !== undefined) bits.push(`${num([...cards.values()].filter((c) => c.state !== 'done').length, 0)} live`);
    if (doneList !== undefined) bits.push(`${num(doneList.length, 0)} done`);
    count.textContent = bits.join(' · ') || ' ';
  }

  // =========================================================================
  // Your record and the X link

  function paintDone() {
    if (doneList === undefined) {
      if (doneFailed) { fill(doneFig, h('span.failed', '—')); doneSub.textContent = "couldn't load · retrying"; }
      return;
    }
    if (!doneFig.dataset.rolled) doneFig.replaceChildren();
    roll(doneFig, num(doneList.length, 0));
    const streak = streakOf(doneList);
    const last = doneList.reduce((m, d) => Math.max(m, Date.parse(d.completed_at) || 0), 0);
    doneSub.textContent = streak >= 2 ? `${streak}-day streak` : last ? `Last raid ${ago(last)}` : 'Your first raid is waiting';
  }

  function paintRank(list) {
    const i = list.findIndex((p) => String(p.wallet_address).toLowerCase() === me);
    if (i >= 0) {
      if (!rankFig.dataset.rolled) rankFig.replaceChildren();
      roll(rankFig, `#${num(i + 1, 0)}`);
      rankSub.textContent = `of ${plural(list.length, 'raider')}`;
    } else {
      delete rankFig.dataset.rolled;
      fill(rankFig, h('span.raids-unranked', 'Unranked'));
      rankSub.textContent = 'Finish a raid to get on the board';
    }
  }

  let xKey = null;
  function paintX(s, force = false) {
    if (xBusy) return;
    const v = s?.value;
    if (!v) {
      if (s?.error && xKey === null) { fill(xWho, h('span.failed', '—')); xSub.textContent = "couldn't load · retrying"; fill(xAct); }
      return;
    }
    const key = `${!!v.twitter_connected}:${v.twitter_username || ''}`;
    if (key === xKey && !force) return; // a refresh with nothing new: leave the buttons (and focus) alone
    if (key !== xKey) fill(xErr);       // the link changed: an old error no longer applies
    xKey = key;
    if (v.twitter_connected) {
      fill(xWho, v.twitter_username ? `@${v.twitter_username}` : 'Linked');
      xSub.textContent = 'Linked to this wallet';
      const btn = h('button.btn.btn--sm', { type: 'button', onclick: () => disconnect(btn, v.twitter_username) }, 'Disconnect');
      fill(xAct, btn);
    } else {
      fill(xWho, h('span.raids-x__off', 'Not linked'));
      xSub.textContent = 'Link the X account you raid with';
      const btn = h('button.btn.btn--sm', { type: 'button', onclick: () => connect(btn) }, icon('x'), 'Connect X');
      fill(xAct, btn);
    }
  }

  function connect(btn) {
    fill(xErr);
    const p = linkX(wallet); // opens the pop-up inside this click
    fill(btn, icon('x'), 'Finish on X');
    p.then((u) => {
      toast({ eyebrow: 'X LINKED', title: u ? `@${u}` : 'X account linked', body: 'Your X account is now linked to this wallet.' });
    }).catch((err) => {
      if (!err?.quiet && !signal.aborted) fill(xErr, errorLine(err.message, { small: true }));
    }).finally(() => paintX(points(wallet).get(), true));
  }

  async function disconnect(btn, username) {
    fill(xErr);
    const ok = await confirmDialog({
      title: 'Disconnect X?',
      body: `${username ? `@${username}` : 'Your X account'} will be unlinked from this wallet. You can link it again any time.`,
      confirm: 'Disconnect', danger: true, origin: btn,
    });
    if (!ok || signal.aborted) return;
    xBusy = true;
    btn.disabled = true;
    try {
      await unlinkX(wallet);
    } catch (err) {
      fill(xErr, errorLine(err.message, { small: true }));
    } finally {
      xBusy = false;
      btn.disabled = false;
      paintX(points(wallet).get(), true);
    }
  }

  // =========================================================================
  // The board

  let boardList = null;
  let boardAll = false;
  let boardToken = 0;
  let boardPainted = false;
  async function paintBoard() {
    const list = boardList;
    const my = ++boardToken;
    if (!list.length) { fill(boardRows, empty('No raiders yet', 'Finish a raid and open the board.')); fill(boardMore); return; }
    const mine = list.findIndex((p) => String(p.wallet_address).toLowerCase() === me);
    const top = list.slice(0, boardAll ? 100 : BOARD_TOP);
    const extra = mine >= top.length ? mine : -1;
    const rings = await equippedFor([...top, ...(extra >= 0 ? [list[extra]] : [])].map((p) => p.wallet_address));
    if (my !== boardToken || signal.aborted) return;
    const row = (p, i) => {
      const you = String(p.wallet_address).toLowerCase() === me;
      const linkable = ADDRESS.test(p.wallet_address) && /[A-Z]/.test(p.wallet_address);
      return h(linkable ? 'a.row' : 'div.row', { href: linkable ? profileHref(p.wallet_address) : null, class: you ? 'row--you' : null },
        h(`span.row__rank${i < 3 ? `.row__rank--${i + 1}` : ''}`, i + 1),
        avatar(p.avatar_nft, { size: 36, name: displayName(p), ring: rings[p.wallet_address]?.ring }),
        h('div.row__main',
          h('div.row__title', displayName(p), you ? h('span.raids-you', 'You') : null),
          h('div.row__sub', plural(p.total_raids, 'raid'))),
        h('div.row__value', num(p.total_points, 0), h('small', 'HNY')));
    };
    fill(boardRows, top.map(row), extra >= 0 ? [h('div.raids-gap', { 'aria-hidden': 'true' }, icon('dots')), row(list[extra], extra)] : null);
    fill(boardMore, list.length > BOARD_TOP
      ? h('button.btn.btn--text', { type: 'button', onclick: () => { boardAll = !boardAll; paintBoard(); } }, boardAll ? 'Show top 10' : `Show all ${num(Math.min(list.length, 100), 0)}`)
      : null);
    if (!boardPainted && el.isConnected) leaf(boardRows.children);
    boardPainted = true;
  }

  // =========================================================================
  // Deep links: ?raid=<id> lands on that raid and opens it.

  function syncUrl() {
    history.replaceState(null, '', `#/raids${tab !== 'live' ? `?tab=${tab}` : ''}`);
  }

  function resolveDeep() {
    if (!deep || live === undefined || signal.aborted) return;
    if (!el.isConnected) { setTimeout(resolveDeep, 120); return; }
    const id = deep;
    const c = cards.get(id);
    if (c) {
      deep = null;
      const st = stateOf(c);
      const want = st === 'done' ? (tab === 'live' ? 'done' : tab) : (tab === 'done' ? 'live' : tab);
      if (want !== tab) piv.select(want);
      syncUrl();
      c.el.classList.add('raid--focus');
      setTimeout(() => {
        if (signal.aborted) return;
        c.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (JOINABLE.has(stateOf(c))) setTimeout(() => { if (!signal.aborted && c.el.isConnected) join(c, c.join); }, 450);
        else if (st === 'done') fill(notice, statement({ tone: 'ok', title: 'Already done', body: 'You finished this raid and its honey is in your balance.' }));
      }, 380);
      return;
    }
    // A warm copy of the list may predate the raid: wait for a live answer.
    if (Date.now() - liveAt > 35_000) return;
    if (doneList === undefined && !doneFailed) return;
    deep = null;
    // The note below points at what's live: show it (a done raid's link may have left Done open).
    if (!doneById.has(id) && tab === 'done') piv.select('live');
    syncUrl();
    const past = doneById.get(id);
    fill(notice, statement(past
      ? { tone: 'ok', title: 'Already done', body: `You finished raid #${id} ${ago(past.completed_at)}${past.points_awarded ? ` and earned ${num(past.points_awarded, 0)} honey` : ''}.` }
      : { tone: 'info', title: 'That raid has ended', body: live.length ? `Raid #${id} is no longer live. Here’s what is live now.` : `Raid #${id} is no longer live. New raids drop through the day.` }));
    rise(notice);
  }

  el.onQuery = (q) => {
    const t = q.get('tab');
    if (TABS.some((x) => x.id === t) && t !== tab) piv.select(t);
    const id = q.get('raid');
    if (/^\d+$/.test(id || '')) { deep = id; fill(notice); resolveDeep(); }
  };

  // =========================================================================
  // Feeds

  role(wallet).subscribe((s) => {
    const r = s.value?.role;
    fill(adminSlot, r === 'admin' || r === 'master'
      ? h('a.btn.btn--line.btn--sm', { href: '/admin-raids.html' }, icon('flag'), 'Manage raids')
      : null);
  }, signal);

  points(wallet).subscribe((s) => {
    if (s.value) {
      if (!honeyFig.dataset.rolled) honeyFig.replaceChildren();
      roll(honeyFig, num(s.value.raiding_points, 0));
      honeySub.textContent = `of ${num(s.value.total_points, 0)} honey in all`;
    } else if (s.error && !honeyFig.dataset.rolled) {
      fill(honeyFig, h('span.failed', '—'));
      honeySub.textContent = "couldn't load · retrying";
    }
    paintX(s);
  }, signal);

  raids.subscribe((s) => {
    if (s.value) { live = s.value; liveAt = s.at; liveFailed = false; }
    else if (s.error) liveFailed = true;
    renderList(false);
    resolveDeep();
  }, signal);

  done.subscribe((s) => {
    if (s.value) {
      doneList = s.value;
      doneFailed = false;
      doneById = new Map(s.value.map((d) => [String(d.raid_id), d]));
      timers.prune(wallet, new Set(doneById.keys()));
    } else if (s.error) {
      doneFailed = true;
    }
    paintDone();
    for (const c of cards.values()) update(c);
    renderList(false);
    resolveDeep();
  }, signal);

  boardFeed.subscribe((s) => {
    if (s.value) {
      boardList = s.value;
      paintRank(s.value);
      paintBoard();
    } else if (s.error && !boardPainted) {
      fill(boardRows, empty('Could not load the board', 'It retries on its own.'));
      fill(rankFig, h('span.failed', '—'));
      rankSub.textContent = "couldn't load · retrying";
    }
  }, signal);

  // Linked in another tab, or the callback page wrote it after the pop-up lost its opener.
  scope.on(window, 'storage', (e) => { if (e.key === 'twitter_username') points(wallet).refresh(); });

  // One clock for every card (and nothing ticks while the tab is hidden).
  const tick = setInterval(() => {
    if (document.hidden) return;
    const now = Date.now();
    for (const c of cards.values()) update(c, now);
  }, 1000);
  scope.add(() => clearInterval(tick));

  return el;
}

function whenDone(ts) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return 'Done';
  return `${new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} · ${ago(t)}`;
}

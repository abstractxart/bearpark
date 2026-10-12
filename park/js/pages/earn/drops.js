// BEARdrops: the daily $BEAR drop, as the server actually runs it.
//
//   snapshot  backend/daily-airdrop-snapshot.js runs once a day at 06:29 UTC
//             (rows land ~06:31). It counts every BEAR NFT (taxon 0 = Ultra
//             Rare, every other taxon = Pixel BEAR) and every BEAR/XRP LP
//             token. total = pixel × rate + ultra × rate + LP ÷ lp_tokens_per_bear.
//   claim     POST /api/beardrops/claim pays ONLY yesterday's snapshot, during
//             today's UTC day (00:00–24:00); missed days are gone. It needs
//             min_honey_points_24h honey earned since 00:00 UTC, and pays
//             min(stored total, pixel + 5·ultra + ⌊LP / 250,000⌋) — LP counts in
//             whole $BEAR. Flagged (lp_blacklist) wallets' snapshots can't be claimed.
//
// claim-status shares a 5-a-minute rate limit, so it's read once, then every
// five minutes, and again when the UTC day turns — never on a fast poll.

import { h, icon, fill } from '../../core/dom.js';
import { api, post, live } from '../../core/api.js';
import { skFigure, skLine, skRows, failedFigure, errorLine, statement, empty, toast, dialog, words, external } from '../../core/ui.js';
import { roll, rise, leaf } from '../../core/motion.js';
import { honey24h } from '../../core/data.js';
import { bearNfts, lpPosition, holdings } from '../../core/ledger.js';
import { bearFeed, LINKS } from '../../core/market.js';
import { num, compact, short, duration, untilUtcMidnight, usd } from '../../core/format.js';
import { ART } from '../../core/art.js';
import { celebrate } from '../../core/fun.js';

// ---------------------------------------------------------------------------
// Feeds

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const SNAPSHOT_UTC = { h: 6, m: 30 }; // scheduled 06:29, rows land ~06:31

/** The rules: { min, perPixel, perUltra, lpPerBear, enabled } */
export const dropsConfig = live('park:drops:config', async () => {
  const c = (await api('/beardrops/config')).config || {};
  const n = (key, fallback, positive = false) => {
    const v = Number(c[key]);
    return Number.isFinite(v) && (positive ? v > 0 : v >= 0) ? v : fallback;
  };
  return {
    min: n('min_honey_points_24h', 30),
    perPixel: n('bear_per_pixel_bear', 1),
    perUltra: n('bear_per_ultra_rare', 5),
    lpPerBear: n('lp_tokens_per_bear', 250000, true),
    enabled: String(c.airdrop_enabled ?? 'true') !== 'false',
  };
}, { every: 30 * 60_000 });

/** Today's claim: yesterday's snapshot, whether it's claimed, and the honey gate. */
export const dropStatus = (w) => live(`park:drops:status:${w}`, async () => {
  const r = await api(`/beardrops/claim-status/${w}`);
  return {
    day: utcDay(),
    honey: Number(r.honey_points_24h) || 0,
    min: Number(r.min_required) || 0,
    canClaim: !!r.can_claim,
    claimedToday: !!r.claimed_today,
    amount: r.amount == null ? null : Number(r.amount),
    txHash: r.tx_hash || null,
    pending: r.pending_rewards || [],
    totalPending: Number(r.total_pending) || 0,
    recent: r.recent_claims || [],
  };
}, { every: 5 * 60_000 });

/** The last 30 daily snapshots, newest first. */
export const dropHistory = (w) => live(`park:drops:history:${w}`, async () => ({
  day: utcDay(),
  rows: (await api(`/beardrops/history/${w}?limit=30`)).history || [],
}), { every: 10 * 60_000 });

/** Whether the LP scanner flagged this wallet. */
export const dropFlags = (w) => live(`park:drops:flags:${w}`, async () => {
  const r = await api(`/beardrops/eligibility/${w}`);
  return { flagged: !!r.is_blacklisted, reason: r.blacklist_reason || null };
}, { every: 15 * 60_000 });

// ---------------------------------------------------------------------------
// Rules and formatting

/** What the claim endpoint would pay for a snapshot row. */
export function payout(row, cfg) {
  const total = Number(row?.total_reward) || 0;
  if (!cfg) return total;
  if (row?.pixel_bears == null) {
    // No counts on this row: with whole-$BEAR NFT rates, the LP floor makes the paid amount the whole part.
    return Number.isInteger(cfg.perPixel) && Number.isInteger(cfg.perUltra) ? Math.floor(total + 1e-9) : total;
  }
  const calc = (Number(row.pixel_bears) || 0) * cfg.perPixel + (Number(row.ultra_rares) || 0) * cfg.perUltra
    + Math.floor((Number(row.lp_tokens) || 0) / cfg.lpPerBear);
  return Math.min(total, calc);
}

/** The live base: what tomorrow's snapshot would count right now. */
export function baseOf(nfts, lp, cfg) {
  const ultra = nfts.all.filter((n) => n.NFTokenTaxon === 0).length; // the snapshot's rule
  const pixel = nfts.all.length - ultra;
  const lpTokens = Number(lp?.lp) || 0;
  const lpBear = Math.floor(lpTokens / cfg.lpPerBear);
  return { pixel, ultra, lpTokens, lpBear, total: pixel * cfg.perPixel + ultra * cfg.perUltra + lpBear };
}

export const fmtBear = (v) => num(v, 2);
const dayFmt = (ymd, opts = { month: 'short', day: 'numeric' }) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
const yesterday = () => utcDay(Date.now() - 86_400_000);

function cleanMessage(err) {
  if (err?.body?.code === 'tecPATH_DRY') return 'Your wallet has no $BEAR trust line yet. Add it on BEAR Swap, then claim again.';
  const msg = String(err?.message || 'The claim did not go through. Try again in a minute.');
  return msg.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

const REASONS = {
  single_side_deposit: 'a one-sided deposit into the BEAR/XRP pool',
  single_side_withdraw: 'a one-sided withdrawal from the BEAR/XRP pool',
};

/** The value of some $BEAR in XRP (and USD) at BEAR Swap's price, or ''. */
function worth(bear) {
  const m = bearFeed.get().value;
  if (!m?.price || !(bear > 0)) return '';
  const xrp = bear * m.price;
  return `≈ ${xrp >= 100 ? num(xrp, 0) : num(xrp, 2)} XRP${m.priceUsd ? ` · ${usd(bear * m.priceUsd)}` : ''}`;
}

/** Subscribe to several feeds; `fn(states)` runs once per change batch. */
function watch(feeds, fn, signal) {
  const states = feeds.map((f) => f.get());
  let queued = false;
  feeds.forEach((f, i) => f.subscribe((s) => {
    states[i] = s;
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!signal?.aborted) fn(states.slice()); });
  }, signal));
}

// ---------------------------------------------------------------------------
// The section

/**
 * createDrops({ wallet, signal, scope }) → { pane, tile }
 * `pane` is the BEARdrops section; `tile` is the purple summary tile for the
 * hero wall (it scrolls to the pane).
 */
export function createDrops({ wallet, signal, scope }) {
  const status = dropStatus(wallet);
  const history = dropHistory(wallet);
  const flags = dropFlags(wallet);
  const today = honey24h(wallet);
  const nfts = bearNfts(wallet);
  const lp = lpPosition(wallet);

  // ── clocks: one tick a second drives every countdown on the section ──
  const clocks = new Set();
  const clock = (target, fmt = (ms) => duration(ms)) => {
    const el = h('span.num');
    const paint = () => { el.textContent = fmt(Math.max(0, target() - Date.now())); };
    paint();
    clocks.add(() => { if (!el.isConnected) return false; paint(); return true; });
    return el;
  };
  const midnight = () => Date.now() + untilUtcMidnight();

  const minuteOfDay = () => { const d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const SNAP_MIN = SNAPSHOT_UTC.h * 60 + SNAPSHOT_UTC.m;
  let day = utcDay();
  // Opened after the snapshot landed: the first read already has today's row (or never will).
  let snapChecked = minuteOfDay() >= SNAP_MIN + 4 ? day : '';
  let staleTried = '';
  const timer = setInterval(() => {
    for (const fn of clocks) if (fn() === false) clocks.delete(fn);
    paintFacts(); // keyed: repaints only when the snapshot phase moves
    const now = utcDay();
    if (now !== day) { // the window turned: yesterday's drop is gone, today's opens
      day = now;
      status.refresh();
      history.refresh();
      today.refresh();
      paintAll();
    }
    // A few minutes after the snapshot, look for today's row once.
    if (snapChecked !== now && minuteOfDay() >= SNAP_MIN + 4) {
      snapChecked = now;
      if (!history.get().value?.rows?.some((r) => r.snapshot_date === now)) history.refresh();
    }
  }, 1000);
  scope.add(() => clearInterval(timer));

  // ── the shared state ──
  let st = {};
  let busy = false;
  let claimBtn = null;
  const paneErr = h('div.claim-err'); // a claim that fails after its dialog was closed reports here
  function setBusy(v) {
    busy = v;
    if (!claimBtn) return;
    claimBtn.el.disabled = v;
    fill(claimBtn.el, v ? 'Sending to your wallet' : ['Claim ', fmtBear(claimBtn.amount), ' $BEAR']);
  }

  function state() {
    const s = st.status?.value;
    const cfg = st.config?.value;
    if (!s || s.day !== utcDay()) return { kind: st.status?.error && !s ? 'failed' : 'loading' };
    const f = st.flags?.value;
    if (f?.flagged) return { kind: 'flagged', reason: f.reason };
    if (cfg && !cfg.enabled) return { kind: 'paused' };
    if (s.claimedToday) {
      const row = (st.history?.value?.rows || []).find((r) => r.snapshot_date === yesterday());
      // 'processing': sent, but the ledger hasn't confirmed it yet (the server holds it until it does).
      return { kind: 'claimed', sending: row?.claim_status === 'processing', amount: row ? payout(row, cfg) : s.amount == null ? null : payout({ total_reward: s.amount }, cfg), tx: s.txHash };
    }
    if (s.totalPending > 0) {
      const date = s.pending[0]?.snapshot_date || yesterday();
      const row = (st.history?.value?.rows || []).find((r) => r.snapshot_date === date);
      const amount = payout(row || { total_reward: s.totalPending }, cfg);
      const min = cfg?.min ?? s.min;
      // The live honey feed flips this the moment a game or raid lands; the server re-checks on claim.
      const honey = st.today?.value ?? s.honey;
      return { kind: honey >= min ? 'ready' : 'earn', amount, date, honey, min };
    }
    return { kind: 'none' };
  }

  // ── the hero tile ──
  const tileValue = h('div.tile__value.tile__value--md', skFigure('3em'));
  const tileSub = h('div.tile__sub', ' ');
  const tile = h('button.tile.tile--purple.earn-drop', {
    type: 'button',
    onclick: () => {
      pane.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      paneHead.focus({ preventScroll: true });
    },
  },
  h('img.tile__mascot.earn-drop__mascot', { src: ART.coin, alt: '', loading: 'lazy', decoding: 'async' }),
  h('div.tile__label', 'BEARdrop today'),
  h('div.stack', { style: { '--gap': '4px' } }, tileValue, tileSub));

  let tileKind = '';
  function paintTile(s) {
    const key = `${s.kind}:${s.amount ?? ''}:${s.kind === 'earn' ? s.honey : ''}:${s.sending ? 1 : ''}`;
    if (key === tileKind) return;
    const first = !tileKind || tileKind.startsWith('loading');
    tileKind = key;
    if (s.kind === 'loading') { fill(tileValue, skFigure('3em')); tileSub.textContent = ' '; return; }
    if (s.kind === 'failed') { fill(tileValue, failedFigure()); tileSub.textContent = ''; return; }
    const amountFig = (v) => [h('span.num', fmtBear(v)), h('span.stat__unit', '$BEAR')];
    const map = {
      ready: () => [amountFig(s.amount), ['Ready to claim · closes in ', clock(midnight)]],
      earn: () => [amountFig(s.amount), [`${num(Math.max(0, s.min - s.honey), 1)} more honey to claim · `, clock(midnight), ' left']],
      claimed: () => [s.amount != null ? amountFig(s.amount) : 'Claimed', [s.sending ? 'On its way · next drop in ' : 'Claimed · next drop in ', clock(midnight)]],
      none: () => ['None today', 'A new drop can land with the next daily snapshot'],
      flagged: () => ['Paused', 'This wallet is flagged'],
      paused: () => ['Paused', 'BEARdrops are off for now'],
    };
    const [value, sub] = map[s.kind]();
    fill(tileValue, value);
    fill(tileSub, sub);
    if (!first) rise(tileValue, { px: 8, duration: 360 });
  }

  // ── today's drop ──
  const paneHead = h('div.eyebrow', { tabIndex: -1 }, 'BEARdrops');
  const chipSlot = h('div.section__aside');
  const now = h('div.drops-now', skeletonNow());

  function skeletonNow() {
    return [h('div.caption', skLine('40%')), h('div.drops-fig', skFigure('3.4em')), skLine('30%'), h('span.sk.sk--block', { style: { '--h': '50px', marginTop: '18px' } })];
  }

  let nowKey = '';
  function paintNow(s) {
    const key = JSON.stringify([s.kind, s.amount, s.tx, s.kind === 'earn' ? s.honey : 0, !!s.sending, !!bearFeed.get().value, utcDay()]);
    if (key === nowKey) return;
    const wasLoading = !nowKey || nowKey.startsWith('["loading"');
    nowKey = key;

    const chip = {
      ready: h('span.chip.chip--gold', 'Ready'),
      earn: h('span.chip', 'Not yet'),
      claimed: s.sending ? h('span.chip', 'Sending') : h('span.chip.chip--green', 'Claimed'),
      none: h('span.chip', 'Nothing today'),
      flagged: h('span.chip.chip--red', 'Flagged'),
      paused: h('span.chip.chip--purple', 'Paused'),
    }[s.kind];
    fill(chipSlot, chip || null);

    if (s.kind === 'loading') { fill(now, skeletonNow()); return; }
    if (s.kind === 'failed') { fill(now, errorLine("Today's drop couldn't load. It retries on its own.")); return; }

    if (s.kind === 'flagged') {
      fill(now, statement({
        tone: 'danger',
        title: 'This wallet is paused from BEARdrops',
        body: `Our pool scanner flagged ${REASONS[s.reason] || 'activity in the BEAR/XRP pool'} from this wallet, so its daily snapshots can't be claimed. If that looks wrong, a moderator on Discord can review it.`,
        children: h('div', { style: { marginTop: '12px' } }, external(LINKS.discord, 'Ask on Discord', 'btn btn--line')),
      }));
      return;
    }
    if (s.kind === 'paused') {
      fill(now, statement({ tone: 'info', title: 'BEARdrops are paused', body: 'Claims are off for now. Your honey and your snapshots still count when they return.' }));
      return;
    }

    const fig = h('span.num');
    const head = (caption, value) => [
      h('div.caption', caption),
      h('div.drops-fig', value, h('span.drops-fig__unit', '$BEAR')),
      h('div.drops-worth', worth(s.amount) || ' '),
    ];

    if (s.kind === 'none') {
      fill(now,
        h('div.caption', "Today's drop"),
        h('div.drops-headline', 'Nothing to claim today'),
        h('p.body.drops-note', 'Hold Pixel or Ultra Rare BEARs, or BEAR/XRP LP, at the daily snapshot — that drop opens the next UTC day.'));
      return;
    }

    if (s.kind === 'claimed') {
      fill(now,
        h('div.caption', s.sending ? "Today's drop · on its way" : "Today's drop · claimed"),
        s.amount != null ? h('div.drops-fig', fig, h('span.drops-fig__unit', '$BEAR')) : h('div.drops-headline', s.sending ? 'On its way' : 'Claimed'),
        s.amount != null ? h('div.drops-worth', worth(s.amount) || ' ') : null,
        s.sending
          ? h('div.drops-done',
            h('span.drops-done__mark', icon('clock')),
            h('div', h('b', 'On its way to your wallet'), h('div.muted', 'The XRP Ledger hasn’t confirmed it yet. Check your wallet in a few minutes; if it never arrives, an admin can look it up.')))
          : h('div.drops-done',
            h('span.drops-done__mark', icon('check')),
            h('div', h('b', 'Sent to your wallet'), h('div.muted', 'The next drop opens at 00:00 UTC, in ', clock(midnight), '.'))),
        s.tx ? h('div.cluster', { style: { marginTop: '14px' } },
          external(LINKS.tx(s.tx), 'View on the ledger', 'btn btn--line'),
          h('span.caption.num', short(s.tx, 6, 6))) : null);
      if (s.amount != null) queueMicrotask(() => roll(fig, fmtBear(s.amount)));
      return;
    }

    const caption = `Today's drop · snapshot ${dayFmt(s.date)}`;
    if (s.kind === 'ready') {
      const claim = h('button.btn.btn--gold.drops-claim', { type: 'button', onclick: (e) => openClaim(e, s) });
      claimBtn = { el: claim, amount: s.amount };
      setBusy(busy);
      fill(now, head(caption, fig),
        h('div.drops-act', claim, h('div.drops-act__note', 'Closes in ', clock(midnight), h('br'), h('span.faint', '00:00 UTC · then it expires'))),
        paneErr);
    } else {
      const left = Math.max(0, s.min - s.honey);
      const meter = h('i', { style: { '--v': Math.min(1, s.honey / (s.min || 1)) } });
      fill(now, head(caption, fig),
        h('div.drops-gate',
          h('div.spread', h('span.caption', 'Honey today'), h('span.drops-gate__count.num', num(s.honey, 1), h('span.faint', ` / ${num(s.min, 0)}`))),
          h('div.meter.drops-gate__meter', { role: 'progressbar', 'aria-label': 'Honey earned today toward the BEARdrop minimum', 'aria-valuemin': '0', 'aria-valuemax': String(s.min), 'aria-valuenow': String(Math.min(s.honey, s.min)) }, meter),
          h('p.body.drops-note', 'Earn ', h('b', `${num(left, 1)} more honey`), ' before 00:00 UTC — in ', clock(midnight), ' — to claim it. Unclaimed drops expire.'),
          h('div.cluster', { style: { '--gap': '8px' } },
            h('a.btn.btn--line', { href: '#/play' }, icon('gamepad'), 'Play a game'),
            h('a.btn.btn--line', { href: '#/raids' }, icon('flag'), 'Join a raid'))));
    }
    queueMicrotask(() => roll(fig, fmtBear(s.amount)));
    if (!wasLoading) rise(now, { px: 8, duration: 360 });
  }

  // ── facts: today's snapshot and the claim window. The snapshot's time of day
  // is deliberately not shown (owner's call, 2026-10-11): a published time lets
  // people add LP just before it and pull it right after. ──
  const facts = h('div.drops-facts');
  let factsKey = '';
  function paintFacts() {
    const rows = st.history?.value?.rows;
    const cfg = st.config?.value;
    const todayRow = rows?.find((r) => r.snapshot_date === utcDay());
    const flagged = !!st.flags?.value?.flagged;
    const key = JSON.stringify([!!rows, !!st.history?.error, todayRow?.total_reward, !!cfg, utcDay(), flagged]);
    if (key === factsKey) return;
    factsKey = key;
    const fact = (label, value, sub) => h('div.drops-fact', h('div.caption', label), h('div.drops-fact__value', value), h('div.drops-fact__sub', sub));
    fill(facts,
      todayRow
        ? fact("Today's snapshot", [fmtBear(payout(todayRow, cfg)), h('span.stat__unit', '$BEAR')], flagged ? 'Not claimable while flagged' : 'Yours to claim tomorrow')
        : !rows ? fact("Today's snapshot", st.history?.error ? failedFigure() : skFigure('2.4em'), ' ')
          : fact("Today's snapshot", h('span.faint', 'Pending'), 'Taken once a day, at a time that isn’t announced'),
      fact("Today's window", clock(midnight), 'Left to claim · closes 00:00 UTC'));
  }

  // ── your base, live from the wallet ──
  const base = h('div.rows', skRows(3));
  const baseTotal = h('div.drops-total');
  let baseKey = '';
  function paintBase() {
    const [n, l, c, f] = [st.nfts, st.lp, st.config, st.flags];
    const ready = n?.value && l?.value !== undefined && c?.value;
    const failed = (n?.error && !n.value) || (l?.error && l.value === undefined) || (c?.error && !c.value);
    const key = ready ? JSON.stringify([n.value.all.length, l.value?.lp, c.value, f?.value?.flagged, !!bearFeed.get().value]) : failed ? 'failed' : 'loading';
    if (key === baseKey) return;
    const first = !baseKey || baseKey === 'loading';
    baseKey = key;
    if (!ready) {
      if (failed) { fill(base, h('div.pane-body', errorLine("Your wallet couldn't be read just now. It retries on its own.", { small: true }))); fill(baseTotal); }
      return;
    }
    if (l.value === null) { fill(base, h('div.pane-body', errorLine("The BEAR/XRP pool couldn't be read just now.", { small: true }))); fill(baseTotal); return; }
    const cfg = c.value;
    const b = baseOf(n.value, l.value, cfg);
    const lpOff = !!f?.value?.flagged;
    const row = (glyph, title, sub, value) => h('div.row.drops-base',
      h('span.drops-glyph', glyph), h('div.row__main', h('div.row__title', title), h('div.row__sub', sub)),
      h('div.row__value', value, h('small', '$BEAR')));
    fill(base,
      row('P', 'Pixel BEARs', `${num(b.pixel, 0)} × ${num(cfg.perPixel, 2)} $BEAR`, num(b.pixel * cfg.perPixel, 2)),
      row('U', 'Ultra Rare BEARs', `${num(b.ultra, 0)} × ${num(cfg.perUltra, 2)} $BEAR`, num(b.ultra * cfg.perUltra, 2)),
      row('LP', 'BEAR/XRP LP', lpOff ? `${compact(b.lpTokens)} LP · not counted while flagged` : `${compact(b.lpTokens)} LP ÷ ${compact(cfg.lpPerBear)}, whole $BEAR`, num(lpOff ? 0 : b.lpBear, 0)));
    const total = lpOff ? b.total - b.lpBear : b.total;
    fill(baseTotal,
      h('div', h('div.caption', 'Estimated drop'), h('div.drops-total__sub', 'If the snapshot ran now')),
      h('div.drops-total__value', h('span.num', total > 0 ? '≈ ' : '', fmtBear(total)), h('span.drops-fig__unit', '$BEAR'), h('div.drops-total__sub', worth(total) || ' ')));
    if (first) leaf(base.children);
  }

  // ── history: claims and daily snapshots ──
  let tab = 'claims';
  let showAll = false;
  const list = h('div.rows', skRows(4));
  const more = h('div.pane-body.drops-more');
  const tabs = words([{ id: 'claims', label: 'Claims' }, { id: 'days', label: 'Snapshots' }], {
    selected: tab,
    onChange: (id) => { tab = id; showAll = false; histKey = ''; paintHistory(true); },
  });

  const dateBlock = (d, utc) => h('span.drop-date', { 'aria-hidden': 'true' },
    h('b', utc ? d.getUTCDate() : d.getDate()),
    h('small', d.toLocaleDateString('en-US', { month: 'short', ...(utc ? { timeZone: 'UTC' } : {}) })));

  let histKey = '';
  function paintHistory(animate = false) {
    const hs = st.history;
    const ss = st.status;
    const cfg = st.config?.value;
    const rows = hs?.value?.rows;
    const key = JSON.stringify([tab, showAll, utcDay(), rows?.length, rows?.[0]?.snapshot_date, rows?.filter((r) => r.claim_status !== 'pending').length, ss?.value?.recent?.length, !!cfg]);
    if (key === histKey) return;
    const first = !histKey;
    histKey = key;

    if (tab === 'claims') {
      if (!rows && !ss?.value) {
        if ((hs?.error || ss?.error)) fill(list, h('div.pane-body', errorLine("Your claims couldn't load. They retry on their own.", { small: true })));
        fill(more);
        return;
      }
      const byDate = new Map();
      for (const c of ss?.value?.recent || []) byDate.set(c.snapshot_date, { ...c });
      for (const r of rows || []) if (r.claim_status === 'claimed') byDate.set(r.snapshot_date, { ...byDate.get(r.snapshot_date), ...r });
      const claims = [...byDate.values()].sort((a, b) => Date.parse(b.claimed_at || b.snapshot_date) - Date.parse(a.claimed_at || a.snapshot_date));
      if (!claims.length) {
        fill(list, empty('No claims yet', 'Each drop you claim lands here with its ledger receipt.'));
        fill(more);
        return;
      }
      const shown = showAll ? claims : claims.slice(0, 6);
      fill(list, shown.map((c) => {
        const when = c.claimed_at ? new Date(c.claimed_at) : new Date(`${c.snapshot_date}T00:00:00Z`);
        const amount = payout(c, cfg);
        const time = c.claimed_at ? when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        const inner = [
          dateBlock(when, !c.claimed_at),
          h('div.row__main', h('div.row__title', `${fmtBear(amount)} $BEAR`), h('div.row__sub', `Snapshot ${dayFmt(c.snapshot_date)}${time ? ` · claimed ${time}` : ''}`)),
          c.claim_tx_hash ? h('span.row__value.drops-tx', short(c.claim_tx_hash, 4, 4), icon('external')) : null,
        ];
        return c.claim_tx_hash
          ? h('a.row', { href: LINKS.tx(c.claim_tx_hash), target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${fmtBear(amount)} $BEAR claimed ${when.toLocaleDateString()}: view the transaction` }, inner)
          : h('div.row', inner);
      }));
      fill(more, claims.length > 6 ? h('button.btn.btn--text', { type: 'button', onclick: () => { showAll = !showAll; paintHistory(); } }, showAll ? 'Show fewer' : `Show all ${claims.length}`) : null);
    } else {
      if (!rows) {
        if (hs?.error) fill(list, h('div.pane-body', errorLine("Your snapshots couldn't load. They retry on their own.", { small: true })));
        fill(more);
        return;
      }
      if (!rows.length) {
        fill(list, empty('No snapshots yet', 'A day appears here once the snapshot finds a BEAR NFT or BEAR/XRP LP in your wallet.'));
        fill(more);
        return;
      }
      const t = utcDay();
      const y = yesterday();
      const label = (r) => {
        if (r.claim_status === 'claimed') return [h('span.chip.chip--green', 'Claimed'), r.claimed_at ? `Claimed ${new Date(r.claimed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Claimed'];
        if (r.claim_status === 'processing') return [h('span.chip', 'Sending'), 'On its way to your wallet'];
        if (r.snapshot_date === t) return [h('span.chip.chip--purple', 'Tomorrow'), 'Opens 00:00 UTC'];
        if (r.snapshot_date === y) return [h('span.chip.chip--gold', 'Today'), 'Claim before 00:00 UTC'];
        return [h('span.chip', 'Missed'), 'Expired unclaimed'];
      };
      const shown = showAll ? rows : rows.slice(0, 7);
      fill(list, shown.map((r) => {
        const [chip, note] = label(r);
        return h('div.row.drops-day',
          dateBlock(new Date(`${r.snapshot_date}T00:00:00Z`), true),
          h('div.row__main',
            h('div.row__title', `${num(r.pixel_bears, 0)} Pixel · ${num(r.ultra_rares, 0)} Ultra · ${compact(r.lp_tokens)} LP`),
            h('div.row__sub', note)),
          h('div.drops-day__end', h('div.row__value', fmtBear(payout(r, cfg)), h('small', '$BEAR')), chip));
      }));
      fill(more, rows.length > 7 ? h('button.btn.btn--text', { type: 'button', onclick: () => { showAll = !showAll; paintHistory(); } }, showAll ? 'Show fewer' : `Show all ${rows.length} days`) : null);
    }
    if (first || animate) leaf(list.children);
  }

  // ── the claim: a dialog that grows from the button ──
  function openClaim(e, s) {
    if (busy) return;
    const origin = e.currentTarget;
    const life = new AbortController();
    const fig = h('span.num');
    const trustFact = h('b', skLine('4em'));
    const trustNote = h('div');
    const err = h('div.claim-err');
    const cancel = h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Cancel');
    const confirm = h('button.btn.btn--gold', { type: 'button', autofocus: true, onclick: send }, 'Claim ', fmtBear(s.amount), ' $BEAR');
    let known = null; // true / false / null (couldn't check)

    const d = dialog({
      eyebrow: 'BEARDROPS',
      title: 'Claim your drop',
      origin,
      body: [
        h('div.claim-fig', fig, h('span.drops-fig__unit', '$BEAR')),
        h('div.drops-worth', worth(s.amount) || ' '),
        h('div.claim-facts',
          h('div.fact', h('span', 'To'), h('b.num', short(wallet, 6, 6), h('span.muted', ' · your wallet'))),
          h('div.fact', h('span', 'Snapshot'), h('b', dayFmt(s.date, { month: 'long', day: 'numeric' }))),
          h('div.fact', h('span', 'Network fee'), h('b', 'Paid by BEAR Park')),
          h('div.fact', h('span', '$BEAR trust line'), trustFact)),
        trustNote,
        err,
      ],
      foot: [cancel, confirm],
      onClose: () => life.abort(),
    });
    queueMicrotask(() => roll(fig, fmtBear(s.amount)));

    const recheck = h('button.btn', { type: 'button', onclick: async () => { recheck.disabled = true; await holdings(wallet).refresh(); recheck.disabled = false; } }, icon('refresh'), 'Check again');
    holdings(wallet).subscribe((hs) => {
      if (hs.value) {
        known = hs.value.hasTrustline;
        fill(trustFact, known ? h('span.up', 'Set') : h('span.down', 'Missing'));
        fill(trustNote, known ? null : h('div.claim-trust', statement({
          tone: 'warn',
          title: 'Add the $BEAR trust line first',
          body: "The ledger can't deliver $BEAR to a wallet without one. Add $BEAR on BEAR Swap, come back, then check again.",
          children: h('div.cluster', { style: { '--gap': '8px', marginTop: '12px' } }, external(LINKS.swap, 'Open BEAR Swap', 'btn btn--line'), recheck),
        })));
      } else if (hs.error) {
        known = null;
        fill(trustFact, h('span.muted', "Couldn't check"));
      }
      if (!busy) confirm.disabled = known === false;
    }, life.signal);

    async function send() {
      if (busy) return;
      setBusy(true);
      fill(paneErr);
      confirm.disabled = true;
      cancel.disabled = true;
      fill(confirm, 'Sending to your wallet');
      fill(err);
      try {
        const r = await post('/beardrops/claim', { wallet_address: wallet });
        setBusy(false);
        claimed(r, s);
        d.close(true);
      } catch (ex) {
        setBusy(false);
        // Sent, but the ledger hasn't confirmed it yet: not an error, and never a retry
        // (the server holds the claim until the transaction is reconciled).
        if (ex.body?.pending) {
          const note = [statement({ tone: 'info', title: 'On its way', body: cleanMessage(ex) }),
            ex.body.tx_hash ? h('div', { style: { marginTop: '10px' } }, external(LINKS.tx(ex.body.tx_hash), 'View the transaction', 'btn btn--sm btn--line')) : null];
          if (!life.signal.aborted) { fill(err, note); fill(confirm, 'Sent'); confirm.disabled = true; fill(cancel, 'Close'); cancel.disabled = false; }
          else fill(paneErr, note);
          status.refresh(); history.refresh();
          return;
        }
        if (!life.signal.aborted) {
          fill(err, errorLine(cleanMessage(ex)));
          fill(confirm, 'Try again');
          confirm.disabled = known === false;
          cancel.disabled = false;
        } else {
          fill(paneErr, errorLine(cleanMessage(ex)));
        }
        // The server knows better (already claimed, nothing pending): catch up.
        if ([404, 409, 429].includes(ex.status)) { status.refresh(); history.refresh(); }
        if (ex.body?.code === 'tecPATH_DRY') holdings(wallet).refresh();
      }
    }
  }

  function claimed(r, s) {
    const amount = Number(r.amount) || s.amount;
    const tx = r.tx_hash || null;
    const cur = status.get().value;
    if (cur) {
      status.set({
        ...cur, claimedToday: true, canClaim: false, totalPending: 0, amount, txHash: tx,
        recent: [{ snapshot_date: s.date, total_reward: amount, claimed_at: new Date().toISOString(), claim_tx_hash: tx, claim_status: 'claimed' }, ...cur.recent],
      });
    }
    const hv = history.get().value;
    if (hv) history.set({ ...hv, rows: hv.rows.map((row) => (row.snapshot_date === s.date ? { ...row, claim_status: 'claimed', claimed_at: new Date().toISOString(), claim_tx_hash: tx } : row)) });
    toast({ eyebrow: 'BEARDROP CLAIMED', title: `${fmtBear(amount)} $BEAR is yours`, body: tx ? `Settled on the XRP Ledger · ${short(tx, 6, 6)}` : 'Settled on the XRP Ledger', ms: 6000 });
    celebrate({ kind: 'bear', amount, origin: now });
    holdings(wallet).refresh();
    setTimeout(() => { if (!signal.aborted) { status.refresh(); history.refresh(); } }, 2500);
  }

  // ── wiring ──
  function paintAll() {
    const s = state();
    paintTile(s);
    paintNow(s);
    paintFacts();
    paintBase();
    paintHistory();
  }

  let retries = 0;
  let retryAt = 0;
  watch([status, history, flags, today, dropsConfig, nfts, lp, bearFeed], ([a, b, c, d, e, f, g]) => {
    st = { status: a, history: b, flags: c, today: d, config: e, nfts: f, lp: g };
    // A status from an earlier UTC day (warm cache) is stale: fetch today's once.
    if (a.value && a.value.day !== utcDay() && staleTried !== utcDay()) { staleTried = utcDay(); status.refresh(); }
    // claim-status shares a tight rate limit: if the first read failed, try a few more times, slowly.
    if (a.error && !a.value && !a.loading && !retryAt && retries < 3) {
      retries += 1;
      retryAt = setTimeout(() => { retryAt = 0; status.refresh(); }, 15_000 * retries);
      scope.add(() => clearTimeout(retryAt));
    }
    paintAll();
  }, signal);

  const pane = h('section.frost.frost--section.drops', { 'aria-labelledby': 'drops-title' },
    h('div.pane-head', h('div', { id: 'drops-title' }, paneHead), chipSlot),
    h('div.rule'),
    h('div.pane-body', now),
    h('div.rule'),
    facts,
    h('div.rule'),
    h('div.pane-head.drops-sub', h('div.eyebrow.eyebrow--sm', 'Your base'), h('div.section__aside', 'Live from your wallet')),
    base,
    baseTotal,
    h('div.rule'),
    h('div.pane-head.drops-sub', h('div.eyebrow.eyebrow--sm', 'History'), tabs),
    list,
    more,
    h('p.pane-body.drops-legal',
      'BEARdrops are discretionary community gifts — not a yield, staking or investment product. Amounts can change, pause or stop at any time, and nothing here is a right to receive them. Please don’t buy, hold or add liquidity expecting them.'));

  return { pane, tile };
}

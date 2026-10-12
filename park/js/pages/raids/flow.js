// Raids: the data and the join flow. The page (pages/raids.js) draws the cards;
// this module owns what a raid IS (its kind, author, link), the timers that
// survive a reload, the X account link, and the Metro dialog that walks a raid
// from "open the post" to "claim honey".
//
// Server facts (backend/server.js): POST /raids/session/start hands out a
// signed session (minimum_seconds 115, expires_in 1800); POST /raids/complete
// pays the raid's reward once the session is old enough. The X link is an
// OAuth pop-up that lands on /twitter-callback.html, which posts
// bearpark-twitter-connected | -connect-failed back to this window.

import { h, icon, fill } from '../../core/dom.js';
import { api, post, del, live } from '../../core/api.js';
import { points } from '../../core/data.js';
import { session, tokenClaims } from '../../core/session.js';
import { dialog, errorLine, statement, toast } from '../../core/ui.js';
import { roll, rise } from '../../core/motion.js';
import { num } from '../../core/format.js';
import { celebrate as cheer } from '../../core/fun.js';

// ---------------------------------------------------------------------------
// What a raid is

const ASKS = new Set(['like', 'retweet', 'reply']);

export const KINDS = {
  like: { label: 'Like', icon: 'heart', ask: 'Like the post', verb: 'like it' },
  retweet: { label: 'Retweet', icon: 'refresh', ask: 'Repost the post', verb: 'repost it' },
  reply: { label: 'Reply', icon: 'reply', ask: 'Reply to the post', verb: 'reply to it' },
  unverified: { label: 'Boost', icon: 'flag', ask: 'Boost the post', verb: 'boost it' },
};

/**
 * like | retweet | reply | unverified — what the raid asks for. Raids are an
 * honor system (owner's call, 2026-04-20, commit cb1b0cd): every live raid pays
 * its reward once the timer is done, whatever it asks, with no X check.
 */
export function kindOf(raid) {
  const v = String(raid?.verification_type || '').trim().toLowerCase();
  return ASKS.has(v) ? v : 'unverified';
}
export const pays = (raid) => Number(raid?.reward) > 0;

/** The post's link without tracking params (?s=20, ?t=… confuse X's app hand-off). */
export function postUrl(raid) {
  try {
    const u = new URL(String(raid?.twitter_url || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.protocol = 'https:';
    if (/(^|\.)(x|twitter)\.com$/i.test(u.hostname)) { u.search = ''; u.hash = ''; }
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Who wrote the post. The handle comes from the post's own URL (the raid's
 * profile_handle is the account running the raid, which is not always the
 * author); image_url is the author's X avatar when it's a profile image, and
 * the post's picture otherwise.
 */
export function authorOf(raid) {
  const m = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?:\/|$)/i.exec(raid?.twitter_url || '');
  const fromUrl = m && !/^(i|home|intent|share)$/i.test(m[1]) ? m[1] : null;
  const runner = String(raid?.profile_handle || '').trim().replace(/^@+/, '');
  const handle = fromUrl || runner || null;
  const same = handle && runner && handle.toLowerCase() === runner.toLowerCase();
  const name = (same || !fromUrl) ? (String(raid?.profile_name || '').trim() || handle) : handle;
  const img = /^https:\/\//.test(raid?.image_url || '') ? raid.image_url : null;
  const isAvatar = img && /\/profile_images\//.test(img);
  return { handle, name, avatar: isAvatar ? img : null, media: isAvatar ? null : img };
}

/** "2d 4h left" / "3h 05m left" / "12m 09s left" / "Ended" */
export function timeLeft(ms) {
  if (!(ms > 0)) return 'Ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hr = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (v) => String(v).padStart(2, '0');
  if (d) return `${d}d ${hr}h left`;
  if (hr) return `${hr}h ${pad(m)}m left`;
  return `${m}m ${pad(s % 60)}s left`;
}

/** 115000 → "1:55" */
export const mss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Feeds this page adds to core/data.js

/** [{ raid_id, completed_at, points_awarded }], newest first. */
export const doneFeed = (w) => live(`park:raids:done:${w}`, async () => (await api(`/raids/completed/${w}`)).completedRaids || [], { every: 5 * 60_000 });

/** Top raiders, one row per person (the table holds some wallets in two cases). */
export const boardFeed = live('park:raids:board', async () => mergeBoard((await api('/raids/leaderboard')).leaderboard || []), { every: 5 * 60_000 });

function mergeBoard(rows) {
  const by = new Map();
  for (const r of rows) {
    const key = String(r?.wallet_address || '').toLowerCase();
    if (!key) continue;
    const pts = Number(r.total_points) || 0;
    const n = Number(r.total_raids) || 0;
    const cur = by.get(key);
    if (!cur) { by.set(key, { ...r, total_points: pts, total_raids: n }); continue; }
    cur.total_points += pts;
    cur.total_raids += n;
    if (r.wallet_address !== key) cur.wallet_address = r.wallet_address; // the real (mixed-case) address
    cur.display_name ||= r.display_name;
    cur.avatar_nft ||= r.avatar_nft;
  }
  return [...by.values()].sort((a, b) => b.total_points - a.total_points || b.total_raids - a.total_raids);
}

/** Consecutive days with a raid, ending today or yesterday (local time). */
export function streakOf(list) {
  const days = new Set(list.map((c) => new Date(c.completed_at).toDateString()));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------------------------------------------------------------------------
// Timers: a started raid survives a reload. Same storage key and shape the old
// site used ({ [raidId]: { startTime, duration, reward, sessionToken } }), plus
// expiresAt, so a raid started before the rebuild resumes here.

const SESSION_MS = 30 * 60_000;
const timerKey = (w) => `active_raid_timers_${w}`;

function readAll(w) {
  try { return JSON.parse(localStorage.getItem(timerKey(w)) || '{}') || {}; } catch { return {}; }
}
function writeAll(w, all) {
  try {
    if (Object.keys(all).length) localStorage.setItem(timerKey(w), JSON.stringify(all));
    else localStorage.removeItem(timerKey(w));
  } catch { /* private mode: the timer still runs for this visit */ }
}

function sessionEnds(t) {
  return Number(t.expiresAt) || Number(tokenClaims(t.sessionToken)?.exp) || (Number(t.startTime) + SESSION_MS);
}
/** A session is worth resuming while it has a minute left to claim in. */
const usable = (t) => !!(t?.sessionToken && t.startTime && sessionEnds(t) - Date.now() > 60_000);

export const timers = {
  get(w, id) {
    const t = readAll(w)[id];
    return usable(t) ? t : null;
  },
  set(w, id, t) { const all = readAll(w); all[id] = t; writeAll(w, all); },
  drop(w, id) { const all = readAll(w); if (id in all) { delete all[id]; writeAll(w, all); } },
  /** Forget sessions that ran out and raids already paid. */
  prune(w, doneIds = new Set()) {
    const all = readAll(w);
    let changed = false;
    for (const id of Object.keys(all)) {
      if (!usable(all[id]) || doneIds.has(String(id))) { delete all[id]; changed = true; }
    }
    if (changed) writeAll(w, all);
  },
};

/** ms until the claim unlocks (0 = ready). */
export const untilClaim = (t, now = Date.now()) => Math.max(0, Number(t.startTime) + (Number(t.duration) || 120) * 1000 - now);

// ---------------------------------------------------------------------------
// The X account link. Must be called straight from a click: the pop-up opens
// before anything is awaited so no browser blocks it.

let linking = null;

export function linkX(wallet) {
  if (linking) { try { linking.popup.focus(); } catch { /* ignore */ } return linking.promise; }
  const popup = window.open('about:blank', 'bearpark-twitter-link', 'popup,width=540,height=760');
  if (!popup) return Promise.reject(new Error('Pop-ups are blocked. Allow pop-ups for bearpark.xyz and try again.'));
  try { popup.document.title = 'Link X · BEAR Park'; popup.document.body.style.background = '#000'; } catch { /* ignore */ }

  const life = new AbortController();
  const promise = new Promise((resolve, reject) => {
    const settle = (fn, value) => {
      if (life.signal.aborted) return;
      life.abort();
      linking = null;
      fn(value);
    };
    const won = (username) => {
      session.setIdentity({ twitter: username || null });
      const v = points(wallet).get().value;
      if (v) points(wallet).set({ ...v, twitter_connected: true, twitter_username: username || v.twitter_username });
      points(wallet).refresh();
      settle(resolve, username);
    };
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.source !== popup) return;
      const m = e.data || {};
      if (m.type === 'bearpark-twitter-connected') won(m.twitter_username || '');
      else if (m.type === 'bearpark-twitter-connect-failed') settle(reject, new Error(m.error || 'X linking failed. Try again.'));
    }, { signal: life.signal });
    // The callback page also writes twitter_username: catches a pop-up whose
    // opener link was severed by X's isolation headers.
    addEventListener('storage', (e) => { if (e.key === 'twitter_username' && e.newValue) won(e.newValue); }, { signal: life.signal });
    // Back on this window with the pop-up gone and no word: ask the server.
    addEventListener('focus', () => {
      setTimeout(async () => {
        if (life.signal.aborted || !popup.closed) return;
        const v = await points(wallet).refresh().catch(() => null);
        if (v?.twitter_connected) won(v.twitter_username || '');
        else settle(reject, Object.assign(new Error('X linking closed before it finished.'), { quiet: true }));
      }, 700);
    }, { signal: life.signal });
    setTimeout(() => settle(reject, Object.assign(new Error('X linking timed out. Try again.'), { quiet: true })), 10 * 60_000);

    post('/auth/twitter/start', { wallet_address: wallet }).then((r) => {
      if (!r?.auth_url) throw new Error('X linking could not start. Try again.');
      if (popup.closed) throw Object.assign(new Error('X linking closed before it finished.'), { quiet: true });
      popup.location.href = r.auth_url;
    }).catch((err) => {
      try { popup.close(); } catch { /* ignore */ }
      settle(reject, err);
    });
  });
  linking = { popup, promise };
  return promise;
}

export async function unlinkX(wallet) {
  await del('/auth/twitter', { wallet_address: wallet });
  session.setIdentity({ twitter: null });
  try { localStorage.removeItem('twitter_connected'); } catch { /* ignore */ }
  const v = points(wallet).get().value;
  if (v) points(wallet).set({ ...v, twitter_connected: false, twitter_username: null });
  points(wallet).refresh();
}

// ---------------------------------------------------------------------------
// The join dialog: link X (only if the server asks) → open the post, the timer
// runs → claim honey. It grows out of the card's button.

/**
 * openJoin({ raid, wallet, origin, onChange, onPaid, onEnded, onClose })
 *   onChange()        a timer started or moved (the card relabels)
 *   onPaid(result)    the server paid (or had already paid) this raid
 *   onEnded()         the server says the raid is over
 */
export function openJoin({ raid, wallet, origin, onChange, onPaid, onEnded, onClose }) {
  const kind = kindOf(raid);
  const K = KINDS[kind];
  const url = postUrl(raid);
  const who = authorOf(raid);
  const reward = Number(raid.reward) || 0;
  const life = new AbortController();

  let needLink = false;     // set when the server says this raid needs a linked X account
  let starting = false;
  let claiming = false;
  let paid = false;

  // ── parts ──
  const errSlot = h('div.rj-err');
  const showErr = (msg) => fill(errSlot, msg ? errorLine(msg, { small: true }) : null);

  const linkBtn = h('button.btn', { type: 'button', onclick: () => doLink() }, icon('x'), 'Connect X');
  const openBtn = h('a.btn', { href: url || '#', target: '_blank', rel: 'noopener noreferrer', onclick: (e) => doOpen(e) }, icon('x'), h('span', 'Open the post on X'), icon('external'));
  const claimBtn = h('button.btn.btn--gold', { type: 'button', disabled: true, onclick: () => doClaim() }, 'Claim honey');
  const clockFig = h('b.num', { role: 'timer' }, '');
  const clockNote = h('span.caption', 'until honey unlocks');
  const meter = h('i');
  const clockBox = h('div.rj-clock', { hidden: true },
    h('div.rj-clock__row', clockFig, clockNote),
    h('div.meter', meter));

  const step = (title, sub, act) => {
    const n = h('span.rj-step__n');
    const subEl = h('div.rj-step__sub', sub);
    const el = h('li.rj-step', n, h('div.rj-step__title', title), subEl, h('div.rj-step__act', act));
    return { el, n, sub: subEl };
  };
  const sLink = step('Link your X account', 'This raid checks your X account. Link it once and it stays linked to this wallet.', linkBtn);
  const sOpen = step('Open the post on X', `${K.ask}, then come back here. The timer starts when the post opens.`, [openBtn, clockBox]);
  const sClaim = step('Claim honey', 'Unlocks when the timer runs out.', claimBtn);
  const steps = h('ol.rj-steps', sLink.el, sOpen.el, sClaim.el);

  const pfp = h('span.raid__pfp');
  paintAvatar(pfp, who.avatar);
  const flow = h('div.rj-flow',
    h('div.rj-sum', pfp,
      h('div.rj-sum__who', h('div.raid__name', who.name || 'Post on X'), who.handle ? h('div.raid__handle', `@${who.handle}`) : null),
      h('div.rj-sum__pay', h('span.rj-sum__fig.num', `+${num(reward, 0)}`), h('span.raid__unit', 'Honey'))),
    raid.description ? h('p.rj-ask', raid.description) : null,
    steps);

  const d = dialog({
    eyebrow: `RAID · ${K.label.toUpperCase()}`,
    title: 'Join raid',
    origin,
    sheet: true,
    body: [flow],
    onClose: () => { life.abort(); onClose?.(); },
  });

  // ── state ──
  function phase() {
    if (paid) return 'paid';
    if (needLink) return 'link';
    const t = timers.get(wallet, raid.id);
    if (!t) return 'open';
    return untilClaim(t) > 0 ? 'timing' : 'ready';
  }

  function paintStep(s, state, n) {
    s.el.dataset.state = state;
    fill(s.n, state === 'done' ? icon('check') : String(n));
  }

  function render() {
    const p = phase();
    if (p === 'paid') return;
    sLink.el.hidden = !needLink;
    const base = needLink ? 1 : 0;
    paintStep(sLink, p === 'link' ? 'active' : 'done', 1);
    paintStep(sOpen, p === 'link' ? 'todo' : (p === 'open' ? 'active' : 'done'), base + 1);
    paintStep(sClaim, p === 'ready' ? 'active' : 'todo', base + 2);

    linkBtn.className = `btn${p === 'link' ? ' btn--gold' : ''}`;
    openBtn.className = `btn${p === 'open' ? ' btn--gold' : ' btn--line'}`;
    if (p === 'link' || !url) openBtn.setAttribute('aria-disabled', 'true');
    else openBtn.removeAttribute('aria-disabled');
    openBtn.querySelector('span').textContent = p === 'open' ? 'Open the post on X' : 'Open the post again';
    claimBtn.disabled = p !== 'ready' || claiming;
    claimBtn.textContent = claiming ? 'Claiming' : 'Claim honey';
    sClaim.sub.textContent = p === 'ready' ? `The timer is done. ${num(reward, 0)} honey is yours to claim.` : 'Unlocks when the timer runs out.';
    // An error reads under the step it belongs to.
    const at = (p === 'link' ? sLink : p === 'ready' ? sClaim : sOpen).el.querySelector('.rj-step__act');
    if (errSlot.parentNode !== at) at.append(errSlot);
    tick();
  }

  function tick() {
    const t = timers.get(wallet, raid.id);
    const running = !!t && !paid && !needLink;
    clockBox.hidden = !running && !starting;
    if (starting && !t) { fill(clockFig, h('span.sk.sk--figure', { style: { '--w': '2.2em' } })); return; }
    if (!running) return;
    const left = untilClaim(t);
    clockFig.textContent = mss(left);
    clockNote.textContent = left > 0 ? 'until honey unlocks' : 'honey unlocked';
    const total = (Number(t.duration) || 120) * 1000;
    meter.style.setProperty('--v', String(Math.min(1, Math.max(0, 1 - left / total))));
    if (left <= 0 && claimBtn.disabled && !claiming) {
      showErr(null); // a "wait N more seconds" from before is over now
      render();
    }
  }
  const timer = setInterval(() => { if (!document.hidden) tick(); }, 500);
  life.signal.addEventListener('abort', () => clearInterval(timer));
  addEventListener('visibilitychange', () => { if (!document.hidden) tick(); }, { signal: life.signal });

  // ── actions ──
  function doLink() {
    showErr(null);
    linkBtn.disabled = true;
    linkX(wallet).then(() => {
      needLink = false;
      render();
    }).catch((err) => {
      if (!err?.quiet) showErr(err.message);
    }).finally(() => { linkBtn.disabled = false; });
  }

  function doOpen(e) {
    if (!url || needLink) { e.preventDefault(); return; }
    // The link opens the post in a new tab on its own (never pop-up blocked).
    if (starting || timers.get(wallet, raid.id)) return;
    showErr(null);
    starting = true;
    render();
    post('/raids/session/start', { wallet_address: wallet, raid_id: raid.id }).then((r) => {
      if (!r?.session_token) throw new Error('The raid timer could not start. Try again.');
      const now = Date.now();
      timers.set(wallet, raid.id, {
        startTime: now,
        duration: Number(r.minimum_seconds) || 120,
        reward,
        sessionToken: r.session_token,
        expiresAt: now + (Number(r.expires_in) || SESSION_MS / 1000) * 1000,
      });
      onChange?.();
    }).catch((err) => {
      if (/link (your )?x account/i.test(err.message)) needLink = true;
      if (/raid has expired|invalid raid/i.test(err.message)) onEnded?.();
      showErr(err.message);
    }).finally(() => {
      starting = false;
      if (!life.signal.aborted) render();
    });
  }

  async function doClaim() {
    const t = timers.get(wallet, raid.id);
    if (!t) {
      showErr('That raid session ran out. Open the post again to restart the timer.');
      render();
      return;
    }
    showErr(null);
    claiming = true;
    render();
    try {
      const r = await post('/raids/complete', { wallet_address: wallet, raid_id: raid.id, session_token: t.sessionToken });
      timers.drop(wallet, raid.id);
      paid = true;
      onPaid?.(r);
      if (!life.signal.aborted) celebrate(r);
    } catch (err) {
      const wait = /wait (\d+) more second/i.exec(err.message);
      if (wait) {
        // The server's clock is the one that counts: line ours up with it.
        timers.set(wallet, raid.id, { ...t, startTime: Date.now() + Number(wait[1]) * 1000 - (Number(t.duration) || 120) * 1000 });
        onChange?.();
      } else if (/expired raid session|start the raid again|does not match/i.test(err.message)) {
        timers.drop(wallet, raid.id);
        onChange?.();
      } else if (/raid has expired|invalid raid/i.test(err.message)) {
        timers.drop(wallet, raid.id);
        onEnded?.();
      }
      showErr(err.message);
    } finally {
      claiming = false;
      if (!life.signal.aborted) render();
    }
  }

  function celebrate(r) {
    clearInterval(timer);
    const again = !!r?.alreadyCompleted;
    const got = Number(r?.points_awarded) || reward;
    d.setTitle(again ? 'Already claimed' : 'Raid complete');
    const fig = h('div.rj-win__fig.num');
    const body = again
      ? h('div.rj-win', statement({ tone: 'ok', title: 'Nothing new to claim', body: 'This raid was already paid to your wallet, so no honey was added this time.' }))
      : h('div.rj-win',
        h('div.caption', 'Honey earned'),
        fig,
        r?.total_points != null ? h('div.rj-win__sub', 'Your honey is now ', h('b.num', num(r.total_points, 0))) : null,
        h('p.rj-win__note', 'It counts toward today’s BEARdrops too.'));
    fill(d.body, body);
    d.setFoot([h('button.btn', { type: 'button', autofocus: true, onclick: () => d.close() }, 'Back to raids')]);
    if (!again) {
      roll(fig, `+${num(got, 0)}`);
      rise(body, { px: 10 });
      toast({ eyebrow: 'RAID COMPLETE', title: `+${num(got, 0)} honey`, body: 'Thanks for boosting $BEAR on X.' });
      cheer({ kind: 'raid', origin: fig }); // the figure already shows the amount
    }
  }

  render();
  // Focus lands on the step's armed control, not the close button.
  ({ link: linkBtn, open: openBtn, ready: claimBtn })[phase()]?.setAttribute('autofocus', '');
  return d;
}

/** The author's X avatar, or the X mark when there's none (or it fails). */
export function paintAvatar(box, src) {
  const mark = () => fill(box, icon('x'));
  if (!src) { mark(); return box; }
  fill(box, h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer', onerror: mark }));
  return box;
}

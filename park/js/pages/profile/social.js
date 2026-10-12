// The social layer of a profile: Follow, the followers / following lists,
// the X link, and Find a BEAR (the park's directory).

import { h, icon, fill } from '../../core/dom.js';
import { dialog, confirmDialog, words, displayName, profileHref, skRows, empty, errorLine, toast } from '../../core/ui.js';
import { bearAvatar as avatar } from './ipfs.js';
import { leaf } from '../../core/motion.js';
import { api, post, del, live } from '../../core/api.js';
import { followCounts, equippedFor, points } from '../../core/data.js';
import { session } from '../../core/session.js';
import { short, ago, num } from '../../core/format.js';

const sameWallet = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// The Friends tab's "who you follow" feed (community/friends.js, same key and
// loader). A follow made here patches it, so the grid doesn't show the old
// state for the five minutes it caches.
const followingFeed = (w) => live(`park:following:${w}`, async () => ((await api(`/follow/following/${w}`)).following || []).map((f) => f.following_wallet), { every: 5 * 60_000 });
function patchFollowing(me, target, on) {
  const feed = followingFeed(me);
  const list = feed.get().value;
  if (!Array.isArray(list)) return; // never loaded: nothing stale to fix
  const rest = list.filter((w) => !sameWallet(w, target));
  feed.set(on ? [target, ...rest] : rest);
}
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
export const xHref = (handle) => (HANDLE.test(handle || '') ? `https://x.com/${handle}` : null);

// ---------------------------------------------------------------------------
// Follow

/**
 * followButton({ me, target, signal, errSlot }) — the armed action on someone
 * else's profile: gold Follow, quiet Following. Optimistic; reverts on failure.
 */
export function followButton({ me, target, signal, errSlot }) {
  let following = null;
  let busy = false;
  const btn = h('button.btn.prof-follow', { type: 'button', disabled: true });

  function paint() {
    const on = following === true;
    btn.classList.toggle('btn--gold', !on);
    btn.setAttribute('aria-pressed', String(on));
    fill(btn, icon(on ? 'user-check' : 'user-plus'), on ? 'Following' : 'Follow');
    btn.disabled = following === null || busy;
  }
  paint();

  api(`/follow/status?follower_wallet=${encodeURIComponent(me)}&following_wallet=${encodeURIComponent(target)}`, { signal })
    .then((r) => { following = !!r.isFollowing; paint(); })
    .catch(() => { if (!signal.aborted) { following = false; paint(); } });

  const bump = (feed, key, by) => {
    const v = feed.get().value;
    if (v && Number.isFinite(Number(v[key]))) feed.set({ ...v, [key]: Math.max(0, Number(v[key]) + by) });
  };

  btn.addEventListener('click', async () => {
    if (busy || following === null) return;
    const was = following;
    busy = true;
    following = !was;
    fill(errSlot);
    paint();
    bump(followCounts(target), 'followers', following ? 1 : -1);
    bump(followCounts(me), 'following', following ? 1 : -1);
    try {
      const r = await post('/follow', { follower_wallet: me, following_wallet: target });
      const now = r.action === 'followed';
      if (now !== following) {
        // The server was already in the other state; follow its answer.
        bump(followCounts(target), 'followers', now ? 1 : -1);
        bump(followCounts(me), 'following', now ? 1 : -1);
        following = now;
      }
      patchFollowing(me, target, now);
      followCounts(target).refresh();
      followCounts(me).refresh();
    } catch (e) {
      following = was;
      bump(followCounts(target), 'followers', was ? 1 : -1);
      bump(followCounts(me), 'following', was ? 1 : -1);
      fill(errSlot, errorLine(e.message, { small: true }));
    } finally {
      busy = false;
      paint();
    }
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Followers / following

const LISTS = {
  followers: { label: 'Followers', path: 'followers', key: 'follower_wallet', none: ['No followers yet', 'When BEARs follow this wallet they show here.'] },
  following: { label: 'Following', path: 'following', key: 'following_wallet', none: ['Not following anyone', 'BEARs this wallet follows show here.'] },
};

/** openFollowList({ wallet, name, tab, origin, signal }) */
export function openFollowList({ wallet, name, tab = 'followers', origin, signal }) {
  const life = new AbortController();
  const list = h('div.rows', skRows(5));
  const cache = {};
  const d = dialog({
    eyebrow: name, title: LISTS[tab].label, origin, onClose: () => life.abort(),
    body: [
      words([{ id: 'followers', label: 'Followers' }, { id: 'following', label: 'Following' }], { selected: tab, onChange: (id) => show(id) }),
      h('div.prof-list', list),
    ],
  });

  signal?.addEventListener('abort', () => d.close(), { once: true });

  async function show(id) {
    tab = id;
    d.setTitle(LISTS[id].label);
    fill(list, skRows(5));
    try {
      cache[id] ||= api(`/follow/${LISTS[id].path}/${wallet}`, { signal: life.signal }).then((r) => r[id] || []);
      const people = await cache[id];
      if (tab !== id || life.signal.aborted) return;
      if (!people.length) { fill(list, empty(...LISTS[id].none)); return; }
      const shown = people.slice(0, 200);
      const rings = await equippedFor(shown.map((p) => p[LISTS[id].key]));
      if (tab !== id || life.signal.aborted) return;
      fill(list, shown.map((p) => {
        const w = p[LISTS[id].key];
        return h('a.row', { href: profileHref(w), onclick: () => d.close() },
          avatar(p.avatar_nft, { size: 40, ring: rings[w]?.ring }),
          h('div.row__main', h('div.row__title', displayName({ ...p, wallet_address: w })), h('div.row__sub', short(w, 6, 6))),
          p.created_at ? h('div.row__sub', ago(p.created_at)) : null,
          icon('chevron-right', 'row__chev'));
      }));
      leaf([...list.children].slice(0, 12));
    } catch (e) {
      if (life.signal.aborted) return;
      delete cache[id];
      fill(list, h('div.prof-pad', errorLine(e.message || 'Could not load this list.'),
        h('button.btn.btn--line.btn--sm', { type: 'button', style: { marginTop: '14px' }, onclick: () => show(id) }, icon('refresh'), 'Try again')));
    }
  }
  show(tab);
  return d;
}

// ---------------------------------------------------------------------------
// X (Twitter) link, own profile only

/**
 * xControl({ me, signal }) — "Connect X" while unlinked; "Disconnect X" once
 * linked. The link runs in a popup (twitter-callback.html posts back to us);
 * a blocked popup falls back to linking in this tab.
 */
export function xControl({ me, signal, errSlot }) {
  const slot = h('span.prof-x-ctl');
  let waiting = null;

  function paint() {
    if (waiting) return;
    const v = points(me).get().value;
    if (!v) { fill(slot); return; }
    if (v.twitter_connected) {
      fill(slot, h('button.btn.btn--line', { type: 'button', onclick: (e) => disconnect(e.currentTarget) }, icon('x'), 'Disconnect X'));
    } else {
      fill(slot, h('button.btn', { type: 'button', onclick: () => connect() }, icon('x'), 'Connect X'));
    }
  }
  points(me).subscribe(paint, signal);
  signal.addEventListener('abort', () => clearTimeout(waiting?.timer), { once: true });

  function done(username) {
    stopWaiting();
    points(me).refresh();
    if (username) {
      session.setIdentity({ twitter: username });
      toast({ eyebrow: 'X CONNECTED', title: `@${username}`, body: 'Raids can now check your posts and pay honey.' });
    }
  }
  function stopWaiting() {
    if (!waiting) return;
    waiting.off.abort();
    clearTimeout(waiting.timer);
    waiting = null;
    paint();
  }

  async function connect() {
    if (waiting) return;
    fill(errSlot);
    // Open the window inside the tap, or pop-up blockers eat it.
    let popup = null;
    try { popup = window.open('', 'bearpark-twitter-link', 'width=540,height=760'); } catch { popup = null; }
    const off = new AbortController();
    signal.addEventListener('abort', () => off.abort(), { once: true });
    waiting = { off, timer: 0 };
    fill(slot, h('span.prof-wait', h('span.prof-wait__row', h('span.dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i'))),
      h('span.prof-wait__text', 'Finish in the X window'),
      h('button.btn.btn--text', { type: 'button', onclick: () => { try { popup?.close(); } catch { /* cross-origin */ } stopWaiting(); } }, 'Cancel')));
    let url;
    try {
      const r = await post('/auth/twitter/start', { wallet_address: me });
      url = r.auth_url;
      if (!url) throw new Error('X linking could not start. Try again.');
    } catch (e) {
      try { popup?.close(); } catch { /* ignore */ }
      stopWaiting();
      fill(errSlot, errorLine(e.message, { small: true }));
      return;
    }
    if (!popup || popup.closed) { location.assign(url); return; }
    try { popup.location.href = url; } catch { location.assign(url); return; }

    addEventListener('message', (ev) => {
      if (ev.origin !== location.origin) return;
      const m = ev.data || {};
      if (m.type === 'bearpark-twitter-connected') done(m.twitter_username);
      else if (m.type === 'bearpark-twitter-connect-failed') { stopWaiting(); fill(errSlot, errorLine(m.error || 'X did not link. Try again.', { small: true })); }
    }, { signal: off.signal });
    // The callback also writes twitter_username; that reaches us even if X cut the opener link.
    addEventListener('storage', (ev) => { if (ev.key === 'twitter_username' && ev.newValue) done(ev.newValue); }, { signal: off.signal });
    // Back from the popup: ask the server whether the link landed.
    addEventListener('focus', async () => {
      const v = await points(me).refresh();
      if (v?.twitter_connected) done(v.twitter_username);
    }, { signal: off.signal });
    waiting.timer = setTimeout(stopWaiting, 5 * 60_000);
  }

  async function disconnect(origin) {
    const ok = await confirmDialog({
      title: 'Disconnect X?',
      body: 'Raids check your X posts to pay honey. You can link it again any time.',
      confirm: 'Disconnect', danger: true, origin,
    });
    if (!ok) return;
    const btn = slot.querySelector('button');
    if (btn) btn.disabled = true;
    fill(errSlot);
    try {
      await del('/auth/twitter', { wallet_address: me });
      const v = points(me).get().value;
      if (v) points(me).set({ ...v, twitter_connected: false, twitter_username: null });
      session.setIdentity({ twitter: null });
      points(me).refresh();
      toast({ eyebrow: 'X', title: 'Disconnected' });
    } catch (e) {
      if (btn) btn.disabled = false;
      fill(errSlot, errorLine(e.message, { small: true }));
    }
  }

  return slot;
}

// ---------------------------------------------------------------------------
// Find a BEAR: the park's directory (every profile), searched in place.

let directory = null; // { at, promise }
const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export function openFinder({ origin, me, signal }) {
  const life = new AbortController();
  const input = h('input', { type: 'search', placeholder: 'Name or wallet address', autocomplete: 'off', 'aria-label': 'Search BEARs', autofocus: true, enterKeyHint: 'search' });
  const list = h('div.rows', skRows(6));
  const note = h('div.prof-finder__note.caption');
  const d = dialog({
    eyebrow: 'BEAR PARK', title: 'Find a BEAR', origin, onClose: () => life.abort(),
    body: [h('label.field', icon('search'), input), note, h('div.prof-list.prof-finder__list', list)],
  });
  signal?.addEventListener('abort', () => d.close(), { once: true });
  if (!directory || Date.now() - directory.at > 5 * 60_000) {
    directory = { at: Date.now(), promise: api('/users').then((r) => r.users || []) };
    directory.promise.catch(() => { directory = null; });
  }
  let people = null;
  const render = () => {
    if (!people) return;
    const q = input.value.trim().toLowerCase();
    const hits = (q ? people.filter((p) => (p.display_name || '').toLowerCase().includes(q) || (p.wallet_address || '').toLowerCase().includes(q)) : people)
      .slice(0, 120);
    const raw = input.value.trim();
    const direct = ADDRESS.test(raw) && !hits.some((p) => p.wallet_address === raw)
      ? h('a.row', { href: profileHref(raw), onclick: () => d.close() }, avatar(null, { size: 40 }),
        h('div.row__main', h('div.row__title', 'Open this wallet'), h('div.row__sub', short(raw, 8, 8))), icon('chevron-right', 'row__chev'))
      : null;
    note.textContent = q ? `${num(hits.length, 0)} found` : `${num(people.length, 0)} BEARs with a profile`;
    if (!hits.length && !direct) { fill(list, empty('No BEAR by that name', 'Try part of the name, or paste a wallet address.')); return; }
    fill(list, direct, hits.map((p) => h(`a.row${sameWallet(p.wallet_address, me) ? '.row--you' : ''}`, { href: profileHref(p.wallet_address), onclick: () => d.close() },
      avatar(p.avatar_nft, { size: 40 }),
      h('div.row__main', h('div.row__title', displayName(p)), h('div.row__sub', short(p.wallet_address, 6, 6))),
      icon('chevron-right', 'row__chev'))));
  };
  input.addEventListener('input', render);
  directory.promise.then((all) => {
    if (life.signal.aborted) return;
    people = all.filter((p) => p.wallet_address).sort((a, b) => displayName(a).localeCompare(displayName(b)));
    render();
    leaf([...list.children].slice(0, 10));
  }).catch((e) => {
    if (!life.signal.aborted) fill(list, h('div.prof-pad', errorLine(e.message || 'The directory did not load. Try again.')));
  });
}

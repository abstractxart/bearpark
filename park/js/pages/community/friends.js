// BEAR friends: everyone in the park as a grid of people, searchable as you
// type, with Follow / Following from ONE read of who you follow — never a
// request per person (the old page fired two per user).

import { h, icon, fill } from '../../core/dom.js';
import { api, post, live } from '../../core/api.js';
import { errorLine, words, skLine, skFigure, displayName, profileHref, rollingFigure, bind } from '../../core/ui.js';
import { leaf } from '../../core/motion.js';
import { followCounts } from '../../core/data.js';
import { num, short } from '../../core/format.js';
import { ART } from '../../core/art.js';
import { floatHeads } from '../../core/fun.js';
import { avaSlot, ringUp } from './common.js';

const people = live('park:community:users', async () => (await api('/users')).users || [], { every: 10 * 60_000 });
const followingOf = (w) => live(`park:following:${w}`, async () => ((await api(`/follow/following/${w}`)).following || []).map((f) => f.following_wallet), { every: 5 * 60_000 });

const fold = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const collator = new Intl.Collator('en', { sensitivity: 'base', ignorePunctuation: true, numeric: true });
const sortKey = (u) => fold(u.display_name).replace(/^[^\p{L}\p{N}]+/u, '');

export function friendsTab({ wallet, signal }) {
  const following = followingOf(wallet);
  let followSet = null;      // Set of wallets you follow, once known
  let tiles = new Map();     // wallet → { el, slot, hay, name }
  let list = [];
  let query = '';
  let mode = 'all';
  let painted = false;
  const busy = new Set();

  // ── the numbers strip ──
  const everyone = h('div.tile__value.num', skFigure('1.6em'));
  const followers = h('div.tile__value.num');
  const followingFig = h('div.tile__value.num');
  bind(followers, followCounts(wallet), (v) => rollingFigure(num(v.followers, 0)), { signal });
  bind(followingFig, followCounts(wallet), (v) => rollingFigure(num(v.following, 0)), { signal });
  const parkTile = h('div.tile.tile--purple.cm-strip__park',
    h('img.tile__mascot', { src: ART.coin, alt: '', loading: 'lazy' }),
    h('div.tile__label', 'BEARs in the park'),
    h('div.stack', { style: { '--gap': '4px' } }, everyone, h('div.tile__sub', 'with a BEAR Park profile')));
  floatHeads(parkTile, { signal }); // a few BEAR heads drifting behind it — tap one for the next face
  const strip = h('div.cm-strip', { 'data-e': '' },
    parkTile,
    h('a.tile', { href: profileHref(wallet) }, h('div.tile__label', 'You follow'), h('div.stack', { style: { '--gap': '4px' } }, followingFig, h('div.tile__sub', 'BEARs'))),
    h('a.tile', { href: profileHref(wallet) }, h('div.tile__label', 'Your followers'), h('div.stack', { style: { '--gap': '4px' } }, followers, h('div.tile__sub', 'BEARs follow you'))));

  // ── search + filter ──
  const search = h('input', { type: 'search', placeholder: 'Search by name or address', 'aria-label': 'Search BEARs', autocomplete: 'off', enterKeyHint: 'search' });
  search.spellcheck = false;
  const tally = h('span.cm-friends__tally.num', { 'aria-live': 'polite' });
  const filter = words([{ id: 'all', label: 'Everyone' }, { id: 'following', label: 'Following' }], {
    selected: 'all',
    onChange: (id) => { mode = id; apply(); },
  });
  const errSlot = h('div.cm-friends__err');
  const grid = h('div.cm-people', { 'aria-busy': 'true' }, Array.from({ length: 10 }, (_, i) => skPerson(i)));
  const none = h('div.cm-friends__none', { hidden: true });

  search.addEventListener('input', () => { query = fold(search.value.trim()); apply(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; query = ''; apply(); } });

  const section = h('section.frost.frost--section.cm-friends', { 'data-e': '', 'aria-label': 'BEAR friends' },
    h('div.cm-friends__bar',
      h('label.field.cm-friends__search', icon('search'), search),
      h('div.cm-friends__tools', filter, tally)),
    h('div.rule'),
    h('div.cm-friends__body', errSlot, grid, none));

  function skPerson(i) {
    return h('div.cm-person.cm-person--sk', { 'aria-hidden': 'true' },
      h('span.sk.sk--circle', { style: { '--s': '64px', '--d': `${i * 70}ms` } }),
      skLine('70%'), skLine('46%'), h('span.sk', { style: { width: '96px', height: '36px', borderRadius: '12px', marginTop: '6px' } }));
  }

  function tile(u) {
    const w = u.wallet_address;
    const name = displayName(u);
    const slot = h('div.cm-person__act');
    const el = h('div.cm-person', { dataset: { w } },
      h('a.cm-person__link', { href: profileHref(w), 'aria-label': `${name} — open profile` }),
      avaSlot(u.avatar_nft, w, 64),
      h('div.cm-person__name', { title: name }, name),
      h('div.cm-person__addr.num', short(w)),
      slot);
    return { el, slot, name, hay: `${fold(u.display_name)} ${fold(w)}` };
  }

  function paintFollow(w) {
    const t = tiles.get(w);
    if (!t) return;
    if (w === wallet) { fill(t.slot, h('span.chip.chip--gold', 'You')); return; }
    if (!followSet) { fill(t.slot, h('span.sk.cm-person__sk', { 'aria-hidden': 'true' })); return; }
    const on = followSet.has(w);
    const btn = h(`button.btn.btn--sm.cm-follow${on ? '.btn--line.is-on' : ''}`, {
      type: 'button',
      'aria-pressed': String(on),
      'aria-label': on ? `Following ${t.name}. Tap to unfollow` : `Follow ${t.name}`,
      'aria-busy': busy.has(w) ? 'true' : null,
      onclick: () => toggle(w),
    }, icon(on ? 'user-check' : 'user-plus'), on ? 'Following' : 'Follow');
    const hadFocus = t.slot.contains(document.activeElement);
    fill(t.slot, btn);
    if (hadFocus) btn.focus({ preventScroll: true });
  }

  async function toggle(w) {
    if (busy.has(w) || !followSet) return;
    busy.add(w);
    const was = followSet.has(w);
    const name = tiles.get(w)?.name || short(w);
    if (was) followSet.delete(w); else followSet.add(w);
    fill(errSlot);
    paintFollow(w);
    try {
      const r = await post('/follow', { follower_wallet: wallet, following_wallet: w }, { signal });
      if (r?.action === 'followed') followSet.add(w);
      else if (r?.action === 'unfollowed') followSet.delete(w);
      following.set([...followSet]);
      followCounts(wallet).refresh();
      // Their follower count, if this visit has shown it (their profile caches it 5 min).
      const theirs = followCounts(w);
      if (theirs.get().value) theirs.refresh();
    } catch (err) {
      if (signal.aborted) return;
      if (was) followSet.add(w); else followSet.delete(w);
      fill(errSlot, errorLine(`Couldn’t ${was ? 'unfollow' : 'follow'} ${name}. ${err.message}`, { small: true }));
    } finally {
      busy.delete(w);
      paintFollow(w);
    }
  }

  function apply() {
    let shown = 0;
    for (const [w, t] of tiles) {
      const ok = (!query || t.hay.includes(query)) && (mode === 'all' || followSet?.has(w));
      t.el.hidden = !ok;
      if (ok) shown += 1;
    }
    tally.textContent = query || mode !== 'all' ? `${num(shown, 0)} of ${num(list.length, 0)}` : `${num(list.length, 0)} BEARs`;
    none.hidden = shown > 0 || !painted;
    if (!none.hidden) {
      fill(none, h('b', mode === 'following' && !query ? 'You don’t follow anyone yet' : 'No BEAR by that name'),
        mode === 'following' && !query ? 'Tap Follow on anyone in Everyone and they’ll gather here.' : 'Try part of a name or a wallet address.');
    }
  }

  function render(users) {
    list = [...users].filter((u) => u?.wallet_address).sort((a, b) => {
      const ka = sortKey(a); const kb = sortKey(b);
      if (!ka !== !kb) return ka ? -1 : 1; // named first, bare addresses last
      return collator.compare(ka, kb);
    });
    // you, first
    const mine = list.findIndex((u) => u.wallet_address === wallet);
    if (mine > 0) list.unshift(...list.splice(mine, 1));
    tiles = new Map(list.map((u) => [u.wallet_address, tile(u)]));
    grid.removeAttribute('aria-busy');
    fill(grid, [...tiles.values()].map((t) => t.el));
    for (const w of tiles.keys()) paintFollow(w);
    fill(everyone);
    everyone.append(rollingFigure(num(list.length, 0)));
    const first = !painted;
    painted = true;
    apply();
    ringUp(grid);
    if (first) leaf([...grid.children].filter((c) => !c.hidden).slice(0, 20));
  }

  let lastSig = '';
  people.subscribe((s) => {
    if (s.value) {
      const sigNow = `${s.value.length}:${s.value[0]?.wallet_address}:${s.value.at(-1)?.wallet_address}`;
      if (sigNow !== lastSig) { lastSig = sigNow; render(s.value); }
    } else if (s.error && !painted) {
      grid.removeAttribute('aria-busy');
      fill(grid);
      fill(everyone, h('span.failed', '—'));
      fill(errSlot, errorLine(`The park’s BEARs didn’t load. ${s.error.message} Retrying.`));
    }
  }, signal);

  following.subscribe((s) => {
    if (s.value) {
      followSet = new Set(s.value);
      for (const w of tiles.keys()) if (!busy.has(w)) paintFollow(w);
      apply();
    } else if (s.error && !followSet) {
      fill(errSlot, errorLine(`Who you follow didn’t load. ${s.error.message}`, { small: true }));
    }
  }, signal);

  const el = h('div.stack.cm-friends-tab', { style: { '--gap': '16px' } }, strip, section);
  return { el };
}

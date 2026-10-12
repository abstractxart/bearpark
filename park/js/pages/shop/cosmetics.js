// Cosmetics: rings and banners for honey. A wall of glass tiles, each one your
// own bear wearing the item; a tap grows the item into a preview sheet that
// stays open through the purchase, so a failure is told in place.

import { h, fill } from '../../core/dom.js';
import { dialog, errorLine, statement, toast, words, empty } from '../../core/ui.js';
import { leaf } from '../../core/motion.js';
import { post } from '../../core/api.js';
import { points, profile, equipped } from '../../core/data.js';
import { num } from '../../core/format.js';
import { catalog, owned, honeyOf, spent, rarityOf, RARITY_ORDER, UNLOCK } from './feeds.js';
import { celebrate } from '../../core/fun.js';
import { ringArt, bannerArt, rarityChip, cost, facts, skTiles } from './looks.js';

const KINDS = [{ id: 'ring', label: 'Rings' }, { id: 'banner', label: 'Banners' }];

/** Put an item on (or take it off) at once, then tell the server; undo if it says no. */
export async function setWearing(wallet, item, on) {
  const feed = equipped(wallet);
  const before = feed.get().value || { ring: null, banner: null };
  const type = item.cosmetic_type;
  feed.set({ ...before, [type]: on ? item : null });
  try {
    if (on) await post('/cosmetics/equip', { wallet_address: wallet, cosmetic_id: item.id, cosmetic_type: type });
    else await post('/cosmetics/unequip', { wallet_address: wallet, cosmetic_type: type });
  } catch (err) {
    feed.set(before);
    throw err;
  }
  feed.refresh();
}

/** Shared view state for the cosmetics wall and the inventory. */
export function cosmeticState(wallet, signal, changed) {
  // Feeds answer synchronously on subscribe; the caller paints once it has the state.
  let ready = false;
  const onChange = (what) => { if (ready) changed(what); };
  const state = { items: null, failed: null, owned: new Set(), ownedReady: false, wearing: { ring: null, banner: null }, honey: null, me: null };
  let sig = '';
  catalog.subscribe((s) => {
    if (s.value) {
      // A refresh that changed nothing leaves the wall (and your focus) alone.
      const next = JSON.stringify(s.value.map((i) => [i.id, i.honey_cost, i.image_url, i.css_gradient, i.name]));
      if (next === sig && state.items) return;
      sig = next; state.items = s.value; state.failed = null; onChange('items');
    }
    else if (s.error && !state.items) { state.failed = s.error; onChange('items'); }
  }, signal);
  owned(wallet).subscribe((s) => {
    if (!s.value) return;
    state.owned = new Set(s.value.map((r) => r.cosmetic_id));
    state.ownedReady = true;
    onChange('owned');
  }, signal);
  equipped(wallet).subscribe((s) => {
    if (!s.value) return;
    state.wearing = { ring: s.value.ring || null, banner: s.value.banner || null };
    onChange('wearing');
  }, signal);
  points(wallet).subscribe(() => { state.honey = honeyOf(wallet); onChange('honey'); }, signal);
  profile(wallet).subscribe((s) => {
    if (s.value === undefined) return;
    const was = state.me?.avatar_nft;
    state.me = s.value;
    if (was !== s.value?.avatar_nft) onChange('me');
  }, signal);
  ready = true;
  return state;
}

export function itemArt(item, state, { wallet, live = false, big = false } = {}) {
  if (item.cosmetic_type === 'ring') return ringArt(item, { me: state.me, size: big ? 156 : 96, live });
  return bannerArt(item, { me: state.me, wallet, ring: state.wearing.ring, big, live });
}

export function cosmeticsPanel({ wallet, signal, go }) {
  let kind = 'ring';
  const grid = h('div.shop-grid.shop-grid--ring', skTiles(6, 'ring'));
  const count = h('span.section__aside', ' ');
  const tiles = new Map();
  const state = cosmeticState(wallet, signal, (what) => {
    if (what === 'items' || what === 'me') paint();
    else for (const t of tiles.values()) t.update();
  });

  const el = h('div.shop-panel',
    h('div.shop-bar', words(KINDS, { selected: kind, onChange: (k) => { kind = k; paint(true); } }), count),
    grid);
  queueMicrotask(() => paint());

  function paint(switched = false) {
    grid.className = `shop-grid shop-grid--${kind}`;
    if (!state.items) {
      if (state.failed) fill(grid, h('div.shop-span', errorLine(state.failed.message || 'The catalog could not load. It retries on its own.')));
      else fill(grid, skTiles(6, kind));
      return;
    }
    const list = state.items.filter((i) => i.cosmetic_type === kind);
    count.textContent = `${list.length} ${kind === 'ring' ? 'rings' : 'banners'}`;
    tiles.clear();
    const order = [...RARITY_ORDER, ...new Set(list.map((i) => i.rarity).filter((r) => !RARITY_ORDER.includes(r)))];
    const groups = order.map((r) => [r, list.filter((i) => i.rarity === r)]).filter(([, l]) => l.length);
    if (!groups.length) { fill(grid, h('div.shop-span', empty('Nothing here yet', 'New cosmetics land here first.'))); return; }
    fill(grid, groups.map(([r, l]) => [
      h('div.shop-group', h('span', rarityOf({ rarity: r }).label), h('span.shop-group__n.num', l.length)),
      l.map((item) => { const t = tile(item); tiles.set(item.id, t); return t.el; }),
    ]));
    if (switched || !grid.dataset.shown) leaf(grid.querySelectorAll('.shop-item'), { stagger: 35 });
    grid.dataset.shown = '1';
  }

  function tile(item) {
    const meta = h('span.shop-item__meta');
    const note = h('span.shop-item__note');
    const btn = h(`button.shop-item.shop-item--${item.cosmetic_type}`, { type: 'button', onclick: (e) => open(item, e.currentTarget) },
      h('span.shop-item__art', itemArt(item, state, { wallet })),
      h('span.shop-item__body', h('span.shop-item__name', item.name), meta, note));
    function update() {
      const own = state.owned.has(item.id);
      const wearing = state.wearing[item.cosmetic_type]?.id === item.id;
      const short = !own && state.honey != null ? item.honey_cost - state.honey : 0;
      btn.classList.toggle('is-owned', own);
      btn.classList.toggle('is-wearing', wearing);
      btn.disabled = short > 0 || btn.getAttribute('aria-busy') === 'true';
      fill(meta, rarityChip(item),
        own ? h(`span.chip${wearing ? '.chip--gold' : '.chip--green'}`, wearing ? 'Wearing' : 'Owned') : cost(item.honey_cost));
      note.textContent = short > 0 ? `${num(Math.ceil(short), 0)} honey short` : '';
      btn.setAttribute('aria-label', `${item.name}, ${rarityOf(item).label}. ${own ? (wearing ? 'Wearing it.' : 'You own it.') : `${num(item.honey_cost, 0)} honey${short > 0 ? `, ${num(Math.ceil(short), 0)} short` : ''}.`}`);
    }
    update();
    return { el: btn, update };
  }

  function open(item, origin) {
    if (state.owned.has(item.id)) wearSheet(item, origin);
    else buySheet(item, origin);
  }

  function buySheet(item, origin) {
    const balance = honeyOf(wallet);
    const preview = h(`div.shop-preview.shop-preview--${item.cosmetic_type}`, itemArt(item, state, { wallet, live: true, big: true }));
    const err = h('div.shop-dlg__err');
    const label = `Buy · ${num(item.honey_cost, 0)} HNY`;
    const cancel = h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Cancel');
    const buy = h('button.btn.btn--gold', { type: 'button', autofocus: true, onclick: () => purchase() }, label);
    const d = dialog({
      eyebrow: rarityOf(item).label.toUpperCase(), title: item.name, origin, size: item.cosmetic_type === 'banner' ? 'wide' : '',
      body: [preview,
        item.description ? h('p.body.shop-dlg__lede', item.description) : null,
        facts([
          ['Price', cost(item.honey_cost, { unit: true })],
          ['Your honey', balance != null ? `${num(balance, 0)} HNY` : '—'],
          balance != null ? ['After', `${num(balance - item.honey_cost, 0)} HNY`] : null,
        ]),
        err],
      foot: [cancel, buy],
    });
    d.el.classList.add('shop-dlg');

    async function purchase() {
      buy.disabled = true; cancel.disabled = true; buy.textContent = 'Buying';
      origin.setAttribute('aria-busy', 'true');
      fill(err);
      try {
        const res = await post('/cosmetics/purchase', { wallet_address: wallet, cosmetic_id: item.id });
        const mine = owned(wallet);
        mine.set([...(mine.get().value || []), { cosmetic_id: item.id, purchased_at: new Date().toISOString(), cosmetic: res.item || item }]);
        mine.refresh();
        spent(wallet, res.new_balance);
        toast({ eyebrow: UNLOCK[item.rarity] || 'UNLOCKED', title: item.name, body: 'It’s in your inventory.' });
        celebrate({ kind: 'purchase', origin: preview });
        fill(d.body, preview, statement({ tone: 'ok', title: 'It’s yours', body: `Put it on now, or any time from Inventory.${res.new_balance != null ? ` You have ${num(res.new_balance, 0)} honey left.` : ''}` }), err);
        const wear = h('button.btn.btn--gold', { type: 'button', onclick: async () => {
          wear.disabled = true; fill(err);
          try { await setWearing(wallet, item, true); d.close(); toast({ eyebrow: 'WEARING', title: item.name }); }
          catch (e) { wear.disabled = false; fill(err, errorLine(e.message || 'It could not be put on. Try again.')); }
        } }, item.cosmetic_type === 'ring' ? 'Wear it now' : 'Show it now');
        d.setFoot([h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Done'), wear]);
        wear.focus({ preventScroll: true });
      } catch (e) {
        buy.disabled = false; cancel.disabled = false; buy.textContent = label;
        fill(err, errorLine(e.message || 'The purchase didn’t go through.'));
      } finally {
        origin.removeAttribute('aria-busy');
        tiles.get(item.id)?.update();
      }
    }
  }

  function wearSheet(item, origin) {
    const wearing = () => state.wearing[item.cosmetic_type]?.id === item.id;
    const err = h('div.shop-dlg__err');
    const preview = h(`div.shop-preview.shop-preview--${item.cosmetic_type}`, itemArt(item, state, { wallet, live: true, big: true }));
    const act = h(`button.btn${wearing() ? '' : '.btn--gold'}`, { type: 'button', autofocus: true, onclick: async () => {
      act.disabled = true; fill(err);
      const on = !wearing();
      try { await setWearing(wallet, item, on); d.close(); if (on) toast({ eyebrow: 'WEARING', title: item.name }); }
      catch (e) { act.disabled = false; fill(err, errorLine(e.message || 'That didn’t save. Try again.')); }
    } }, wearing() ? 'Take it off' : (item.cosmetic_type === 'ring' ? 'Wear it' : 'Show it'));
    const d = dialog({
      eyebrow: 'YOURS', title: item.name, origin, size: item.cosmetic_type === 'banner' ? 'wide' : '',
      body: [preview, item.description ? h('p.body.shop-dlg__lede', item.description) : null, err],
      foot: [h('button.btn.btn--line', { type: 'button', onclick: () => { d.close(); go('inventory'); } }, 'Inventory'), act],
    });
    d.el.classList.add('shop-dlg');
  }

  return el;
}

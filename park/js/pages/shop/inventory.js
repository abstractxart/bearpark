// Inventory: what you own, rings and banners, and a mirror that shows what
// you're wearing. A tap puts an item on at once (the mirror changes before the
// server answers); if the server says no, it comes back off and says why.

import { h, fill } from '../../core/dom.js';
import { errorLine, empty, sectionHead } from '../../core/ui.js';
import { leaf } from '../../core/motion.js';
import { rarityOf, RARITY_ORDER } from './feeds.js';
import { rarityChip, bannerArt, skTiles } from './looks.js';
import { cosmeticState, itemArt, setWearing } from './cosmetics.js';

export function inventoryPanel({ wallet, signal, go }) {
  const mirror = h('div.shop-mirror__art');
  const wearingLine = h('div.shop-mirror__facts');
  const err = h('div.shop-mirror__err', { 'aria-live': 'polite' });
  const rings = h('div.shop-grid.shop-grid--ring', skTiles(4, 'ring'));
  const banners = h('div.shop-grid.shop-grid--banner', skTiles(2, 'banner'));
  const ringHead = sectionHead('Rings');
  const bannerHead = sectionHead('Banners');
  const body = h('div.shop-inv', h('section', ringHead, rings), h('section', bannerHead, banners));
  const tiles = new Map();
  let shown = false;

  const state = cosmeticState(wallet, signal, (what) => {
    if (what === 'wearing' || what === 'me' || what === 'items') paintMirror();
    if (what === 'items' || what === 'owned' || what === 'me') paint();
    else for (const t of tiles.values()) t.update();
  });

  function paintMirror() {
    fill(mirror, bannerArt(state.wearing.banner, { me: state.me, wallet, ring: state.wearing.ring, big: true, live: false }));
    fill(wearingLine,
      h('div.fact', h('span', 'Ring'), h('b', state.wearing.ring?.name || 'None')),
      h('div.fact', h('span', 'Banner'), h('b', state.wearing.banner?.name || 'None')));
  }

  function paint() {
    if (!state.items || !state.ownedReady) {
      if (state.failed) fill(body, errorLine(state.failed.message || 'Your inventory could not load. It retries on its own.'));
      return;
    }
    const mine = state.items.filter((i) => state.owned.has(i.id));
    const rank = (i) => { const k = RARITY_ORDER.indexOf(i.rarity); return k < 0 ? 99 : k; };
    mine.sort((a, b) => rank(b) - rank(a) || b.honey_cost - a.honey_cost);
    tiles.clear();
    if (!mine.length) {
      fill(body, h('div.frost.shop-empty',
        empty('Nothing here yet', 'Rings and banners you buy show up here, ready to wear.'),
        h('div.shop-empty__act', h('button.btn', { type: 'button', onclick: () => go('cosmetics') }, 'Browse cosmetics'))));
      return;
    }
    if (!body.contains(rings)) fill(body, h('section', ringHead, rings), h('section', bannerHead, banners));
    for (const [grid, head, type, label] of [[rings, ringHead, 'ring', 'Rings'], [banners, bannerHead, 'banner', 'Banners']]) {
      const list = mine.filter((i) => i.cosmetic_type === type);
      fill(head, h('h2.section-title', label), h('div.section__aside', list.length ? `${list.length} owned` : 'none yet'));
      fill(grid, list.length
        ? list.map((item) => { const t = tile(item); tiles.set(item.id, t); return t.el; })
        : h('div.shop-span.shop-none', `No ${label.toLowerCase()} yet. `, h('button.btn--text.btn', { type: 'button', onclick: () => go('cosmetics') }, 'Browse')));
    }
    if (!shown) { leaf(body.querySelectorAll('.shop-item'), { stagger: 35 }); shown = true; }
  }

  function tile(item) {
    const meta = h('span.shop-item__meta');
    const btn = h(`button.shop-item.shop-item--${item.cosmetic_type}.is-owned`, { type: 'button', onclick: () => toggle(item, btn) },
      h('span.shop-item__art', itemArt(item, state, { wallet })),
      h('span.shop-item__body', h('span.shop-item__name', item.name), meta));
    function update() {
      const on = state.wearing[item.cosmetic_type]?.id === item.id;
      btn.classList.toggle('is-wearing', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', `${item.name}, ${rarityOf(item).label}. ${on ? 'Wearing — tap to take it off.' : 'Tap to wear it.'}`);
      fill(meta, rarityChip(item), h(`span.shop-wear${on ? '.shop-wear--on' : ''}`, on ? 'Wearing' : 'Wear'));
    }
    update();
    return { el: btn, update };
  }

  async function toggle(item, btn) {
    if (btn.getAttribute('aria-busy') === 'true') return;
    const on = state.wearing[item.cosmetic_type]?.id !== item.id;
    btn.setAttribute('aria-busy', 'true');
    fill(err);
    try {
      await setWearing(wallet, item, on);
    } catch (e) {
      fill(err, errorLine(e.message || `${item.name} could not be ${on ? 'put on' : 'taken off'}. Try again.`));
    } finally {
      btn.removeAttribute('aria-busy');
    }
  }

  paintMirror();
  paint();
  return h('div.shop-panel',
    h('section.frost.frost--section.shop-mirror',
      h('div.pane-head', h('div.eyebrow', 'Wearing now'), h('div.section__aside', 'what people see on your profile')),
      h('div.rule'),
      h('div.shop-mirror__body', mirror, h('div.shop-mirror__side', wearingLine, err))),
    body);
}

// BEAR Shop: where honey turns into things. Cosmetics for your profile,
// FARM and SPIFFY tokens and Pixel BEARs for your wallet, real merch for your
// door, and the inventory of what you own. One pivot, five panes, each built
// the first time you open it and kept warm after (?tab= picks one).

import { h, fill } from '../core/dom.js';
import { pageHead, pivot, skFigure, loadCss } from '../core/ui.js';
import { roll, EASE, skip } from '../core/motion.js';
import { points, honey24h } from '../core/data.js';
import { num } from '../core/format.js';
import { ART } from '../core/art.js';
import { cosmeticsPanel } from './shop/cosmetics.js';
import { tokensPanel } from './shop/tokens.js';
import { nftsPanel } from './shop/nfts.js';
import { merchPanel } from './shop/merch.js';
import { inventoryPanel } from './shop/inventory.js';

export const title = 'Shop';


const TABS = [
  { id: 'cosmetics', label: 'Cosmetics', build: cosmeticsPanel },
  { id: 'tokens', label: 'Tokens', build: tokensPanel },
  { id: 'nfts', label: 'NFTs', build: nftsPanel },
  { id: 'merch', label: 'Merch', build: merchPanel },
  { id: 'inventory', label: 'Inventory', build: inventoryPanel },
];
const tabOf = (query) => (TABS.some((t) => t.id === query?.get('tab')) ? query.get('tab') : 'cosmetics');

export default function shop({ wallet, query, signal, navigate }) {
  loadCss('shop');

  // ── your honey: the gold tile, rolling on every change ──
  const fig = h('span.shop-purse__fig.num', skFigure('3.2em'));
  const sub = h('div.tile__sub', ' ');
  points(wallet).subscribe((s) => {
    if (s.value) {
      if (!fig.dataset.rolled) fig.replaceChildren();
      roll(fig, num(s.value.total_points, 0));
    } else if (s.error && !fig.dataset.rolled) {
      fill(fig, h('span.failed', '—'));
      sub.textContent = 'couldn’t load · retrying';
    }
  }, signal);
  honey24h(wallet).subscribe((s) => {
    if (s.value != null) sub.textContent = s.value > 0 ? `+${num(s.value, 0)} in the last 24 hours` : 'Earn more in games and raids';
  }, signal);

  const purse = h('a.tile.tile--gold.shop-purse', { href: '#/earn', 'aria-label': 'Your honey — earn more' },
    h('img.tile__mascot', { src: ART.honey, alt: '', loading: 'lazy' }),
    h('div.tile__label', 'Your honey'),
    h('div', h('div.shop-purse__row', fig, h('span.shop-purse__unit', 'HNY')), sub));

  const booth = h('div.park-band.shop-booth', { style: { '--pos': '50% 38%' } },
    h('img', { src: ART.booth, srcset: ART.boothSet, sizes: '(min-width: 1024px) 66vw, 100vw', alt: '', decoding: 'async' }),
    h('div.shop-booth__copy',
      h('div.eyebrow', 'The prize booth'),
      h('p.shop-booth__line', 'Trade honey for loot.'),
      h('p.shop-booth__sub', 'Rings and banners for your profile, tokens and Pixel BEARs for your wallet — and real merch, shipped to your door.')));

  // ── the pivot and its panes ──
  let current = tabOf(query);
  const panels = new Map();
  const host = h('div.shop-panels');
  const go = (id) => piv.select(id);
  const ctx = { wallet, signal, go };

  function show(id) {
    const prevIdx = TABS.findIndex((t) => t.id === current);
    const nextIdx = TABS.findIndex((t) => t.id === id);
    const old = panels.get(current);
    current = id;
    let panel = panels.get(id);
    if (!panel) {
      const tab = TABS[nextIdx];
      panel = h('section.shop-pane', { role: 'tabpanel', id: `shop-${id}`, 'aria-labelledby': `tab-${id}` }, tab.build(ctx));
      panels.set(id, panel);
      host.append(panel);
    }
    if (old && old !== panel) old.hidden = true;
    panel.hidden = false;
    if (old && old !== panel && !skip()) {
      const dir = nextIdx > prevIdx ? 1 : -1;
      panel.animate([{ opacity: 0, transform: `translateX(${dir * 36}px)` }, { opacity: 1, offset: 0.4 }, { opacity: 1, transform: 'none' }],
        { duration: 460, easing: EASE.decel, fill: 'backwards' });
    }
  }

  const piv = pivot(TABS.map(({ id, label }) => ({ id, label })), {
    selected: current, align: 'start', label: 'Shop sections',
    onChange: (id) => {
      show(id);
      navigate(`/shop?tab=${id}`, { replace: true });
    },
  });
  show(current);

  const el = h('main.page.shop',
    pageHead({ eyebrow: 'Spend your honey', title: 'BEAR Shop', gold: 'Shop' }),
    h('div.shop-top', { 'data-e': '' }, purse, booth),
    h('div.shop-pivot', { 'data-e': '' }, piv, h('div.rule')),
    h('div', { 'data-e': '' }, host));

  el.onQuery = (q) => piv.select(tabOf(q));
  return el;
}

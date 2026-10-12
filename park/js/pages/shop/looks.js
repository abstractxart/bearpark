// The Shop's small parts: a ring on your own bear, a banner behind it, rarity
// chips, honey prices, fact lists and skeleton tiles. Built with h() only.

import { h, icon } from '../../core/dom.js';
import { avatar, displayName } from '../../core/ui.js';
import { num, short } from '../../core/format.js';
import { rarityOf } from './feeds.js';

// A catalog gradient goes straight into style.background; anything that isn't
// a plain gradient is ignored rather than trusted.
const gradient = (css) => (/^(linear|radial|conic)-gradient\([^;{}<>]*\)$/.test(css || '') ? css : null);

/** Your bear wearing `ring`. `live` lets an animated ring turn — previews only, never the grid. */
export function ringArt(ring, { me, size = 84, live = false } = {}) {
  const el = h('span.shop-ring', avatar(me?.avatar_nft, { size, ring, name: displayName(me) }));
  if (live && ring?.is_animated) el.classList.add('shop-ring--spin');
  return el;
}

/**
 * A banner with your bear on it. `big` is the profile-header preview (name and
 * all); `live` lets a Living banner drift slowly — previews only.
 */
export function bannerArt(banner, { me, wallet = '', ring = null, big = false, live = false } = {}) {
  const drifting = live && banner?.image_url && banner?.rarity === 'bearableguy123';
  return h(`span.shop-banner${big ? '.shop-banner--big' : ''}${drifting ? '.shop-banner--live' : ''}${banner ? '' : '.shop-banner--none'}`,
    { style: { background: gradient(banner?.css_gradient) } },
    banner?.image_url ? h('img.shop-banner__img', { src: banner.image_url, alt: '', loading: 'lazy', decoding: 'async' }) : null,
    h('span.shop-banner__veil'),
    h('span.shop-banner__who',
      avatar(me?.avatar_nft, { size: big ? 64 : 34, ring }),
      big ? h('span.shop-banner__name', h('b', displayName(me) || short(wallet)), h('small', short(wallet))) : null));
}

export function rarityChip(item) {
  const r = rarityOf(item);
  return h(`span.chip${r.chip ? `.chip--${r.chip}` : ''}`, r.short || r.label);
}

/** A honey price: the hex glyph in gold, the figure in white. */
export function cost(n, { unit = false } = {}) {
  return h('span.shop-cost', icon('honey'), h('b.num', num(n, 0)), unit ? h('small', 'HNY') : null);
}

/** Label / value rows inside a dialog. */
export function facts(rows) {
  return h('div.shop-facts', rows.filter(Boolean).map(([label, value]) => h('div.fact', h('span', label), h('b', value))));
}

/** Tiles in the shape of what's coming. */
export function skTiles(n = 6, kind = 'ring') {
  return Array.from({ length: n }, (_, i) => h(`div.shop-item.shop-item--sk.shop-item--${kind}`, { 'aria-hidden': 'true' },
    h('span.shop-item__art', h('span.sk.sk--block', { style: { '--h': '100%', borderRadius: '0', '--d': `${i * 80}ms` } })),
    h('span.shop-item__body', h('span.sk.sk--line', { style: { '--w': `${52 + ((i * 29) % 30)}%`, '--d': `${i * 80}ms` } }),
      h('span.sk.sk--line', { style: { '--w': '38%', height: '9px', '--d': `${i * 80 + 40}ms` } }))));
}

/** Product art sits on a light card (the shots are on white). */
export function productImg(src, { alt = '', eager = false } = {}) {
  return src
    ? h('img', { src, alt, loading: eager ? 'eager' : 'lazy', decoding: 'async' })
    : h('span.shop-noart', icon('shirt'));
}

// Stream: the Kick player (loaded only while this tab is open, unloaded when
// you leave it), the official communities, and where to buy $BEAR.

import { h, icon } from '../../core/dom.js';
import { pane } from '../../core/ui.js';
import { LINKS } from '../../core/market.js';
import { R2 } from './common.js';
import { ART } from '../../core/art.js';

const NETWORK = [
  { name: 'BEAR Swap', sub: 'The house DEX · lowest fees on XRPL', href: LINKS.trade, logo: '/apple-touch-icon.png', house: true },
  { name: 'First Ledger', sub: 'Trade $BEAR on First Ledger', href: LINKS.firstledger, logo: `${R2}/du61x3.jpg` },
  { name: 'xMagnetic', sub: 'The BEAR/XRP market on Magnetic', href: LINKS.xmagnetic, logo: ART.xmagneticLogo },
  { name: 'XPMarket', sub: 'Trade $BEAR on XPMarket', href: LINKS.xpmarket, logo: `${R2}/1dw0sy.png` },
];

export function streamTab() {
  const sk = h('span.sk.sk--block.cm-stream__sk', { 'aria-hidden': 'true' });
  const frame = h('div.cm-stream__frame', sk);
  let iframe = null;

  function mount() {
    if (iframe) return;
    if (!sk.isConnected) frame.prepend(sk);
    iframe = h('iframe', {
      src: `${LINKS.kickPlayer}?autoplay=true&muted=true`,
      title: 'BEAR on Kick — live stream',
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
      allowFullscreen: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    // The shimmer stops the moment the player is up.
    iframe.addEventListener('load', () => sk.remove(), { once: true });
    frame.append(iframe);
  }
  function unmount() {
    iframe?.remove();
    iframe = null;
  }

  const player = h('section.frost.cm-stream', { 'data-e': '', 'aria-label': 'Live stream' },
    frame,
    h('div.cm-stream__bar',
      h('div.zune',
        h('div.eyebrow.eyebrow--sm', 'The BEAR stream'),
        h('div.cm-stream__name', 'kick.com/', h('span.gold', 'bearxrpl'))),
      h('a.btn.btn--line.btn--sm', { href: LINKS.kick, target: '_blank', rel: 'noopener noreferrer' }, 'Open on Kick', icon('external'))));

  const network = pane({
    title: 'Buy $BEAR',
    body: [h('div.rows', NETWORK.map((n) => h('a.row.cm-net', { href: n.href, target: '_blank', rel: 'noopener noreferrer' },
      h(`span.cm-net__logo${n.house ? '.cm-net__logo--house' : ''}`, h('img', { src: n.logo, alt: '', loading: 'lazy', decoding: 'async', width: 40, height: 40 })),
      h('span.row__main', h('span.row__title', n.name), h('span.row__sub', n.sub)),
      icon('external', 'row__chev'))))],
  });

  const band = h('section.park-band.cm-fam', { 'data-e': '' },
    h('img', { src: ART.stream, srcset: ART.streamSet, sizes: '100vw', alt: '', loading: 'lazy', decoding: 'async' }),
    h('div.zune',
      h('div.eyebrow', 'Official communities'),
      h('h2.park-title.park-title--sm', 'Join the ', h('span.gold', 'BEAR'), ' fam'),
      h('p.cm-fam__line', 'Discord daily. Spaces daily. Raiding daily. Having fun daily.')));

  const social = (cls, glyph, label, title, sub, href) => h(`a.tile.cm-social${cls}`, { href, target: '_blank', rel: 'noopener noreferrer' },
    h('div.spread', h('div.tile__label', label), icon('external', 'cm-social__ext')),
    h('span.cm-social__glyph', icon(glyph)),
    h('div', h('div.cm-social__title', title), h('div.tile__sub', sub)));

  const socials = h('div.tile-wall.cm-socials', { 'data-e': '' },
    social('', 'x', 'X', '@BearXRPL', 'News, raids and Spaces', LINKS.x),
    social('.tile--purple', 'discord', 'Discord', 'BEAR Discord', 'Talk with the fam every day', LINKS.discord),
    social('.tile--green', 'kick', 'Kick', 'bearxrpl', 'Streams and 5D memes', LINKS.kick));

  const el = h('div.stack.cm-stream-tab', { style: { '--gap': '18px' } },
    h('div.cols.cols--main', { style: { '--gap': '16px' } }, player, h('div', { 'data-e': '' }, network)),
    band,
    socials);

  return { el, show: mount, hide: unmount };
}

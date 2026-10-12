// The front door (signed out): what BEAR Park is, $BEAR live, and the three
// ways in. The sign-in card sits where BEAR Swap's swap card sits.

import { h, icon } from '../core/dom.js';
import { bind, skFigure } from '../core/ui.js';
import { arrive, hingeText, leaf, rise } from '../core/motion.js';
import { bearFeed, BEAR, LINKS } from '../core/market.js';
import { price, pct, tone, compact, num, usd } from '../core/format.js';
import { ART, GAMES } from '../core/art.js';
import { bearCity, secretTaps, jester } from '../core/fun.js';
import { openSignIn, signInRows } from '../signin/sheet.js';

export default function landing() {
  const headline = h('h1.headline', { 'data-e': '' });
  const card = h('div.frost.frost--lg.land-card', { 'data-e': '' },
    h('div.si-head',
      h('div.eyebrow', 'SIGN IN TO'),
      h('h2.si-title', h('span.bear', 'BEAR'), ' PARK'),
      h('p.lede', 'Prove a wallet is yours. It’s free, and nothing is sent.')),
    signInRows(null, { onPick: (start, popup) => openSignIn({ start, popup, origin: card }) }),
    h('div.si-foot', icon('lock'), 'Non-custodial — BEAR Park never sees your keys.'),
    h('div.si-entry.caption', `Entry · ${num(BEAR.minEntry, 0)} $BEAR or one BEAR NFT`));

  const holdersFact = h('span', '— holders');
  bearFeed.subscribe((s) => { if (s.value?.holders) holdersFact.textContent = `${num(s.value.holders, 0)} holders`; });

  // The wooden sign keeps the old park's secret: tap it five times.
  const sign = secretTaps(h('img.land-sign', { src: ART.sign, alt: '', width: 132, height: 132, draggable: false }), 5, jester);

  // Bear City: the park's street, with BEARs strolling it (tap one to say gm).
  const city = h('div.park-band.land-city', { 'data-e': '' },
    h('img', { src: ART.park, srcset: ART.parkSet, sizes: '100vw', alt: '', loading: 'lazy', decoding: 'async' }),
    h('div.land-city__note', h('div.eyebrow', 'Bear City'), h('div.caption', 'Tap a BEAR to say gm')));
  bearCity(city, {
    count: innerWidth < 640 ? 4 : 5,
    feet: [10, 28],
    size: innerWidth < 640 ? [46, 58] : [54, 72],
  });

  const hero = h('section.land-hero',
    h('div.land-art', { 'aria-hidden': 'true' }, h('img', { src: ART.park, srcset: ART.parkSet, sizes: '100vw', alt: '', decoding: 'async', fetchPriority: 'high' })),
    h('div.land-copy',
      h('div.eyebrow', { 'data-e': '' }, 'The $BEAR community on the XRP Ledger'),
      h('div.land-brand', { 'data-e': '' },
        sign,
        h('div', h('div.wordmark.land-mark', h('span.bear', 'BEAR'), h('span.park', 'PARK')), h('span.tri', { style: { '--tri-w': '100%', marginTop: '10px' } }))),
      headline,
      h('p.land-pitch', { 'data-e': '' }, 'Arcade games that pay honey for every minute, X raids, daily BEARdrops, a shop and the people who run it — all on your own wallet.'),
      h('div.land-facts', { 'data-e': '' }, h('span', '4 games'), h('span', 'Daily BEARdrops'), holdersFact)),
    card,
    city);

  const tile = (label, slot, sub) => h('div.tile.frost', h('div.tile__label', label), slot, sub);
  const priceSlot = h('div.tile__value');
  const changeSub = h('div.tile__sub');
  const capSlot = h('div.tile__value');
  const holdSlot = h('div.tile__value');
  const tvlSlot = h('div.tile__value');
  bind(priceSlot, bearFeed, (v) => h('span.num', price(v.price), h('span.stat__unit', 'XRP')), { skeleton: () => skFigure('4em') });
  bearFeed.subscribe((s) => {
    const v = s.value;
    if (!v) return;
    changeSub.replaceChildren(h(`span.${tone(v.change24h)}`, pct(v.change24h)), ' today · ', v.priceUsd ? usd(v.priceUsd) : '');
  });
  bind(capSlot, bearFeed, (v) => h('span.num', `$${compact(v.marketCap)}`));
  bind(holdSlot, bearFeed, (v) => h('span.num', num(v.holders, 0)));
  bind(tvlSlot, bearFeed, (v) => h('span.num', compact(v.tvl), h('span.stat__unit', 'XRP')));

  const ticker = h('section.land-tiles',
    h('div.section__head', h('h2.section-title', h('span.gold', '$BEAR'), ' right now'),
      h('a.btn.btn--sm', { href: LINKS.trade, target: '_blank', rel: 'noopener' }, 'Trade on BEAR Swap', icon('external'))),
    h('div.land-ticker', { 'data-reveal': 'rows' },
      tile('Price', priceSlot, changeSub),
      tile('Market cap', capSlot, h('div.tile__sub', 'USD')),
      tile('Holders', holdSlot, h('div.tile__sub', 'wallets with $BEAR')),
      tile('Pool liquidity', tvlSlot, h('div.tile__sub', 'across $BEAR pools'))));

  const inside = h('section.land-tiles',
    h('div.section__head', h('h2.park-title.park-title--sm', 'Where would you like to ', h('span.gold', 'go?'))),
    h('div.tile-wall', { 'data-reveal': 'rows' },
      GAMES.map((g) => h('button.tile', { type: 'button', style: { minHeight: '168px' }, onclick: (e) => openSignIn({ origin: e.currentTarget }) },
        h('img.tile__art', { src: g.art, alt: '', loading: 'lazy', style: { opacity: '.9' } }), h('span.tile__scrim'),
        h('div.tile__label', g.tag), h('div', h('div', { style: { font: '700 18px/1.2 var(--font)' } }, g.name), h('div.tile__sub', g.blurb)))),
      [['purple', 'Raids', 'Boost $BEAR on X and earn honey for every raid.', ART.coin],
        ['gold', 'Honey', 'Every minute played and every raid pays honey.', ART.honey],
        ['green', 'BEARdrops', 'Hold BEAR NFTs or LP, stay active, claim $BEAR daily.', ART.sign],
        ['', 'Shop', 'Rings, banners, tokens, NFTs and real merch for honey.', null]]
        .map(([tone, title, blurb, art]) => h(`button.tile${tone ? `.tile--${tone}` : ''}`, { type: 'button', style: { minHeight: '168px' }, onclick: (e) => openSignIn({ origin: e.currentTarget }) },
          art ? h('img.tile__mascot', { src: art, alt: '', loading: 'lazy' }) : null,
          h('div.tile__label', title),
          h('div', { style: { maxWidth: art ? '58%' : 'none' } }, h('div', { style: { font: '400 26px/1 var(--font-brand)', letterSpacing: '.02em', textTransform: 'uppercase', marginBottom: '6px' } }, title), h('div.tile__sub', { style: { fontSize: '12.5px' } }, blurb))))));

  const el = h('main.land', hero, ticker, inside);

  requestAnimationFrame(() => {
    hingeText(headline, 'Play. Raid. Earn honey.', { delay: 260 });
    const honey = [...headline.querySelectorAll('.hinge-word')].at(-1);
    honey?.classList.add('gold');
    arrive(el.querySelectorAll('.land-copy > [data-e]:not(h1), .land-card, .land-city'), { delay: 120 });
    leaf(card.querySelectorAll('.si-row'), { delay: 640, stagger: 70 });
    rise(card.querySelector('.si-foot'), { delay: 900 });
  });
  return el;
}

// $BEAR: the token page. The figures are BEAR Swap's (its prewarmed feed), the
// chart is inftf's (where BEAR Swap and xMagnetic chart), the holders are BEAR
// Swap's scanner — so this page and BEAR Swap's token page agree to the digit.

import { h, icon, fill } from '../core/dom.js';
import { pageHead, pane, pivot, bind, skFigure, skRows, errorLine, empty, copyButton, loadCss } from '../core/ui.js';
import { roll, leaf, rise } from '../core/motion.js';
import { bearFeed, bearCandles, bearHolders, BEAR, LINKS, CHART_RANGES } from '../core/market.js';
import { holdings, lpPosition, bearNfts } from '../core/ledger.js';
import { areaChart } from '../core/chart.js';
import { price, pct, tone, compact, num, usd, short } from '../core/format.js';
import { ART } from '../core/art.js';

export const title = '$BEAR';

const KNOWN = {
  [BEAR.amm]: 'BEAR / XRP pool',
  [BEAR.issuer]: 'Issuer',
};

const timeFmt = {
  '1D': (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  '7D': (t) => new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric' }),
  '1M': (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric' }),
  '1Y': (t) => new Date(t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }),
};

export default function bear({ wallet, query, signal }) {
  loadCss('bear');

  // ── hero: the price ──
  const priceFig = h('span.bear-price__fig.num', skFigure('5em'));
  const usdLine = h('div.bear-price__usd', ' ');
  const changes = h('div.bear-changes');
  let painted = false;
  bearFeed.subscribe((s) => {
    const v = s.value;
    if (!v) {
      if (s.error && !painted) fill(priceFig, h('span.failed', '—'));
      return;
    }
    if (!painted) priceFig.replaceChildren();
    roll(priceFig, price(v.price));
    painted = true;
    usdLine.textContent = v.priceUsd ? `${usd(v.priceUsd)} · 1 XRP = ${usd(v.xrpUsd)}` : '';
    fill(changes, [['1H', v.change1h], ['24H', v.change24h], ['7D', v.change7d]].map(([k, c]) =>
      h('span.bear-change', h('span.caption', k), h(`b.${tone(c)}`, pct(c)))));
  }, signal);

  const hero = h('section.bear-hero', { 'data-e': '' },
    h('div.bear-price',
      h('div.caption', 'Price · XRP'),
      h('div.cluster', { style: { alignItems: 'baseline', gap: '10px' } }, priceFig, h('span.bear-price__unit', 'XRP')),
      usdLine, changes),
    h('div.bear-cta',
      h('a.btn.btn--gold', { href: LINKS.trade, target: '_blank', rel: 'noopener' }, 'Trade $BEAR', icon('arrow-right')),
      h('span.caption', 'on BEAR Swap')));

  // ── chart ──
  let range = CHART_RANGES.includes(query.get('range')) ? query.get('range') : '7D';
  const chartBox = h('div.bear-chart', h('span.sk.sk--block', { style: { '--h': '280px' } }));
  const rangeLine = h('div.section__aside', ' ');
  let chartOff = null;
  function showRange(r) {
    range = r;
    chartOff?.abort();
    chartOff = new AbortController();
    signal.addEventListener('abort', () => chartOff.abort(), { once: true });
    fill(chartBox, h('span.sk.sk--block', { style: { '--h': '280px' } }));
    let drawn = false;
    bearCandles(r).subscribe((s) => {
      if (s.value?.length) {
        if (drawn) return; // a refresh lands quietly: the next range switch redraws
        drawn = true;
        fill(chartBox, areaChart(s.value, { height: 280, format: (v) => `${price(v)} XRP`, formatTime: timeFmt[r] }));
        const first = s.value[0].c;
        const last = s.value.at(-1).c;
        const lo = Math.min(...s.value.map((c) => c.c));
        const hi = Math.max(...s.value.map((c) => c.c));
        fill(rangeLine, h(`span.${tone(last - first)}`, pct(((last - first) / first) * 100)), ` · low ${price(lo)} · high ${price(hi)}`);
      } else if (s.error && !drawn) {
        fill(chartBox, h('div', { style: { padding: '24px 0' } }, errorLine(s.error.message || 'The chart could not load.')));
      } else if (s.value && !s.value.length && !drawn) {
        fill(chartBox, empty('No trades in this range', 'Try a longer range.'));
      }
    }, chartOff.signal);
  }
  const ranges = pivot(CHART_RANGES.map((r) => ({ id: r, label: r })), { selected: range, align: 'start', label: 'Chart range', onChange: (r) => showRange(r) });
  showRange(range);
  const chartPane = h('section.frost.frost--section.bear-chart-pane', { 'data-e': '' },
    h('div.pane-head', ranges, rangeLine), h('div.rule'), h('div.pane-body', { style: { paddingTop: '18px', paddingBottom: '10px' } }, chartBox),
    h('div.bear-chart__src', 'Candles from inftf, the same as BEAR Swap’s chart'));

  // ── market facts ──
  const tile = (label, render, sub) => {
    const slot = h('div.tile__value.tile__value--md');
    bind(slot, bearFeed, render, { signal });
    return h('div.tile', h('div.tile__label', label), slot, sub ? h('div.tile__sub', sub) : null);
  };
  const facts = h('div.tile-wall.bear-facts', { 'data-reveal': 'rows' },
    tile('Market cap', (v) => h('span.num', `$${compact(v.marketCap)}`), 'USD'),
    tile('Holders', (v) => h('span.num', num(v.holders, 0)), 'wallets with $BEAR'),
    tile('Trust lines', (v) => h('span.num', num(v.trustlines, 0)), 'can receive it'),
    tile('Liquidity', (v) => h('span.num', compact(v.tvl), h('span.stat__unit', 'XRP')), 'in $BEAR pools'),
    tile('Volume', (v) => h('span.num', compact(v.volume24h), h('span.stat__unit', 'XRP')), 'last 24h'),
    tile('Top 10 hold', (v) => h('span.num', v.insight?.top10 != null ? `${num(v.insight.top10, 1)}%` : '—'), 'of the supply'));

  const insight = h('div.rows');
  bearFeed.subscribe((s) => {
    const i = s.value?.insight;
    if (!i) return;
    fill(insight, [
      ['Traders today', `${num(i.traders, 0)}`, `${num(i.buyers, 0)} buying · ${num(i.sellers, 0)} selling`],
      ['XRP in / out today', `${compact(i.buyXrp)} / ${compact(i.sellXrp)}`, 'bought vs sold, in XRP'],
      ['Pool tokens burned', i.lpBurned != null ? `${num(i.lpBurned, 1)}%` : '—', 'liquidity that can never be pulled'],
      ['RSI', i.rsi != null ? num(i.rsi, 0) : '—', i.rsi > 70 ? 'running hot' : i.rsi < 30 ? 'cooled off' : 'balanced'],
      ['From the high', i.ath != null ? pct(i.ath) : '—', 'versus the all-time high'],
    ].map(([label, value, sub]) => h('div.row', h('div.row__main', h('div.row__title', label), h('div.row__sub', sub)), h('div.row__value', value))));
  }, signal);

  // ── your position ──
  const mine = h('div.rows');
  const paintMine = () => {
    const hold = holdings(wallet).get().value;
    const lp = lpPosition(wallet).get().value;
    const nfts = bearNfts(wallet).get().value;
    const px = bearFeed.get().value?.price;
    const rows = [];
    if (hold) rows.push(['$BEAR', num(hold.bear, 0), px ? `≈ ${num(hold.bear * px, 0)} XRP` : '']);
    if (lp) rows.push(['In the BEAR / XRP pool', lp.lp > 0 ? `${num(lp.share * 100, 3)}%` : 'None', lp.lp > 0 ? `${compact(lp.bear)} BEAR + ${compact(lp.xrp)} XRP` : 'Add liquidity on BEAR Swap']);
    if (nfts) rows.push(['BEAR NFTs', num(nfts.all.length, 0), `${num(nfts.pixel, 0)} Pixel · ${num(nfts.ultra, 0)} BEAR`]);
    if (!rows.length) { fill(mine, skRows(3)); return; }
    fill(mine, rows.map(([label, value, sub]) => h('div.row', h('div.row__main', h('div.row__title', label), h('div.row__sub', sub)), h('div.row__value', value))));
  };
  for (const feed of [holdings(wallet), lpPosition(wallet), bearNfts(wallet), bearFeed]) feed.subscribe(paintMine, signal);

  // ── holders ──
  const holderRows = h('div.rows', skRows(8));
  let holdersShown = false;
  bearHolders.subscribe((s) => {
    if (!s.value) { if (s.error) fill(holderRows, empty('Holders could not load', 'BEAR Swap’s scanner is busy; it retries on its own.')); return; }
    fill(holderRows, s.value.holders.slice(0, 25).map((x) => h('a.row', { href: LINKS.bithomp(x.account), target: '_blank', rel: 'noopener' },
      h(`span.row__rank${x.rank <= 3 ? `.row__rank--${x.rank}` : ''}`, x.rank),
      h('div.row__main', h('div.row__title', KNOWN[x.account] || (x.account === wallet ? 'You' : short(x.account, 6, 5))),
        h('div.row__sub', KNOWN[x.account] ? short(x.account, 6, 5) : `${num(x.percentage, 2)}% of supply`)),
      h('div.row__value', compact(x.balance), h('small', 'BEAR')))));
    if (!holdersShown) { holdersShown = true; leaf(holderRows.children); }
  }, signal);

  // ── the collections ──
  const collection = (name, blurb, video, poster, href) => h('a.tile.bear-nft', { href, target: '_blank', rel: 'noopener' },
    // No bytes until it scrolls into view (the observer below sets src and plays).
    h('video.tile__art', { dataset: { src: video }, poster, muted: true, loop: true, playsInline: true, preload: 'none', style: { opacity: '1' } }),
    h('span.tile__scrim'),
    h('div.tile__label', 'Collection'),
    h('div', h('div', { style: { font: '300 30px/1.05 var(--font)', letterSpacing: '-.8px' } }, name), h('div.tile__sub', blurb),
      h('div.tile__sub', { style: { color: 'var(--gold)', marginTop: '6px' } }, 'View on xrp.cafe ', icon('external'))));
  const nfts = h('section.section', { id: 'nfts' },
    h('div.section__head', h('h2.section-title', 'BEAR NFTs')),
    h('div.bear-nfts', { 'data-reveal': 'rows' },
      collection('Ultra Rare BEARs', 'The first mint: 667 BEARs. Hold one and BEAR Park is open to you.', ART.ultraVideo, ART.ultraPoster, LINKS.xrpcafe),
      collection('Pixel BEARs', '5,880 Pixel BEARs — a profile picture for every $BEAR maxi.', ART.pixelVideo, ART.pixelPoster, LINKS.xrpcafePixel)));
  // Videos play only while on screen.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        v.play?.().catch(() => {});
      } else v.pause?.();
    }
  }, { threshold: 0.25 });
  queueMicrotask(() => nfts.querySelectorAll('video').forEach((v) => io.observe(v)));
  signal.addEventListener('abort', () => io.disconnect(), { once: true });

  // ── the token itself ──
  const tokenFacts = h('div.pane-body',
    h('div.fact', 'Ticker', h('b', '$BEAR')),
    h('div.fact', 'Issuer', h('b.cluster', { style: { gap: '2px', justifyContent: 'flex-end' } }, short(BEAR.issuer, 8, 6), copyButton(BEAR.issuer, 'Copy issuer'))),
    h('div.fact', 'Currency code', h('b', short(BEAR.currency, 8, 4))),
    h('div.fact', 'Home', h('b', h('a', { href: 'https://bearableguy.xyz', target: '_blank', rel: 'noopener' }, 'bearableguy.xyz'))),
    h('div.fact', 'Ledger', h('b', 'XRP Ledger')));

  const venues = [
    ['BEAR Swap', 'The BEAR exchange — lowest fees, referral payouts', LINKS.trade, true],
    ['xMagnetic', 'Order book and chart', LINKS.xmagnetic],
    ['XPMarket', 'Token page and pools', LINKS.xpmarket],
    ['First Ledger', 'Token page', LINKS.firstledger],
  ];
  const where = h('div.rows', venues.map(([name, sub, href, ours]) => h('a.row', { href, target: '_blank', rel: 'noopener' },
    h('div.row__main', h('div.row__title', ours ? h('span.wordmark.wordmark--inline', { style: { fontSize: '17px' } }, h('span.bear', 'BEAR'), h('span.park', 'SWAP')) : name), h('div.row__sub', sub)),
    icon('external', 'row__chev'))));

  const el = h('main.page.bear',
    pageHead({ eyebrow: 'THE TOKEN', title: '$BEAR', gold: '$BEAR' }),
    hero,
    chartPane,
    h('div.section', { 'data-e': '' }, facts),
    h('div.cols.cols--2.section',
      h('div.stack', { style: { '--gap': '16px' } },
        pane({ title: 'Market today', aside: 'xrpl.to via BEAR Swap', body: [insight] }),
        pane({ title: 'Your $BEAR', body: [mine] }),
        pane({ title: 'The token', body: [tokenFacts] }),
        pane({ title: 'Where to trade', body: [where] })),
      pane({ title: 'Top holders', aside: h('span', { id: 'holder-total' }), body: [holderRows] })),
    nfts);

  bearHolders.subscribe((s) => {
    const t = el.querySelector('#holder-total');
    if (t && s.value?.total) t.textContent = `${num(s.value.total, 0)} in all`;
  }, signal);

  el.onQuery = (q) => {
    if (q.get('tab') === 'nfts') nfts.scrollIntoView({ behavior: 'smooth' });
    const r = q.get('range');
    if (CHART_RANGES.includes(r) && r !== range) ranges.select(r);
  };
  if (query.get('tab') === 'nfts') requestAnimationFrame(() => nfts.scrollIntoView());
  requestAnimationFrame(() => rise(usdLine, { delay: 400 }));
  return el;
}

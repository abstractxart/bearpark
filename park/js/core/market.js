// $BEAR's market, from the same places BEAR Swap reads it — so the price on
// BEAR Park is the price on BEAR Swap and in BEAR Wallet, to the digit.
//
//   figures  BEAR Swap's prewarmed token feed (/api/leaderboard, xrpl.to-sourced,
//            refreshed ~25 s): price in XRP, 1h/24h/7d change, market cap (USD),
//            holders, trust lines, TVL, and the XRP/USD rate it used.
//   candles  inftf's market_data, browser-direct — where BEAR Swap's and
//            xMagnetic's charts read. NOT BEAR Swap's /api/candles: that indexer
//            misses AMM-only fills and draws a different market.
//   holders  BEAR Swap's holder scanner.
//
// This replaces the old page's DexScreener polling and its hard-coded $2.50 XRP.

import { market, live } from './api.js';

export const BEAR = {
  issuer: 'rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW',
  currency: '4245415200000000000000000000000000000000',
  amm: 'rwE86ARLXfyKYCVmFpk511ddYfs5Fh6Vcp',
  nftIssuer: 'rBEARbo4Prn33894evmvYcAf9yAQjp4VJF',
  minEntry: 10000,
};

export const LINKS = {
  swap: `https://swap.bearpark.xyz/tokens/${BEAR.currency}/${BEAR.issuer}`,
  trade: `https://swap.bearpark.xyz/tokens/${BEAR.currency}/${BEAR.issuer}/trade`,
  swapHome: 'https://swap.bearpark.xyz/',
  xmagnetic: `https://xmagnetic.org/dex/BEAR+${BEAR.issuer}_XRP+XRP?network=mainnet`,
  firstledger: `https://firstledger.net/token/${BEAR.issuer}/${BEAR.currency}`,
  xpmarket: `https://xpmarket.com/token/BEAR-${BEAR.issuer}`,
  bithomp: (a) => `https://bithomp.com/explorer/${a}`,
  tx: (hash) => `https://livenet.xrpl.org/transactions/${hash}`,
  xrpcafe: 'https://xrp.cafe/collection/bearxrpl',
  xrpcafePixel: 'https://xrp.cafe/collection/bear-pixel-collection',
  x: 'https://x.com/BearXRPL',
  discord: 'https://discord.com/invite/atGTNuzqH6',
  kick: 'https://kick.com/bearxrpl',
  kickPlayer: 'https://player.kick.com/bearxrpl',
};

/** The BEAR row from BEAR Swap's feed: { price (XRP), priceUsd, change1h/24h/7d, marketCap, holders, trustlines, tvl, xrpUsd, volume24h } */
export const bearFeed = live('market:bear', async () => {
  let page = await market('/leaderboard?limit=150');
  let row = page.tokens?.find((t) => t.issuer === BEAR.issuer);
  if (!row) {
    page = await market('/leaderboard?limit=500');
    row = page.tokens?.find((t) => t.issuer === BEAR.issuer);
  }
  if (!row) throw new Error('BEAR is missing from the market feed');
  const xrpUsd = Number(page.xrpUsdRate) || null;
  return {
    price: row.price,
    priceUsd: xrpUsd ? row.price * xrpUsd : null,
    change1h: row.priceChange1h,
    change24h: row.priceChange24h,
    change7d: row.priceChange7d,
    marketCap: row.marketCap,
    holders: row.holders,
    trustlines: row.trustlines,
    tvl: row.tvl,
    volume24h: row.volume24h,
    xrpUsd,
    insight: row.insight || null,
    ageSec: page.ageSec,
  };
}, { every: 30_000 });

const INFTF = 'https://xrpldata.inftf.org/v1/iou/market_data';
const RANGES = {
  '1D': { interval: '15m', limit: 96 },
  '7D': { interval: '1h', limit: 168 },
  '1M': { interval: '4h', limit: 180 },
  '1Y': { interval: '1d', limit: 365 },
};
export const CHART_RANGES = Object.keys(RANGES);

/** Candles for a range: [{ t, o, h, l, c, v }] ascending (v in XRP). */
export function bearCandles(range = '7D') {
  const { interval, limit } = RANGES[range] || RANGES['7D'];
  return live(`market:candles:${range}`, async () => {
    const url = `${INFTF}/${BEAR.issuer}_${BEAR.currency}/XRP?interval=${interval}&descending=true&limit=${limit}&min_counter_volume=0.00001&start=2015-01-01T00:00:00Z`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(res.status === 429 ? 'The chart source is busy' : 'The chart could not load');
    const rows = await res.json();
    return despike(rows
      .filter((r) => Number.isFinite(r.close) && r.timestamp)
      .map((r) => ({ t: Date.parse(r.timestamp), o: r.open, h: r.high, l: r.low, c: r.close, v: r.counter_volume }))
      .sort((a, b) => a.t - b.t));
  }, { every: range === '1D' ? 60_000 : 180_000 });
}

/**
 * Dust fills — a few drops printing any price at all — make one- and two-candle
 * spikes. BEAR Swap clamps them; here a close more than 6% off the median of
 * its five-candle neighbourhood is laid back on that median.
 */
function despike(bars) {
  const closes = bars.map((b) => b.c);
  return bars.map((b, i) => {
    if (i < 2 || i > bars.length - 3) return b;
    const win = closes.slice(i - 2, i + 3).sort((x, y) => x - y);
    const med = win[2];
    return med && Math.abs(b.c - med) / med > 0.06 ? { ...b, c: med, spike: true } : b;
  });
}

/** Top holders: { total, holders: [{ rank, account, balance, percentage }] }. */
export const bearHolders = live('market:holders', async () => {
  const res = await market(`/holders/${BEAR.currency}/${BEAR.issuer}?limit=25`, { timeout: 20_000 });
  return { total: res.data?.totalHolders ?? null, holders: res.data?.holders || [] };
}, { every: 10 * 60_000 });

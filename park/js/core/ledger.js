// A wallet's on-ledger facts, read through BEAR Swap's XRPL proxy (per-request
// node failover, the same path BEAR Swap uses), instead of the old page's
// 900 KB xrpl.js bundle and its raw WebSockets to public nodes.

import { market, live } from './api.js';
import { BEAR } from './market.js';

const BEAR_CURRENCIES = new Set([BEAR.currency, 'BEAR']);

/** { bear, xrp } — $BEAR on the trust line and spendable-ish XRP (drops → XRP). */
export function holdings(wallet) {
  return live(`ledger:holdings:${wallet}`, async () => {
    const [lines, info] = await Promise.all([
      market(`/xrpl/account/${wallet}/lines?peer=${BEAR.issuer}`),
      market(`/xrpl/account/${wallet}/info`).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    ]);
    const line = (lines.data?.lines || []).find((l) => BEAR_CURRENCIES.has(l.currency));
    const drops = Number(info?.data?.account_data?.Balance);
    return {
      bear: line ? Math.max(0, Number(line.balance) || 0) : 0,
      hasTrustline: !!line,
      xrp: Number.isFinite(drops) ? drops / 1e6 : null,
    };
  }, { every: 60_000 });
}

/** Every NFT the wallet holds (paginated), grouped later by the caller. */
export async function accountNfts(wallet, { max = 2000 } = {}) {
  const out = [];
  let marker;
  for (let i = 0; i < 12 && out.length < max; i++) {
    const res = await market(`/xrpl/account/${wallet}/nfts${marker ? `?marker=${encodeURIComponent(marker)}` : ''}`);
    out.push(...(res.data?.account_nfts || []));
    marker = res.data?.marker;
    if (!marker) break;
  }
  return out;
}

/**
 * BEAR NFTs only: { all, pixel, ultra }. Counted the way the BEARdrops snapshot
 * counts them (backend/daily-airdrop-snapshot.js): taxon 0 is an Ultra Rare,
 * every other BEAR taxon is a Pixel BEAR.
 */
export function bearNfts(wallet) {
  return live(`ledger:bearnfts:${wallet}`, async () => {
    const all = (await accountNfts(wallet)).filter((n) => n.Issuer === BEAR.nftIssuer);
    return {
      all,
      ultra: all.filter((n) => n.NFTokenTaxon === 0).length,
      pixel: all.filter((n) => n.NFTokenTaxon !== 0).length,
    };
  }, { every: 5 * 60_000 });
}

/** The wallet's share of the BEAR/XRP pool: { lp, share, bear, xrp } or null. */
export function lpPosition(wallet) {
  return live(`ledger:lp:${wallet}`, async () => {
    const amm = await market(`/xrpl/amm_info?amm_account=${BEAR.amm}`);
    const pool = amm.data?.amm;
    if (!pool) return null;
    const lpCurrency = pool.lp_token?.currency;
    const lines = await market(`/xrpl/account/${wallet}/lines?peer=${BEAR.amm}`);
    const line = (lines.data?.lines || []).find((l) => l.currency === lpCurrency);
    const lp = line ? Number(line.balance) : 0;
    const total = Number(pool.lp_token?.value) || 0;
    const share = total ? lp / total : 0;
    const side = (a) => (typeof a === 'string' ? Number(a) / 1e6 : Number(a?.value));
    const xrpSide = typeof pool.amount === 'string' ? pool.amount : pool.amount2;
    const bearSide = typeof pool.amount === 'string' ? pool.amount2 : pool.amount;
    return { lp, share, xrp: side(xrpSide) * share, bear: side(bearSide) * share };
  }, { every: 5 * 60_000 });
}

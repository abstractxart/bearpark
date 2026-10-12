// The Shop's data: cosmetics, store tokens and NFTs, merch, and what you own.
// Every read is a shared live() feed, so a tab you come back to paints at once
// and nothing is fetched twice. Writes live with the tab that makes them.

import { api, market, live } from '../../core/api.js';
import { points, equipped } from '../../core/data.js';

// The server lowercases the signed-in wallet on every write it does for you,
// but rows written before the signed session kept the address as signed. Until
// the server reads both, a wallet with capitals asks for both spellings.
const spellings = (w) => (w.toLowerCase() === w ? [w] : [w, w.toLowerCase()]);

async function bothSpellings(w, path, pick) {
  const [first, ...rest] = await Promise.allSettled(spellings(w).map((x) => api(path(x))));
  if (first.status === 'rejected') throw first.reason;
  return [first.value, ...rest.filter((r) => r.status === 'fulfilled').map((r) => r.value)].flatMap(pick);
}

// ---------------------------------------------------------------------------
// Cosmetics

/** Every ring and banner: [{ id, cosmetic_type, name, description, image_url, css_gradient, honey_cost, rarity, is_animated, ring_type }] */
export const catalog = live('shop:catalog', async () => (await api('/cosmetics/catalog')).items || [], { every: 10 * 60_000 });

/** What the wallet owns: Map-able rows [{ cosmetic_id, purchased_at, cosmetic }]. */
export const owned = (w) => live(`shop:owned:${w}`, async () => {
  const rows = await bothSpellings(w, (x) => `/cosmetics/inventory/${x}`, (r) => r.items || []);
  const byId = new Map();
  for (const r of rows) if (!byId.has(r.cosmetic_id)) byId.set(r.cosmetic_id, r);
  return [...byId.values()];
}, { every: 5 * 60_000 });

export const RARITY = {
  common: { label: 'Common', chip: '' },
  rare: { label: 'Rare', chip: 'purple' },
  epic: { label: 'Epic', chip: 'purple' },
  legendary: { label: 'Legendary', chip: 'gold' },
  bearableguy123: { label: 'Bearableguy123', short: 'BG123', chip: 'red' },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'bearableguy123'];
export const rarityOf = (item) => RARITY[item?.rarity] || { label: item?.rarity || 'Item', chip: '' };

/** The playful line the old store shouted on an unlock, kept as a toast eyebrow. */
export const UNLOCK = {
  common: 'UNLOCKED', rare: 'RARE UNLOCK', epic: 'EPIC UNLOCK', legendary: 'LEGENDARY', bearableguy123: 'BEARABLEGUY123',
};

// ---------------------------------------------------------------------------
// Honey

/** The balance as the shared feed knows it, or null while unknown. */
export function honeyOf(w) {
  const v = points(w).get().value;
  const n = Number(v?.total_points);
  return v && Number.isFinite(n) ? n : null;
}

/** After honey was spent: show the server's new balance now, then re-read everything it touches. */
export function spent(w, newBalance) {
  const feed = points(w);
  const v = feed.get().value;
  if (v && Number.isFinite(Number(newBalance))) feed.set({ ...v, total_points: Number(newBalance) });
  feed.refresh();
  equipped(w).refresh();
}

// ---------------------------------------------------------------------------
// Tokens (FARM, SPIFFY)

/** [{ id, name, currency, amount, honeyCost, logo, issuer }] */
export const tokens = live('shop:tokens', async () => (await api('/store/tokens')).tokens || [], { every: 30 * 60_000 });

export function currencyHex(code) {
  if (!code || code.length <= 3) return code;
  return [...code].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('').padEnd(40, '0');
}

/** { has, balance } for one store token, read through BEAR Swap's XRPL proxy (the server's check as a fallback). */
export function trustLine(w, token) {
  return live(`shop:tl:${w}:${token.id}`, async () => {
    const want = new Set([token.currency, currencyHex(token.currency)]);
    try {
      let marker;
      for (let page = 0; page < 6; page++) {
        const res = await market(`/xrpl/account/${w}/lines?peer=${token.issuer}${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`);
        const line = (res.data?.lines || []).find((l) => want.has(l.currency));
        if (line) return { has: true, balance: Math.max(0, Number(line.balance) || 0) };
        marker = res.data?.marker;
        if (!marker) break;
      }
      return { has: false, balance: 0 };
    } catch (err) {
      if (err.status === 404 || /actNotFound|not found/i.test(err.message)) return { has: false, balance: 0 };
      const res = await api(`/store/check-trustline/${w}/${token.id}`, { timeout: 30_000 });
      return { has: !!res.hasTrustline, balance: null };
    }
  }, { every: 0, warm: false });
}

// ---------------------------------------------------------------------------
// NFTs (Pixel BEARs for honey)

/** { nfts: [{ nftTokenId, name, uri, rawUri, imageUrl, honeyCost }], honeyCost } */
export const storeNfts = live('shop:nfts', async () => {
  const res = await api('/store/nfts', { timeout: 45_000 });
  return { nfts: res.nfts || [], honeyCost: Number(res.honeyCost) || 10_000 };
}, { every: 10 * 60_000 }); // the server walks the ledger and IPFS for every call: read it rarely

/** The wallet's NFT requests, newest first. */
export const nftRequests = (w) => live(`shop:nftreq:${w}`, async () => {
  const rows = await bothSpellings(w, (x) => `/store/nft-requests/${x}`, (r) => r.requests || []);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...byId.values()].sort((a, b) => Date.parse(b.requested_at || 0) - Date.parse(a.requested_at || 0));
}, { every: 2 * 60_000 });

// ---------------------------------------------------------------------------
// Merch

export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL'];

/** [{ id, name, description, price_usd, sizes: { S: 4, '2XL': 5 }, images }] */
export const merchProducts = live('shop:merch', async () => ((await api('/merch/products')).products || []).map((p) => ({
  ...p,
  price_usd: Number(p.price_usd ?? p.price) || 0,
  sizes: p.sizes || {},
  images: (p.images || []).filter(Boolean),
})), { every: 5 * 60_000 });

export const stockOf = (product, size) => Math.max(0, Number(product?.sizes?.[size]) || 0);
export const totalStock = (product) => Object.values(product?.sizes || {}).reduce((a, n) => a + Math.max(0, Number(n) || 0), 0);
export const sizesOf = (product) => Object.keys(product?.sizes || {})
  .sort((a, b) => (SIZE_ORDER.indexOf(a) + 99) % 99 - (SIZE_ORDER.indexOf(b) + 99) % 99);

/** Your merch orders: [{ id, order_number, product_id, product_name, product_image, size, amount_usd, status, created_at, tracking_number }] */
export const myOrders = (w) => live(`shop:orders:${w}`, async () => (await api(`/merch/orders/my-orders?wallet=${encodeURIComponent(w)}`)).orders || [], { every: 2 * 60_000 });

export const ORDER_STATUS = {
  pending: { label: 'Awaiting payment', chip: '' },
  paid: { label: 'Paid', chip: 'green' },
  processing: { label: 'Processing', chip: 'purple' },
  shipped: { label: 'Shipped', chip: 'green' },
  delivered: { label: 'Delivered', chip: 'green' },
  cancelled: { label: 'Cancelled', chip: 'red' },
  failed: { label: 'Failed', chip: 'red' },
  refunded: { label: 'Refunded', chip: 'red' },
};
export const PAID = new Set(['paid', 'processing', 'shipped', 'delivered']);

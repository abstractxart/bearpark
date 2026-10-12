// The merch cart, kept in localStorage under `merchCart` (the old site's key,
// so a cart started there is still here). Lines are { productId, name, size,
// price, image, quantity } — product facts only, never anything about you.

const KEY = 'merchCart';
const subs = new Set();

const valid = (l) => l && typeof l.productId === 'string' && typeof l.size === 'string' && Number.isFinite(Number(l.quantity)) && Number(l.quantity) > 0;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(valid).map((l) => ({ ...l, quantity: Math.floor(Number(l.quantity)) })) : [];
  } catch {
    return [];
  }
}

let lines = read();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private mode: the cart lives for this visit */ }
  for (const fn of subs) { try { fn(lines); } catch (e) { console.error(e); } }
}

addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  lines = read();
  for (const fn of subs) { try { fn(lines); } catch (err) { console.error(err); } }
});

/** The stock key a cart size maps to: the old site showed the server's 2XL as XXL. */
export function sizeKey(product, size) {
  const sizes = product?.sizes || {};
  if (size in sizes) return size;
  if (size === 'XXL' && '2XL' in sizes) return '2XL';
  if (size === '2XL' && 'XXL' in sizes) return 'XXL';
  return size;
}

const same = (a, productId, size) => a.productId === productId && a.size === size;

export const cart = {
  lines: () => lines,
  count: () => lines.reduce((n, l) => n + l.quantity, 0),
  qty: (productId, size) => lines.find((l) => same(l, productId, size))?.quantity || 0,

  /** Add `quantity`; returns false if that would pass `max` (the size's stock). */
  add(product, size, quantity = 1, max = Infinity) {
    const line = lines.find((l) => same(l, product.id, size));
    const next = (line?.quantity || 0) + quantity;
    if (next > max) return false;
    if (line) line.quantity = next;
    else lines.push({ productId: product.id, name: product.name, size, price: product.price_usd, image: product.images?.[0] || '', quantity });
    save();
    return true;
  },
  set(productId, size, quantity) {
    lines = quantity > 0
      ? lines.map((l) => (same(l, productId, size) ? { ...l, quantity } : l))
      : lines.filter((l) => !same(l, productId, size));
    save();
  },
  remove(productId, size) { cart.set(productId, size, 0); },
  /** Drop the lines an order just paid for. */
  clear(paid) {
    lines = lines.filter((l) => !paid.some((p) => same(l, p.productId, p.size)));
    save();
  },
  /** Map old size names onto the stock keys (XXL → 2XL) once the products are known. */
  normalize(products) {
    let changed = false;
    const merged = [];
    for (const l of lines) {
      const p = products.find((x) => x.id === l.productId);
      const size = p ? sizeKey(p, l.size) : l.size;
      if (size !== l.size) changed = true;
      const twin = merged.find((m) => same(m, l.productId, size));
      if (twin) { twin.quantity += l.quantity; changed = true; } else merged.push({ ...l, size });
    }
    if (changed) { lines = merged; save(); }
  },
  subscribe(fn, signal) {
    subs.add(fn);
    fn(lines);
    signal?.addEventListener('abort', () => subs.delete(fn), { once: true });
  },
};

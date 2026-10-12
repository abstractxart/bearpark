// Merch: real BEAR clothing, paid in XRP or RLUSD with Xaman. The wall shows
// each piece big; a tap opens it (every photo, every size and its stock); the
// cart lives in localStorage; checkout is its own sheet (checkout.js); and
// "Your orders" keeps every receipt — with a way to finish paying a saved one.

import { h, icon, fill } from '../../core/dom.js';
import { dialog, errorLine, statement, pane, skRows, empty, copyButton } from '../../core/ui.js';
import { leaf, rise } from '../../core/motion.js';
import { bearFeed } from '../../core/market.js';
import { num, usd, plural } from '../../core/format.js';
import { merchProducts, myOrders, stockOf, totalStock, sizesOf, ORDER_STATUS } from './feeds.js';
import { cart, sizeKey } from './cart.js';
import { openCheckout } from './checkout.js';
import { productImg, facts } from './looks.js';

const xrpOf = (dollars) => { const r = Number(bearFeed.get().value?.xrpUsd); return Number.isFinite(r) && r > 0 ? dollars / r : null; };
const xrpLine = (dollars) => { const x = xrpOf(dollars); return x != null ? `≈ ${num(x, x >= 100 ? 0 : 1)} XRP` : 'or XRP at the live rate'; };
const day = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

export function merchPanel({ wallet, signal }) {
  let products = null;
  const wall = h('div.shop-merch-wall', [0, 1, 2].map((i) => h('div.shop-merch.shop-merch--sk', { 'aria-hidden': 'true' },
    h('span.shop-merch__art', h('span.sk.sk--block', { style: { '--h': '100%', borderRadius: '0', '--d': `${i * 90}ms` } })),
    h('span.shop-merch__body', h('span.sk.sk--line', { style: { '--w': '62%' } }), h('span.sk.sk--figure', { style: { fontSize: '28px', '--w': '2.6em' } })))));

  // ── the cart button ──
  const badge = h('span.shop-cart__n.num', { hidden: true });
  const cartBtn = h('button.btn.btn--sm.shop-cart', { type: 'button', onclick: () => openCart(cartBtn) }, icon('cart'), 'Cart', badge);
  cart.subscribe(() => {
    const n = cart.count();
    badge.hidden = !n;
    badge.textContent = n > 99 ? '99+' : String(n);
    cartBtn.setAttribute('aria-label', n ? `Cart, ${plural(n, 'item')}` : 'Cart, empty');
  }, signal);

  const ordersHead = h('div', { id: 'shop-orders' });
  const toOrders = () => ordersHead.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let sig = '';
  merchProducts.subscribe((s) => {
    if (s.value) {
      const next = JSON.stringify(s.value);
      if (products && next === sig) return;
      sig = next;
      const first = !products;
      products = s.value;
      cart.normalize(products);
      paint(first);
    } else if (s.error && !products) {
      fill(wall, h('div.shop-span', errorLine(s.error.message || 'The merch could not load. It retries on its own.')));
    }
  }, signal);
  bearFeed.subscribe(() => { if (products) for (const el of wall.querySelectorAll('[data-usd]')) el.textContent = xrpLine(Number(el.dataset.usd)); }, signal);

  function paint(first) {
    if (!products.length) { fill(wall, h('div.shop-span', h('div.frost.shop-empty', empty('No merch right now', 'New drops land here first.')))); return; }
    fill(wall, products.map((p) => tile(p)));
    if (first) leaf(wall.children, { stagger: 60 });
  }

  function tile(p) {
    const left = totalStock(p);
    const open = sizesOf(p).filter((sz) => stockOf(p, sz) > 0);
    return h('button.shop-merch', { type: 'button', onclick: (e) => productSheet(p, e.currentTarget), 'aria-label': `${p.name}, ${usd(p.price_usd)}${left ? '' : ', sold out'}` },
      h('span.shop-merch__art', productImg(p.images[0], { alt: '' }),
        left === 0 ? h('span.chip.chip--red.shop-merch__chip', 'Sold out') : left < 10 ? h('span.chip.chip--gold.shop-merch__chip', `${left} left`) : null,
        p.images.length > 1 ? h('span.shop-merch__count', icon('image'), p.images.length) : null),
      h('span.shop-merch__body',
        h('span.shop-merch__name', p.name),
        h('span.shop-merch__price', h('b.num', usd(p.price_usd)), h('span.caption', { dataset: { usd: String(p.price_usd) } }, xrpLine(p.price_usd))),
        h('span.shop-merch__sizes', open.length ? open.join(' · ') : 'Every size sold')));
  }

  // ── a product, up close ──
  function productSheet(p, origin) {
    let size = null;
    let shown = 0;
    const sizes = sizesOf(p);
    const mainImg = productImg(p.images[0], { alt: p.name, eager: true });
    const main = h('div.shop-product__main', mainImg);
    const thumbs = p.images.map((src, i) => h('button.shop-product__thumb', {
      type: 'button', 'aria-label': `Photo ${i + 1} of ${p.images.length}`, 'aria-pressed': String(i === 0), onclick: () => showImg(i),
    }, productImg(src, { eager: true })));
    const choices = sizes.map((sz) => {
      const n = stockOf(p, sz);
      return h('button.choice', { type: 'button', 'aria-pressed': 'false', disabled: n === 0, 'aria-label': n ? `${sz}, ${n} left` : `${sz}, sold out`, onclick: () => pick(sz) }, sz);
    });
    const stock = h('div.shop-product__stock', totalStock(p) ? `${totalStock(p)} left across sizes` : 'Sold out in every size');
    const err = h('div.shop-dlg__err');
    const add = h('button.btn', { type: 'button', disabled: true, onclick: () => addToCart() }, 'Pick a size');
    const buy = h('button.btn.btn--gold', { type: 'button', disabled: true, onclick: () => buyNow() }, 'Buy now');
    const paras = String(p.description || '').split(/\n{2,}|\r\n\r\n/).map((t) => t.trim()).filter(Boolean);

    const d = dialog({
      eyebrow: 'BEAR MERCH', title: p.name, origin, size: 'wide',
      body: [h('div.shop-product',
        h('div.shop-product__gallery', main, thumbs.length > 1 ? h('div.shop-product__thumbs', thumbs) : null),
        h('div.shop-product__info',
          h('div.shop-product__price', h('span.num', usd(p.price_usd)), h('span.caption', `${xrpLine(p.price_usd)} · or ${usd(p.price_usd).slice(1)} RLUSD`)),
          h('div.shop-product__sizes', h('div.field-label', 'Size'), h('div.choices', { role: 'group', 'aria-label': 'Size' }, choices), stock),
          err,
          paras.length ? h('div.shop-product__desc', paras.map((t) => h('p', t))) : null,
          statement({ tone: 'info', title: 'Free US shipping', body: 'Pay in XRP or RLUSD with Xaman. Your address is encrypted and used only to ship.' })))],
      foot: [add, buy],
    });
    d.el.classList.add('shop-dlg');

    function showImg(i) {
      if (i === shown) return;
      shown = i;
      thumbs.forEach((t, k) => t.setAttribute('aria-pressed', String(k === i)));
      const next = productImg(p.images[i], { alt: p.name, eager: true });
      fill(main, next);
      rise(next, { px: 8, duration: 320 });
    }
    function pick(sz) {
      size = sz;
      choices.forEach((c, i) => c.setAttribute('aria-pressed', String(sizes[i] === sz)));
      fill(err);
      paintStock();
      add.disabled = false; buy.disabled = false;
      add.textContent = 'Add to cart';
    }
    function paintStock() {
      const n = stockOf(p, size);
      const have = cart.qty(p.id, size);
      fill(stock, h('span', `${n} left in ${size}${have ? ` · ${have} in your cart` : ''}`),
        have ? h('button.btn.btn--sm.btn--line', { type: 'button', onclick: async () => { await d.close(); openCart(cartBtn); } }, icon('cart'), 'View cart') : null);
    }
    function addToCart() {
      const max = stockOf(p, size);
      if (!cart.add(p, size, 1, max)) {
        fill(err, errorLine(`Only ${max} left in ${size}, and they’re all in your cart.`, { small: true }));
        return;
      }
      add.textContent = `Added · ${cart.qty(p.id, size)} in cart`;
      paintStock();
    }
    async function buyNow() {
      const lines = [{ product: p, size, quantity: 1 }];
      await d.close();
      openCheckout({ wallet, lines, origin: origin.isConnected ? origin : null, onOrders: toOrders });
    }
  }

  // ── the cart ──
  function openCart(origin) {
    const life = new AbortController();
    const list = h('div.shop-cart__lines');
    const sum = h('div.shop-cart__sum');
    const checkout = h('button.btn.btn--gold', { type: 'button', onclick: () => go() }, 'Check out');
    const d = dialog({
      eyebrow: 'BEAR MERCH', title: 'Your cart', origin, sheet: true,
      body: [list, sum],
      foot: [h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Keep shopping'), checkout],
      onClose: () => life.abort(),
    });
    d.el.classList.add('shop-dlg');
    let ready = [];

    function render() {
      const lines = cart.lines();
      ready = [];
      if (!lines.length) {
        fill(list, empty('Your cart is empty', 'Pick something from the merch wall.'));
        fill(sum);
        checkout.disabled = true;
        return;
      }
      fill(list, lines.map((l) => {
        const p = products?.find((x) => x.id === l.productId) || null;
        const key = p ? sizeKey(p, l.size) : l.size;
        const n = p ? stockOf(p, key) : 0;
        const take = Math.min(l.quantity, n);
        const price = p ? p.price_usd : Number(l.price) || 0;
        if (p && take > 0) ready.push({ product: p, size: key, quantity: take });
        const note = !p ? (products ? 'No longer sold' : '') : n === 0 ? `Sold out in ${key}` : l.quantity > n ? `Only ${n} left — ${n} will check out` : '';
        return h('div.shop-line',
          h('span.shop-thumb', productImg(p?.images[0] || l.image)),
          h('div.shop-line__main',
            h('div.shop-line__name', p?.name || l.name || 'Merch'),
            h('div.caption', `Size ${key} · ${usd(price)}`),
            note ? h('div.shop-line__note', note) : null),
          h('div.shop-qty',
            h('button.icon-btn', { type: 'button', 'aria-label': l.quantity > 1 ? `One less ${p?.name || l.name} in ${key}` : `Remove ${p?.name || l.name} in ${key}`, onclick: () => cart.set(l.productId, l.size, l.quantity - 1) }, icon(l.quantity > 1 ? 'minus' : 'trash')),
            h('span.num', { 'aria-label': `Quantity ${l.quantity}` }, l.quantity),
            h('button.icon-btn', { type: 'button', 'aria-label': `One more ${p?.name || l.name} in ${key}`, disabled: !p || l.quantity >= n, onclick: () => cart.set(l.productId, l.size, l.quantity + 1) }, icon('plus'))));
      }));
      const total = ready.reduce((s, r) => s + r.product.price_usd * r.quantity, 0);
      const count = ready.reduce((s, r) => s + r.quantity, 0);
      fill(sum, facts([
        ['Items', String(count)],
        ['Shipping', 'Free'],
        ['Total', h('span', usd(total), h('small.shop-sum__xrp', ` ${xrpLine(total)}`))],
      ]));
      checkout.disabled = !ready.length;
    }
    cart.subscribe(render, life.signal);

    async function go() {
      const lines = ready.slice();
      await d.close();
      openCheckout({ wallet, lines, fromCart: true, origin: cartBtn.isConnected ? cartBtn : null, onOrders: toOrders });
    }
  }

  // ── your orders ──
  const orderRows = h('div.rows', skRows(2));
  const orderCount = h('span', ' ');
  myOrders(wallet).subscribe((s) => {
    if (s.value) {
      const list = [...s.value].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
      orderCount.textContent = list.length ? plural(list.length, 'order') : '';
      fill(orderRows, list.length ? list.map((o) => orderRow(o)) : empty('No orders yet', 'Your receipts show up here after your first order.'));
    } else if (s.error && !orderRows.querySelector('.row')) {
      fill(orderRows, h('div', { style: { padding: '14px var(--pane-pad)' } }, errorLine(s.error.message || 'Your orders could not load.')));
    }
  }, signal);

  function orderRow(o) {
    const st = ORDER_STATUS[o.status] || { label: o.status || 'Pending', chip: '' };
    const p = products?.find((x) => x.id === o.product_id);
    const row = h('button.row', { type: 'button', onclick: () => receipt(o, row) },
      h('span.shop-thumb.shop-thumb--sm', productImg(p?.images[0] || o.product_image)),
      h('div.row__main',
        h('div.row__title', o.product_name || p?.name || 'Merch', o.size ? h('span.muted', ` · ${o.size}`) : null),
        h('div.row__sub', `${o.order_number || ''}${o.created_at ? ` · ${day(o.created_at)}` : ''}`)),
      h('div.shop-row__end', h('div.row__value', usd(o.amount_usd)), h(`span.chip${st.chip ? `.chip--${st.chip}` : ''}`, st.label)));
    return row;
  }

  function receipt(o, origin) {
    const st = ORDER_STATUS[o.status] || { label: o.status || 'Pending', chip: '' };
    const pending = !o.status || o.status === 'pending';
    const d = dialog({
      eyebrow: 'RECEIPT', title: o.order_number || 'Your order', origin,
      body: [
        facts([
          ['Order', h('span.cluster', { style: { '--gap': '4px', justifyContent: 'flex-end' } }, o.order_number || '—', o.order_number ? copyButton(o.order_number, 'Copy order number') : null)],
          ['Placed', day(o.created_at) || '—'],
          ['Item', o.product_name || 'Merch'],
          o.size ? ['Size', o.size] : null,
          ['Total', usd(o.amount_usd)],
          ['Status', h(`span.chip${st.chip ? `.chip--${st.chip}` : ''}`, st.label)],
          o.tracking_number ? ['Tracking', h('span.cluster', { style: { '--gap': '4px', justifyContent: 'flex-end' } }, o.tracking_number, copyButton(o.tracking_number, 'Copy tracking number'))] : null,
        ]),
        pending ? statement({ title: 'Not paid yet', body: 'This order is saved but we haven’t seen its payment. If you already paid, it updates by itself; if not, finish paying here.' }) : null,
        h('p.shop-support', 'Questions about an order? @APEX_589 on X · cryptoapex on Discord.')],
      foot: pending
        ? [h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Close'),
          h('button.btn.btn--gold', { type: 'button', onclick: async () => { await d.close(); openCheckout({ wallet, order: o, origin: origin.isConnected ? origin : null, onOrders: toOrders }); } }, 'Finish payment')]
        : [h('button.btn.btn--gold', { type: 'button', onclick: () => d.close() }, 'Done')],
    });
    d.el.classList.add('shop-dlg');
  }

  return h('div.shop-panel',
    h('div.shop-bar',
      h('div.shop-bar__note', icon('box'), 'Free US shipping · pay in XRP or RLUSD'),
      h('div.cluster', { style: { '--gap': '6px' } }, h('button.btn.btn--sm.btn--text', { type: 'button', onclick: toOrders }, 'Your orders'), cartBtn)),
    wall,
    h('div.section', ordersHead, pane({ title: 'Your orders', aside: orderCount, body: [orderRows] })));
}

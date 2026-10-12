// Merch checkout: one Metro sheet that turns through its steps —
//   before you buy → shipping → review → pay (XRP or RLUSD) → Xaman → placed.
// The shipping address is personal data: it lives in this sheet's closure
// only, goes to the server once (which encrypts it), and is never logged,
// put in a URL, or written to storage. Closing the sheet forgets it.

import { h, icon, fill } from '../../core/dom.js';
import { dialog, errorLine, statement, toast, copyButton } from '../../core/ui.js';
import { EASE, skip, rise } from '../../core/motion.js';
import { api, post } from '../../core/api.js';
import { bearFeed, LINKS } from '../../core/market.js';
import { num, usd, clock } from '../../core/format.js';
import { PAID, myOrders, merchProducts } from './feeds.js';
import { cart } from './cart.js';
import { facts, productImg } from './looks.js';
import { celebrate } from '../../core/fun.js';

const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];
const STATE_NAME = Object.fromEntries(STATES);
const STEPS = ['Notice', 'Shipping', 'Review', 'Pay'];
const STEP_OF = { notice: 0, ship: 1, review: 2, pay: 3, wait: 3, done: 4 };
const FAILED = new Set(['failed', 'cancelled', 'expired', 'refunded']);
const POLL_MS = 5000;
const WAIT_MS = 10 * 60_000;

const two = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const isTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
const dots = () => h('div.dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i'));
const xrpRate = () => { const r = Number(bearFeed.get().value?.xrpUsd); return Number.isFinite(r) && r > 0 ? r : null; };

/** Wait between polls, but look again at once when the tab comes back (Xaman had the screen). */
function pause(ms, signal) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); document.removeEventListener('visibilitychange', wake); resolve(); };
    const wake = () => { if (!document.hidden) done(); };
    const t = setTimeout(done, ms);
    document.addEventListener('visibilitychange', wake);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * openCheckout({ wallet, lines: [{ product, size, quantity }], fromCart, origin, onOrders })
 * openCheckout({ wallet, order, origin, onOrders }) — pay for an order saved earlier.
 */
export function openCheckout({ wallet, lines = [], fromCart = false, order: saved = null, origin = null, onOrders = null }) {
  const flow = new AbortController();
  const total = saved ? Number(saved.amount_usd) || 0 : lines.reduce((s, l) => s + l.product.price_usd * l.quantity, 0);
  const count = saved ? null : lines.reduce((n, l) => n + l.quantity, 0);
  const ship = { name: '', street: '', apt: '', city: '', state: '', zip: '' };
  let order = saved ? { order_id: saved.id, order_number: saved.order_number } : null;
  let method = 'XRP';
  let placed = false;
  let current = null;
  let payWatch = null;
  let ticker = 0;
  const views = {};

  const stepEls = STEPS.map((label, i) => h('li', h('span.num', i + 1), h('span.shop-steps__label', label)));
  const steps = h('ol.shop-steps', { 'aria-label': 'Checkout steps' }, stepEls);
  const stage = h('div.shop-stage');
  const d = dialog({
    // An empty foot up front: setFoot() on a dialog opened without one adds a new foot each call.
    label: 'Checkout', origin, sheet: true, body: [steps, stage], foot: [],
    onClose: () => {
      flow.abort();
      if (order && !placed) {
        myOrders(wallet).refresh();
        toast({ eyebrow: 'ORDER SAVED', title: order.order_number || 'Your order', body: 'Finish paying any time from Your orders.' });
      }
    },
  });
  d.el.classList.add('shop-sheet');

  function setStep(name) {
    const at = STEP_OF[name];
    stepEls.forEach((li, i) => {
      li.classList.toggle('is-done', i < at || (!!saved && i < 3));
      if (i === at) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    steps.hidden = name === 'done';
  }

  function go(name, { back = false, fresh = false, args } = {}) {
    if (fresh || !views[name]) views[name] = BUILD[name](args);
    const view = views[name];
    setStep(name);
    d.setFoot(view.foot);
    const old = current;
    current = view.el;
    if (old === view.el) return;
    view.el.inert = false;
    view.el.getAnimations?.().forEach((a) => a.cancel());
    stage.append(view.el);
    if (old) {
      old.inert = true;
      if (skip()) old.remove();
      else {
        old.style.transformOrigin = back ? 'right center' : 'left center';
        old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `perspective(1200px) rotateY(${back ? -60 : 60}deg) translateX(${back ? 20 : -20}px)` }],
          { duration: 220, easing: EASE.accel, fill: 'forwards' }).finished.then(() => { if (current !== old) old.remove(); }, () => {});
        view.el.style.transformOrigin = back ? 'left center' : 'right center';
        view.el.animate([{ opacity: 0, transform: `perspective(1200px) rotateY(${back ? 50 : -50}deg)` }, { opacity: 1, transform: 'none' }],
          { duration: 400, delay: 120, easing: EASE.hingeIn, fill: 'backwards' });
      }
    }
    d.body.scrollTo?.({ top: 0 });
    const target = view.el.querySelector('[autofocus]') || [view.foot].flat().find((n) => n?.autofocus);
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }

  const head = (eyebrow, title, lede) => [h('div.eyebrow.eyebrow--sm', eyebrow), h('h2.shop-step__title', title), lede ? h('p.body.shop-step__lede', lede) : null];
  const line = (cls, on, text, extra = {}) => h(`button.btn${cls}`, { type: 'button', onclick: on, ...extra }, text);
  const itemsLabel = () => (count != null ? `${count} ${count === 1 ? 'item' : 'items'} · ${usd(total)}` : usd(total));

  const BUILD = {
    // ── 1. before you buy ──
    notice() {
      return {
        el: h('div.shop-step',
          head('BEFORE YOU BUY', 'Where should it go?', 'Merch ships to a real address, so the next step asks for yours. Here’s how it’s handled:'),
          h('ul.shop-ticks', ['Encrypted the moment it reaches us', 'Used only to ship this order', 'Never sold or shared', 'Deleted on request, any time']
            .map((t) => h('li', icon('check'), t))),
          statement({ tone: 'info', title: 'US only for now', body: 'We ship to the United States, free. More countries are coming.' }),
          h('div.shop-step__sum', itemsLabel())),
        foot: [line('.btn--line', () => d.close(), 'Not now'), line('.btn--gold', () => go('ship'), 'Continue', { autofocus: true })],
      };
    },

    // ── 2. shipping ──
    ship() {
      const uid = Math.random().toString(36).slice(2, 7);
      const formId = `ship-${uid}`;
      const fields = {};
      const field = (key, label, input, { optional = false } = {}) => {
        const id = `${formId}-${key}`;
        const err = h('div.shop-field__err', { id: `${id}-err` });
        input.id = id;
        input.name = key;
        input.addEventListener('input', () => { if (input.getAttribute('aria-invalid')) { input.removeAttribute('aria-invalid'); fill(err); } });
        fields[key] = { input, err };
        return h('div.shop-field',
          h('label.field-label', { for: id }, label, optional ? h('span.shop-field__opt', ' · optional') : null),
          h('div.field', input), err);
      };
      const text = (key, autocomplete, extra = {}) => h('input', { type: 'text', autocomplete, value: ship[key], maxLength: 100, spellcheck: false, ...extra });
      const state = h('select', { autocomplete: 'address-level1', required: true },
        h('option', { value: '' }, 'Choose a state'), STATES.map(([code, name]) => h('option', { value: code, selected: ship.state === code }, name)));
      const zip = text('zip', 'postal-code', { inputmode: 'numeric', maxLength: 10, placeholder: '12345', required: true });

      const form = h('form.shop-form', { id: formId, novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
        field('name', 'Full name', text('name', 'name', { required: true, autofocus: true })),
        field('street', 'Street address', text('street', 'address-line1', { required: true })),
        field('apt', 'Apartment, suite, unit', text('apt', 'address-line2'), { optional: true }),
        h('div.shop-form__row', field('city', 'City', text('city', 'address-level2', { required: true })), field('state', 'State', state)),
        h('div.shop-form__row', field('zip', 'ZIP code', zip),
          h('div.shop-field', h('span.field-label', 'Country'), h('div.field.shop-field--fixed', h('span', 'United States')))));

      const rules = {
        name: (v) => (v.length >= 2 ? '' : 'Enter your full name.'),
        street: (v) => (v.length >= 3 ? '' : 'Enter your street address.'),
        apt: () => '',
        city: (v) => (v.length >= 2 ? '' : 'Enter your city.'),
        state: (v) => (STATE_NAME[v] ? '' : 'Choose your state.'),
        zip: (v) => (/^\d{5}(-\d{4})?$/.test(v) ? '' : 'Enter a 5-digit ZIP code, like 33101.'),
      };
      function submit() {
        let first = null;
        for (const [key, { input, err }] of Object.entries(fields)) {
          const value = input.value.trim().replace(/\s+/g, ' ');
          const problem = rules[key](value);
          if (problem) {
            input.setAttribute('aria-invalid', 'true');
            input.setAttribute('aria-describedby', err.id);
            fill(err, errorLine(problem, { small: true }));
            first ||= input;
          } else {
            input.removeAttribute('aria-invalid');
            fill(err);
            ship[key] = value;
          }
        }
        if (first) { first.focus(); return; }
        go('review', { fresh: true });
      }
      return {
        el: h('div.shop-step', head('SHIPPING', 'Your address', 'Where your merch should land. Shipping is free.'), form),
        foot: [line('.btn--line', () => go('notice', { back: true }), 'Back'), h('button.btn.btn--gold', { type: 'submit', form: formId }, 'Review order')],
      };
    },

    // ── 3. review ──
    review() {
      return {
        el: h('div.shop-step',
          head('REVIEW', 'Check it over'),
          h('div.shop-ship-to',
            h('div', h('div.caption', 'Shipping to'),
              h('address.shop-address', ship.name, h('br'), ship.street, ship.apt ? `, ${ship.apt}` : '', h('br'),
                `${ship.city}, ${STATE_NAME[ship.state] || ship.state} ${ship.zip}`, h('br'), 'United States')),
            line('.btn--text', () => go('ship', { back: true }), 'Edit')),
          h('div.shop-lines', lines.map((l) => h('div.shop-line',
            h('span.shop-thumb', productImg(l.product.images[0])),
            h('div.shop-line__main', h('div.shop-line__name', l.product.name), h('div.caption', `Size ${l.size} · ${l.quantity} × ${usd(l.product.price_usd)}`)),
            h('b.num', usd(l.product.price_usd * l.quantity))))),
          facts([['Shipping', 'Free'], ['Total', usd(total)]]),
          statement({ title: 'One thing', body: 'Once your order is created its address can’t change — make sure it’s right.' })),
        foot: [line('.btn--line', () => go('ship', { back: true }), 'Back'), line('.btn--gold', () => go('pay'), 'Choose payment', { autofocus: true })],
      };
    },

    // ── 4. pay: XRP at the live rate, or RLUSD exactly ──
    pay() {
      payWatch?.abort();
      payWatch = new AbortController();
      flow.signal.addEventListener('abort', () => payWatch.abort(), { once: true });
      const group = `pay-${Math.random().toString(36).slice(2, 7)}`;
      const err = h('div.shop-dlg__err');
      const saving = h('div.shop-step__sum');
      const xrpFig = h('b.num', '—');
      const xrpSub = h('span.caption', ' ');
      const radio = (value, title, fig, sub) => {
        const input = h('input', { type: 'radio', name: group, value, checked: method === value, onchange: () => { method = value; paint(); } });
        return { input, el: h('label.shop-pay', input, h('span.shop-pay__body', h('span.shop-pay__title', title), h('span.shop-pay__fig', fig), sub)) };
      };
      const xrp = radio('XRP', 'XRP', [xrpFig, ' XRP'], xrpSub);
      const rlusd = radio('RLUSD', 'RLUSD', [h('b.num', two(total)), ' RLUSD'], h('span.caption', 'A dollar stablecoin — the exact price, no rate.'));
      const back = line('.btn--line', () => go('review', { back: true }), 'Back');
      const payBtn = line('.btn--gold', () => pay(), 'Pay', { autofocus: true });

      function paint() {
        const rate = xrpRate();
        xrpFig.textContent = rate ? `≈ ${num(total / rate, 2)}` : '—';
        xrpSub.textContent = rate ? `1 XRP = ${usd(rate)} · BEAR Swap’s live rate` : 'The XRP rate isn’t available right now.';
        xrp.input.disabled = !rate;
        xrp.el.classList.toggle('is-off', !rate);
        if (!rate && method === 'XRP') { method = 'RLUSD'; rlusd.input.checked = true; }
        payBtn.textContent = method === 'XRP' ? (rate ? `Pay ≈ ${num(total / rate, 2)} XRP` : 'Pay') : `Pay ${two(total)} RLUSD`;
        back.hidden = !!order;
        saving.textContent = order ? `Order ${order.order_number} is saved — your address is locked in.` : `Total ${usd(total)}`;
      }
      bearFeed.subscribe(() => { if (!payBtn.disabled) paint(); }, payWatch.signal);

      async function pay() {
        payBtn.disabled = true; back.disabled = true;
        fill(err);
        const was = payBtn.textContent;
        payBtn.textContent = order ? 'Getting payment details' : 'Creating your order';
        try {
          const rate = xrpRate();
          if (method === 'XRP' && !rate) throw new Error('The XRP rate isn’t available right now. Pay in RLUSD, or try again in a moment.');
          if (!order) {
            order = await post('/merch/orders', {
              wallet_address: wallet,
              items: lines.map((l) => ({ product_id: l.product.id, name: l.product.name, size: l.size, quantity: l.quantity, price: l.product.price_usd, image: l.product.images[0] || '' })),
              items_summary: lines.map((l) => `${l.quantity}x ${l.product.name} (${l.size})`).join(' | '),
              total_amount: total,
              product_id: lines[0].product.id,
              size: lines[0].size,
              payment_method: method,
              shipping: { ...ship, country: 'US' },
            }, { signal: flow.signal, timeout: 20_000 });
            myOrders(wallet).refresh();
            merchProducts.refresh();
          }
          const res = await post('/merch/request-payment', { order_id: order.order_id, payment_method: method, amount_usd: total, xrp_price: rate }, { signal: flow.signal, timeout: 30_000 });
          go('wait', { fresh: true, args: res });
        } catch (e) {
          if (flow.signal.aborted) return;
          payBtn.disabled = false; back.disabled = false; payBtn.textContent = was;
          paint();
          fill(err, errorLine(e.message || 'The payment could not be set up. Try again.'));
        }
      }

      paint();
      return {
        el: h('div.shop-step',
          head('PAYMENT', 'How do you want to pay?', 'You’ll approve it in Xaman. XRP is converted at the moment you pay; RLUSD is the exact dollar price.'),
          h('div.shop-pays', { role: 'radiogroup', 'aria-label': 'Payment currency' }, xrp.el, rlusd.el),
          saving, err),
        foot: [back, payBtn],
      };
    },

    // ── 5. Xaman + the payment details, and the wait ──
    wait(res) {
      const watch = new AbortController();
      flow.signal.addEventListener('abort', () => watch.abort(), { once: true });
      const payload = res.xumm_payload || null;
      const qr = payload?.qr_png || payload?.refs?.qr_png || null;
      const deep = payload?.next_url || payload?.next?.always || null;
      const text = h('div.si-status__text', { role: 'status', 'aria-live': 'polite' }, 'Waiting for your payment');
      const sub = h('div.si-status__sub', ' ');
      const statusBox = h('div.si-status', dots(), text, sub);
      const after = h('div.shop-wait-actions');
      const change = line('.btn--line', () => { watch.abort(); go('pay', { back: true, fresh: true }); }, 'Change payment');
      const open = deep && isTouch() ? h('a.btn.btn--gold', { href: deep, target: '_blank', rel: 'noopener' }, 'Open Xaman') : null;
      const amountText = `${res.amount} ${res.currency}`;

      const detail = (label, value, copy, extra = null) => h('div.shop-detail',
        h('div.shop-detail__main', h('span.caption', label, extra), h('code.shop-detail__value', value)),
        copy ? copyButton(copy, `Copy ${label.toLowerCase()}`) : null);

      const el = h('div.shop-step',
        head(qr ? 'PAY IN XAMAN' : 'SEND THE PAYMENT', qr ? 'Scan to pay' : 'Send the payment',
          qr ? (isTouch() ? 'Open Xaman and approve the payment — or scan from another device.' : 'Scan with Xaman and approve. Or send it from any wallet with the details below.')
            : 'Send it from any wallet. The destination tag is required — it’s how we match your payment to your order.'),
        qr ? h('div.si-qr.shop-qr', h('img', { src: qr, alt: `Xaman QR code to pay ${amountText}`, width: 232, height: 232 })) : null,
        h('div.shop-details',
          detail('Amount', amountText, String(res.amount)),
          detail('To', res.destination_address, res.destination_address),
          detail('Destination tag', String(res.destination_tag), String(res.destination_tag), h('span.chip.chip--gold.shop-detail__req', 'Required')),
          res.issuer ? detail('RLUSD issuer', res.issuer, res.issuer) : null,
          detail('Order', res.order_number || order.order_number, null)),
        statusBox, after);
      if (qr) rise(el.querySelector('.shop-qr'), { px: 12, duration: 460 });

      // The countdown is text only; the poll is every 5 s for up to 10 minutes.
      let until = Date.now() + WAIT_MS;
      const tick = (id) => {
        if (watch.signal.aborted || id !== ticker) return;
        sub.textContent = `Checking every 5 seconds · ${clock(until - Date.now())} left`;
        if (until > Date.now()) setTimeout(() => tick(id), 1000 - (Date.now() % 1000));
      };

      async function poll() {
        until = Date.now() + WAIT_MS;
        fill(after);
        statusBox.querySelector('.dots').hidden = false;
        text.textContent = 'Waiting for your payment';
        tick(++ticker);
        while (!watch.signal.aborted && Date.now() < until) {
          await pause(POLL_MS, watch.signal);
          if (watch.signal.aborted) return;
          let s = null;
          try { s = await api(`/merch/orders/${order.order_id}/status`, { signal: watch.signal, timeout: 15_000 }); } catch { /* a passing error: keep watching */ }
          if (watch.signal.aborted) return;
          if (s && PAID.has(s.status)) { watch.abort(); go('done', { fresh: true, args: { res, txHash: s.tx_hash } }); return; }
          if (s && FAILED.has(s.status)) {
            watch.abort();
            fill(statusBox, errorLine('The payment didn’t go through. Try again, or pick the other currency.'));
            fill(after, line('.btn--gold', () => go('pay', { back: true, fresh: true }), 'Try again'));
            return;
          }
        }
        if (watch.signal.aborted) return;
        statusBox.querySelector('.dots').hidden = true;
        text.textContent = 'No payment seen yet';
        sub.textContent = 'If you paid, it’s processed automatically';
        fill(after,
          statement({ title: 'Your order is saved', body: 'If you sent the payment, we match it by its destination tag and your order moves on by itself. You can check it under Your orders.' }),
          h('div.cluster', line('.btn--sm', () => poll(), 'Keep waiting'), onOrders ? line('.btn--sm.btn--line', () => { d.close(); onOrders(); }, 'Your orders') : null));
      }
      poll();

      return { el, foot: open ? [change, open] : [change] };
    },

    // ── 6. placed ──
    done({ res, txHash }) {
      placed = true;
      const paid = lines.map((l) => ({ productId: l.product.id, size: l.size }));
      if (fromCart) cart.clear(paid);
      myOrders(wallet).refresh();
      merchProducts.refresh();
      toast({ eyebrow: 'ORDER PLACED', title: order.order_number, body: 'Ships in 5–10 business days.' });
      setTimeout(() => celebrate({ kind: 'purchase', origin: () => d.el.querySelector('.shop-done__tick') || d.el }), 180); // once the receipt has turned in
      const when = new Date().toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      const el = h('div.shop-step.shop-done',
        h('div.shop-done__tick', icon('check')),
        head('PAID', 'Order placed', 'Thank you for backing BEAR Park. Your receipt is below and under Your orders.'),
        h('div.shop-receipt',
          h('div.shop-receipt__head', h('span.wordmark.wordmark--inline', h('span.bear', 'BEAR'), h('span.park', 'PARK')), h('span.caption', 'Merch receipt')),
          facts([
            ['Order', h('span.cluster', { style: { '--gap': '4px', justifyContent: 'flex-end' } }, order.order_number, copyButton(order.order_number, 'Copy order number'))],
            ['Placed', when],
            ...(lines.length ? lines.map((l) => [`${l.quantity} × ${l.product.name}`, `Size ${l.size}`]) : saved ? [[saved.product_name || 'Merch', saved.size ? `Size ${saved.size}` : '']] : []),
            ['Total', usd(total)],
            ['Paid with', `${res.amount} ${res.currency}`],
            txHash ? ['Transaction', h('a.shop-link', { href: LINKS.tx(txHash), target: '_blank', rel: 'noopener noreferrer' }, 'View ', icon('external'))] : null,
          ]),
          ship.name ? h('div.shop-receipt__to', h('span.caption', 'Shipping to'),
            h('address.shop-address', ship.name, h('br'), ship.street, ship.apt ? `, ${ship.apt}` : '', h('br'), `${ship.city}, ${ship.state} ${ship.zip}`)) : null),
        h('p.body.shop-step__lede', 'Ships in 5–10 business days. Questions about an order? @APEX_589 on X or cryptoapex on Discord.'));
      return {
        el,
        foot: [onOrders ? line('.btn--line', () => { d.close(); onOrders(); }, 'Your orders') : null, line('.btn--gold', () => d.close(), 'Done', { autofocus: true })].filter(Boolean),
      };
    },
  };

  go(saved ? 'pay' : 'notice');
  return d;
}

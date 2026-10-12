// Tokens: honey for real XRPL tokens (FARM, SPIFFY), sent to your wallet by
// the park's airdrop wallet. A token only lands where a trust line exists, so
// each card checks yours first and says how to set it when it's missing.

import { h, icon, fill } from '../../core/dom.js';
import { dialog, errorLine, statement, toast, external, skLine } from '../../core/ui.js';
import { leaf } from '../../core/motion.js';
import { post } from '../../core/api.js';
import { points } from '../../core/data.js';
import { LINKS } from '../../core/market.js';
import { num, short } from '../../core/format.js';
import { tokens, trustLine, currencyHex, honeyOf, spent } from './feeds.js';
import { cost, facts } from './looks.js';
import { celebrate } from '../../core/fun.js';

const swapUrl = (t) => `https://swap.bearpark.xyz/tokens/${currencyHex(t.currency)}/${t.issuer}`;

export function tokensPanel({ wallet, signal }) {
  const wall = h('div.shop-tokens', [0, 1].map(() => h('div.frost.shop-token.shop-token--sk', { 'aria-hidden': 'true' },
    h('span.sk.sk--circle', { style: { '--s': '56px' } }), skLine('40%'), h('span.sk.sk--figure', { style: { fontSize: '44px', '--w': '4em' } }), skLine('70%'))));
  let painted = false;
  tokens.subscribe((s) => {
    if (s.value && !painted) {
      painted = true;
      fill(wall, s.value.map((t) => card(t)));
      leaf(wall.children, { stagger: 70 });
    } else if (s.error && !painted) {
      fill(wall, h('div.shop-span', errorLine(s.error.message || 'The token store could not load. It retries on its own.')));
    }
  }, signal);

  function card(t) {
    const line = trustLine(wallet, t);
    const lineSlot = h('div.shop-token__line', skLine('60%'));
    const short_ = h('div.shop-item__note');
    const buy = h('button.btn.btn--block', { type: 'button', onclick: (e) => buySheet(t, e.currentTarget) }, `Buy ${num(t.amount, 0)} ${t.currency}`);
    let has = null;

    function update() {
      const honey = honeyOf(wallet);
      const gap = honey != null ? t.honeyCost - honey : 0;
      buy.disabled = has === false || gap > 0;
      short_.textContent = gap > 0 ? `${num(Math.ceil(gap), 0)} honey short` : '';
    }

    line.subscribe((s) => {
      if (s.value) {
        has = s.value.has;
        fill(lineSlot, s.value.has
          ? h('div.cluster', { style: { '--gap': '10px' } }, h('span.chip.chip--green', icon('check'), 'Trust line set'),
            s.value.balance != null ? h('span.caption', `You hold ${num(s.value.balance, 0)} ${t.currency}`) : null)
          : statement({
            title: `Set the ${t.currency} trust line first`,
            body: `Your wallet has to trust ${t.currency} before it can receive it. Add the trust line on BEAR Swap — it signs with Xaman or BEAR Wallet — then check again.`,
            children: [h('div.shop-token__fix',
              external(swapUrl(t), `Set it on BEAR Swap`, 'btn btn--sm btn--line'),
              h('button.btn.btn--sm.btn--text', { type: 'button', onclick: () => line.refresh() }, icon('refresh'), 'Check again'))],
          }));
      } else if (s.error) {
        has = null;
        fill(lineSlot, h('span.caption', 'Couldn’t check your trust line — the store will check when you buy.'));
      }
      update();
    }, signal);
    points(wallet).subscribe(update, signal);

    function buySheet(token, origin) {
      const balance = honeyOf(wallet);
      const result = h('div');
      const label = `Buy · ${num(token.honeyCost, 0)} HNY`;
      const cancel = h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Cancel');
      const go = h('button.btn.btn--gold', { type: 'button', autofocus: true, onclick: () => send() }, label);
      const d = dialog({
        eyebrow: 'TOKEN STORE', title: `${num(token.amount, 0)} ${token.currency}`, origin,
        body: [
          h('div.shop-token__hero', h('img', { src: token.logo, alt: '', width: 72, height: 72 }),
            h('p.body', `Sent from the park’s wallet to yours on the XRP Ledger, usually within a few seconds.`)),
          facts([
            ['You pay', cost(token.honeyCost, { unit: true })],
            ['You get', `${num(token.amount, 0)} ${token.currency}`],
            ['To', short(wallet, 6, 6)],
            balance != null ? ['Honey after', `${num(balance - token.honeyCost, 0)} HNY`] : null,
          ]),
          result],
        foot: [cancel, go],
      });
      d.el.classList.add('shop-dlg');

      async function send() {
        go.disabled = true; cancel.disabled = true; go.textContent = 'Sending';
        fill(result, h('div.shop-wait', h('div.dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
          h('span', { role: 'status' }, `Sending ${token.currency} on the XRP Ledger`)));
        try {
          const res = await post('/store/purchase-token', { wallet_address: wallet, token_type: token.id }, { timeout: 90_000 });
          spent(wallet, res.new_balance);
          line.refresh();
          toast({ eyebrow: 'SENT', title: `${num(res.amount ?? token.amount, 0)} ${res.currency || token.currency}`, body: 'It’s in your wallet.' });
          celebrate({ kind: 'purchase', origin: d.body.querySelector('.shop-token__hero img') || go });
          fill(result, statement({ tone: 'ok', title: 'Sent', body: `${num(res.amount ?? token.amount, 0)} ${res.currency || token.currency} is in your wallet.` }),
            res.tx_hash ? h('div.shop-dlg__links', external(LINKS.tx(res.tx_hash), 'View the transaction', 'btn btn--sm btn--line')) : null);
          d.setFoot([h('button.btn.btn--gold', { type: 'button', onclick: () => d.close() }, 'Done')]);
        } catch (e) {
          if (e.body?.pending) {
            // Sent, but not confirmed yet: the honey is held, so no retry.
            cancel.disabled = false; go.textContent = 'Sent';
            fill(result, statement({ tone: 'info', title: 'On its way', body: e.message }),
              e.body.tx_hash ? h('div.shop-dlg__links', external(LINKS.tx(e.body.tx_hash), 'View the transaction', 'btn btn--sm btn--line')) : null);
            line.refresh();
            return;
          }
          go.disabled = false; cancel.disabled = false; go.textContent = label;
          if (e.body?.needsTrustline) line.set({ has: false, balance: 0 });
          fill(result, errorLine(e.body?.needsTrustline
            ? `Your wallet doesn’t trust ${token.currency} yet. Set the trust line, then try again.`
            : e.message || 'The purchase didn’t go through.'));
        }
      }
    }

    update();
    return h('article.frost.shop-token',
      h('div.shop-token__head',
        h('img.shop-token__logo', { src: t.logo, alt: '', width: 56, height: 56, loading: 'lazy' }),
        h('div', h('div.eyebrow', t.name || t.currency),
          h('a.shop-token__issuer', { href: LINKS.bithomp(t.issuer), target: '_blank', rel: 'noopener noreferrer' }, `Issuer ${short(t.issuer)}`))),
      h('div.shop-token__fig', h('span.num', num(t.amount, 0)), h('span.stat__unit', t.currency)),
      h('div.shop-token__price', 'for ', cost(t.honeyCost, { unit: true })),
      lineSlot, buy, short_);
  }

  return h('div.shop-panel',
    wall,
    h('div.shop-foot-note', statement({ tone: 'info', title: 'How it works', body: 'Honey buys real tokens on the XRP Ledger. The park’s wallet sends them to yours the moment you buy; your honey is refunded if the send fails.' })));
}

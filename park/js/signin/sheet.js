// Sign in to BEAR Park with BEAR Wallet, BEAR Swap or Xaman.
//
// Every flow ends at the same server call shape ({ wallet, auth_token, access })
// and the same session (core/session.js). What proves the wallet is yours:
//   BEAR Wallet  the phone app signs a bearwallet://sign/<uuid> request
//   BEAR Swap    your BEAR Swap vault signs our challenge in a popup
//   Xaman        Xaman signs a SignIn payload
// Polls are bound to this tab by a poll token the server returns only to us.

import { h, icon, fill, sleep } from '../core/dom.js';
import { api, post, ApiError } from '../core/api.js';
import { session } from '../core/session.js';
import { dialog, errorLine, statement, avatar } from '../core/ui.js';
import { leaf, rise, roll, EASE, skip } from '../core/motion.js';
import { clock, num } from '../core/format.js';
import { BEAR, LINKS } from '../core/market.js';
import { qrSvg } from './qr.js';
import { walletConnectSignIn, warmWalletConnect } from './walletconnect.js';

export const LOGOS = {
  bearWallet: 'https://cdn.bearpark.xyz/app%20logos/iOS%20BEAR%20Wallet%20logo.png',
  bearSwap: 'https://cdn.bearpark.xyz/images/BEARSWAP_FINAL.webp',
};

const SWAP_ORIGIN = (() => {
  // A local BEAR Swap can stand in while developing; never in production.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try { return localStorage.getItem('bp:dev-swap-origin') || 'https://swap.bearpark.xyz'; } catch { /* fall through */ }
  }
  return 'https://swap.bearpark.xyz';
})();

const isTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
const isAndroid = () => /Android/i.test(navigator.userAgent);

/**
 * Open the sign-in sheet. `onSignedIn(session)` runs after a successful,
 * eligible sign-in; by default the visitor is taken into the park.
 */
export function openSignIn({ origin, onSignedIn = enterPark, start, popup = null } = {}) {
  const stage = h('div.si-stage');
  let flow = new AbortController();
  const d = dialog({ label: 'Sign in to BEAR Park', origin, sheet: true, body: [stage], onClose: () => flow.abort() });
  d.el.classList.add('si');

  const ctx = {
    show(view, { back = false } = {}) {
      const old = stage.firstElementChild;
      stage.append(view);
      if (old) {
        old.inert = true;
        if (skip()) old.remove();
        else {
          old.style.transformOrigin = back ? 'right center' : 'left center';
          old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `perspective(1200px) rotateY(${back ? -60 : 60}deg) translateX(${back ? 20 : -20}px)` }], { duration: 240, easing: EASE.accel, fill: 'forwards' })
            .finished.then(() => old.remove(), () => old.remove());
        }
        view.style.transformOrigin = back ? 'left center' : 'right center';
        if (!skip()) view.animate([{ opacity: 0, transform: `perspective(1200px) rotateY(${back ? 50 : -50}deg)` }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 140, easing: EASE.hingeIn, fill: 'backwards' });
      }
      view.querySelector('[autofocus]')?.focus({ preventScroll: true });
    },
    restart() { flow.abort(); flow = new AbortController(); return flow.signal; },
    get signal() { return flow.signal; },
    close: () => d.close(),
    async finish(res) {
      const s = session.begin(res);
      if (res.access && res.access.eligible === false) { ctx.show(notYetView(ctx, res)); return; }
      ctx.show(welcomeView(res));
      await sleep(skip() ? 300 : 1300);
      await d.close();
      onSignedIn(s);
    },
  };

  if (!start || start === 'walletconnect') requestIdleCallback?.(() => warmWalletConnect());
  const first = start === 'bearwallet' ? bearWalletView(ctx)
    : start === 'bearswap' ? bearSwapView(ctx, popup)
      : start === 'xaman' ? xamanView(ctx)
        : start === 'walletconnect' ? walletConnectView(ctx)
        : chooseView(ctx);
  stage.append(first);
  if (!start) requestAnimationFrame(() => leaf(first.querySelectorAll('.si-row'), { delay: 260, stagger: 60 }));
  return d;
}

export function enterPark() {
  const q = new URLSearchParams(location.search);
  const raid = q.get('raid');
  location.assign(`/main.html${raid && /^\d+$/.test(raid) ? `#/raids?raid=${raid}` : location.hash.startsWith('#/') ? location.hash : ''}`);
}

// ---------------------------------------------------------------------------

export function signInRows(ctx, { onPick } = {}) {
  const row = (cls, glyph, title, sub, on) => h(`button.si-row${cls}`, { type: 'button', onclick: on },
    glyph, h('span', h('span.si-row__title', title), h('span.si-row__sub', sub)), icon('chevron-right'));
  return h('div.si-rows',
    row('.si-row--gold', h('img.si-row__glyph', { src: LOGOS.bearWallet, alt: '' }),
      ['Sign in with ', h('span.bear', 'BEAR'), ' Wallet'], 'Scan or tap with the BEAR Wallet app',
      () => (onPick ? onPick('bearwallet') : ctx.show(bearWalletView(ctx)))),
    row('', h('span.si-row__glyph.si-row__glyph--wc', icon('link')),
      'Sign in with WalletConnect', 'BEAR Wallet, Joey and other XRPL wallets',
      () => (onPick ? onPick('walletconnect') : ctx.show(walletConnectView(ctx)))),
    row('', h('span.si-row__glyph', icon('qr')),
      'Sign in with Xaman', 'Scan with the Xaman app',
      () => (onPick ? onPick('xaman') : ctx.show(xamanView(ctx)))),
    row('', h('img.si-row__glyph', { src: LOGOS.bearSwap, alt: '' }),
      ['Sign in with ', h('span.bear', 'BEAR'), ' Swap'], 'Use a wallet saved on swap.bearpark.xyz',
      // The popup has to open inside this click, or the browser blocks it.
      () => { const pop = openSwapPopup(); onPick ? onPick('bearswap', pop) : ctx.show(bearSwapView(ctx, pop)); }));
}

function chooseView(ctx) {
  return h('div',
    h('div.si-head',
      h('div.eyebrow', 'SIGN IN TO'),
      h('h2.si-title', h('span.bear', 'BEAR'), ' PARK'),
      h('p.lede', 'Prove a wallet is yours. It’s free, and nothing is sent.')),
    signInRows(ctx),
    h('div.si-foot', icon('lock'), 'Non-custodial — BEAR Park never sees your keys.'),
    h('div.si-entry.caption', `Entry · ${num(BEAR.minEntry, 0)} $BEAR or one BEAR NFT`));
}

function back(ctx) {
  return h('button.si-back', { type: 'button', onclick: () => { ctx.restart(); ctx.show(chooseView(ctx), { back: true }); } }, icon('chevron-left'), 'Back');
}

function dotsLine() {
  return h('div.dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i'));
}

function statusBlock() {
  const text = h('div.si-status__text', { role: 'status', 'aria-live': 'polite' });
  const sub = h('div.si-status__sub');
  const dots = dotsLine();
  const el = h('div.si-status', dots, text, sub);
  return {
    el,
    set(message, { waiting = true, note = '' } = {}) {
      if (!el.contains(text)) fill(el, dots, text, sub); // back from an error
      text.textContent = message;
      sub.textContent = note;
      dots.hidden = !waiting;
    },
    error(message) {
      fill(el, errorLine(message));
    },
  };
}

/** Wait between polls, but wake at once when the tab comes back (the phone app had focus). */
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
 * Poll a sign-in status route until it resolves. `onStatus(status)` sees
 * pending/opened; resolves with the signed response, or throws ApiError with
 * `.status` 'rejected' | 'expired'.
 */
async function pollUntilSigned(path, pollToken, signal, onStatus, every = 1500) {
  while (!signal.aborted) {
    if (!document.hidden) {
      let res;
      try {
        res = await api(path, { headers: { 'X-Poll-Token': pollToken }, timeout: 15_000, signal });
      } catch (err) {
        if (signal.aborted) break;
        if (err.status === 410) throw Object.assign(new ApiError('That sign-in request expired.'), { status: 'expired' });
        if (err.status === 403 || err.status === 401) throw err;
        res = null; // a passing network error: keep polling
      }
      if (res?.status === 'signed') return res;
      if (res?.status === 'rejected') throw Object.assign(new ApiError('declined'), { status: 'rejected' });
      if (res?.status === 'expired') throw Object.assign(new ApiError('expired'), { status: 'expired' });
      if (res?.status) onStatus(res.status);
    }
    await pause(every, signal);
  }
  throw new DOMException('aborted', 'AbortError');
}

function countdown(sub, expiresAt, signal) {
  const tick = () => {
    if (signal.aborted) return;
    const left = expiresAt - Date.now();
    sub.textContent = left > 0 ? `Code expires in ${clock(left)}` : 'Code expired';
    if (left > 0) setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

// ---------------------------------------------------------------------------
// BEAR Wallet

function bearWalletView(ctx) {
  const signal = ctx.restart();
  const qrBox = h('div.si-qr', h('span.sk'));
  const status = statusBlock();
  const openBtn = h('a.btn.btn--gold.btn--block', { hidden: true }, h('img', { src: LOGOS.bearWallet, alt: '', width: 22, height: 22, style: { borderRadius: '6px' } }), 'Open BEAR Wallet');
  const retry = h('button.btn.btn--block', { type: 'button', hidden: true, onclick: () => ctx.show(bearWalletView(ctx)) }, icon('refresh'), 'New code');
  const expiry = h('div.si-status__sub');
  const view = h('div',
    back(ctx),
    h('div.si-head', h('div.eyebrow', 'BEAR WALLET'), h('h2.si-title.si-title--sm', 'Scan to sign in'),
      h('p.lede', isTouch() ? 'Open BEAR Wallet on this phone, or scan from another device.' : 'Open BEAR Wallet on your phone and scan this code.')),
    qrBox,
    status.el, expiry,
    h('div.si-actions', openBtn, retry),
    h('ol.si-steps', h('li', h('b', '1'), 'Open BEAR Wallet'), h('li', h('b', '2'), 'Scan the code'), h('li', h('b', '3'), 'Approve “Sign in”')));
  status.set('Preparing a sign-in code…');

  (async () => {
    try {
      const start = await post('/auth/bear-wallet/start', {}, { signal });
      if (signal.aborted) return;
      const svg = await qrSvg(start.deepLink, { size: 232 }).catch(() => null);
      if (signal.aborted) return;
      fill(qrBox, svg || h('div.body', { style: { color: '#000', padding: '20px', textAlign: 'center' } }, 'Use “Open BEAR Wallet”'),
        h('span.si-qr__badge', h('img', { src: LOGOS.bearWallet, alt: '' })));
      rise(qrBox, { px: 12, duration: 460 });
      if (isTouch() || isAndroid()) { openBtn.href = start.deepLink; openBtn.hidden = false; }
      status.set('Waiting for BEAR Wallet…');
      countdown(expiry, start.expiresAt, signal);
      const res = await pollUntilSigned(`/auth/bear-wallet/status/${start.id}`, start.pollToken, signal, (s) => {
        if (s === 'opened') status.set('Opened in BEAR Wallet — approve it there.');
      });
      qrBox.classList.add('si-qr--done');
      qrBox.append(h('span.si-qr__tick', icon('check')));
      status.set('Signed. Checking your $BEAR…', { waiting: true });
      await ctx.finish(res);
    } catch (err) {
      if (signal.aborted || err?.name === 'AbortError') return;
      expiry.textContent = '';
      retry.hidden = false;
      openBtn.hidden = true;
      if (qrBox.querySelector('.sk')) qrBox.hidden = true; // no code ever arrived
      if (err.status === 'rejected') status.error('You declined the sign-in in BEAR Wallet.');
      else if (err.status === 'expired') status.error('That code expired. Get a new one to try again.');
      else status.error(err.message || 'BEAR Wallet could not be reached.');
    }
  })();
  return view;
}

// ---------------------------------------------------------------------------
// BEAR Swap: a popup on swap.bearpark.xyz signs our challenge.

function openSwapPopup() {
  const w = 460;
  const hgt = 720;
  const left = Math.max(0, (screen.availWidth - w) / 2);
  const top = Math.max(0, (screen.availHeight - hgt) / 2);
  const url = `${SWAP_ORIGIN}/connect?origin=${encodeURIComponent(location.origin)}`;
  try {
    return window.open(url, 'bearswap-connect', `popup,width=${w},height=${hgt},left=${left},top=${top}`);
  } catch {
    return null;
  }
}

function bearSwapView(ctx, popup) {
  const signal = ctx.restart();
  let pop = popup;
  const status = statusBlock();
  // A BEAR Swap without the sign-in window (or one that can't load) never says
  // ready: don't leave anyone waiting on it.
  let ready = false;
  let silent = 0;
  const expectReady = () => {
    clearTimeout(silent);
    silent = setTimeout(() => {
      if (!ready && pop && !pop.closed && !signal.aborted) {
        status.error('BEAR Swap didn’t answer. Sign in with BEAR Wallet, WalletConnect or Xaman instead — or reopen it to try again.');
      }
    }, 15_000);
  };
  const reopen = h('button.btn.btn--block', { type: 'button', onclick: () => { pop = openSwapPopup() || pop; pop?.focus?.(); status.set('Waiting for BEAR Swap…'); expectReady(); } }, icon('external'), 'Reopen BEAR Swap');
  const view = h('div',
    back(ctx),
    h('div.si-head',
      h('img', { src: LOGOS.bearSwap, alt: '', width: 64, height: 64, style: { margin: '0 auto 12px', borderRadius: '16px' } }),
      h('div.eyebrow', 'BEAR SWAP'), h('h2.si-title.si-title--sm', 'Finish in BEAR Swap'),
      h('p.lede', 'Pick a wallet, unlock it, and tap Sign in. This window updates on its own.')),
    status.el,
    h('div.si-actions', reopen));

  if (!pop) status.set('Your browser held the BEAR Swap window back. Open it here.', { waiting: false });
  else { status.set('Waiting for BEAR Swap…'); expectReady(); }

  let challenge = null;
  const answered = new WeakSet();
  const getChallenge = async () => {
    if (!challenge || challenge.expiresAt - Date.now() < 30_000) challenge = await post('/auth/challenge', {}, { signal });
    return challenge;
  };
  getChallenge().catch(() => {});

  const onMessage = async (e) => {
    if (e.origin !== SWAP_ORIGIN || !pop || e.source !== pop) return;
    const data = e.data || {};
    if (data.v !== 1) return;
    try {
      if (data.type === 'bearswap:ready') {
        ready = true;
        clearTimeout(silent);
        // The popup says ready a few times while it starts; answer each window once.
        if (answered.has(e.source)) return;
        answered.add(e.source);
        const c = await getChallenge();
        pop.postMessage({ type: 'bearswap:signin-request', v: 1, message: c.message }, SWAP_ORIGIN);
        status.set('Unlock a wallet in BEAR Swap and tap Sign in.');
      } else if (data.type === 'bearswap:signin-result') {
        status.set('Signed. Checking your $BEAR…');
        const c = challenge;
        challenge = null;
        const res = await post('/auth/verify', { challengeId: c?.challengeId, address: data.address, publicKey: data.publicKey, signature: data.signature }, { signal });
        cleanup();
        await ctx.finish(res);
      } else if (data.type === 'bearswap:signin-cancel') {
        status.error('You cancelled in BEAR Swap.');
      }
    } catch (err) {
      if (signal.aborted) return;
      status.error(err.message || 'BEAR Swap sign-in failed.');
    }
  };
  addEventListener('message', onMessage);

  // Notice the window closing without an answer.
  const watch = setInterval(() => {
    if (pop && pop.closed && !signal.aborted) {
      status.set('The BEAR Swap window closed. Reopen it to continue.', { waiting: false });
      pop = null;
    }
  }, 600);
  const cleanup = () => { removeEventListener('message', onMessage); clearInterval(watch); clearTimeout(silent); };
  signal.addEventListener('abort', () => { cleanup(); try { pop?.close(); } catch { /* cross-origin close can throw */ } }, { once: true });
  return view;
}

// ---------------------------------------------------------------------------
// WalletConnect: BEAR Wallet, Joey and any other XRPL WalletConnect wallet

function walletConnectView(ctx) {
  const signal = ctx.restart();
  const qrBox = h('div.si-qr', h('span.sk'));
  const status = statusBlock();
  const openBtn = h('a.btn.btn--gold.btn--block', { hidden: true }, icon('external'), 'Open in your wallet');
  const copyBtn = h('button.btn.btn--block', { type: 'button', hidden: true }, icon('copy'), 'Copy the link');
  const retry = h('button.btn.btn--block', { type: 'button', hidden: true, onclick: () => ctx.show(walletConnectView(ctx)) }, icon('refresh'), 'Try again');
  const view = h('div',
    back(ctx),
    h('div.si-head', h('div.eyebrow', 'WALLETCONNECT'), h('h2.si-title.si-title--sm', 'Connect a wallet'),
      h('p.lede', isTouch() ? 'Open it in a wallet on this phone, or scan the code from another device.' : 'Scan with BEAR Wallet, Joey or any XRPL WalletConnect wallet.')),
    qrBox, status.el,
    h('div.si-actions', openBtn, copyBtn, retry),
    h('ol.si-steps', h('li', h('b', '1'), 'Scan or open'), h('li', h('b', '2'), 'Connect'), h('li', h('b', '3'), 'Approve “Sign in”')));
  status.set('Opening a secure connection…');

  (async () => {
    try {
      const res = await walletConnectSignIn({
        signal,
        onUri: async (uri) => {
          const svg = await qrSvg(uri, { size: 232 }).catch(() => null);
          if (signal.aborted) return;
          fill(qrBox, svg || h('div.body', { style: { color: '#000', padding: '20px', textAlign: 'center' } }, 'Use “Copy the link”'));
          rise(qrBox, { px: 12, duration: 460 });
          if (isTouch()) { openBtn.href = uri; openBtn.hidden = false; }
          copyBtn.hidden = false;
          copyBtn.onclick = async () => {
            try { await navigator.clipboard.writeText(uri); copyBtn.replaceChildren(icon('check'), 'Copied'); } catch { /* clipboard refused */ }
          };
          status.set('Waiting for your wallet to connect…');
        },
        onStatus: (stage) => {
          if (stage === 'connected') {
            qrBox.classList.add('si-qr--done');
            qrBox.append(h('span.si-qr__tick', icon('check')));
            openBtn.hidden = true; copyBtn.hidden = true;
            status.set('Connected. Preparing the sign-in…');
          } else if (stage === 'signing') {
            status.set('Approve “Sign in” in your wallet.');
          }
        },
      });
      status.set('Signed. Checking your $BEAR…');
      await ctx.finish(res);
    } catch (err) {
      if (signal.aborted || err?.name === 'AbortError') return;
      if (qrBox.querySelector('.sk')) qrBox.hidden = true;
      openBtn.hidden = true; copyBtn.hidden = true; retry.hidden = false;
      const msg = String(err?.message || '');
      status.error(/reject|denied|declin|cancel/i.test(msg) ? 'You declined in your wallet.' : msg || 'WalletConnect could not be reached.');
    }
  })();
  return view;
}

// ---------------------------------------------------------------------------
// Xaman

function xamanView(ctx) {
  const signal = ctx.restart();
  const qrBox = h('div.si-qr', h('span.sk'));
  const status = statusBlock();
  const expiry = h('div.si-status__sub');
  const openBtn = h('a.btn.btn--gold.btn--block', { hidden: true, target: '_blank', rel: 'noopener' }, 'Open Xaman');
  const retry = h('button.btn.btn--block', { type: 'button', hidden: true, onclick: () => ctx.show(xamanView(ctx)) }, icon('refresh'), 'New code');
  const view = h('div',
    back(ctx),
    h('div.si-head', h('div.eyebrow', 'XAMAN'), h('h2.si-title.si-title--sm', 'Scan with Xaman'),
      h('p.lede', 'Open Xaman, tap the scan button, and approve the sign-in.')),
    qrBox, status.el, expiry,
    h('div.si-actions', openBtn, retry));
  status.set('Preparing a sign-in code…');

  (async () => {
    try {
      const start = await post('/auth/xaman/start', {}, { signal });
      if (signal.aborted) return;
      if (start.qr) fill(qrBox, h('img', { src: start.qr, alt: 'Xaman sign-in QR code', width: 232, height: 232 }));
      rise(qrBox, { px: 12, duration: 460 });
      if (start.deepLink) { openBtn.href = start.deepLink; openBtn.hidden = !isTouch(); }
      status.set('Waiting for Xaman…');
      countdown(expiry, start.expiresAt, signal);
      const res = await pollUntilSigned(`/auth/xaman/status/${start.id}`, start.pollToken, signal, (s) => {
        if (s === 'opened') status.set('Opened in Xaman — approve it there.');
      }, 2000);
      qrBox.classList.add('si-qr--done');
      qrBox.append(h('span.si-qr__tick', icon('check')));
      status.set('Signed. Checking your $BEAR…');
      await ctx.finish(res);
    } catch (err) {
      if (signal.aborted || err?.name === 'AbortError') return;
      expiry.textContent = '';
      retry.hidden = false;
      openBtn.hidden = true;
      if (qrBox.querySelector('.sk')) qrBox.hidden = true;
      if (err.status === 'rejected') status.error('You declined the sign-in in Xaman.');
      else if (err.status === 'expired') status.error('That code expired. Get a new one to try again.');
      else status.error(err.message || 'Xaman could not be reached.');
    }
  })();
  return view;
}

// ---------------------------------------------------------------------------
// Outcomes

function welcomeView(res) {
  const name = h('div.si-welcome__name', 'Welcome in');
  const view = h('div.si-welcome',
    avatar(null, { size: 72 }),
    h('div.eyebrow.eyebrow--gold', 'SIGNED IN'),
    name,
    h('p.lede', { style: { margin: '0 auto', color: 'var(--ink-3)' } }, 'Opening the park…'));
  api(`/profile/${res.wallet}`).then((r) => {
    if (r.profile?.display_name) {
      name.textContent = `Welcome back, ${r.profile.display_name}`;
      session.setIdentity({ displayName: r.profile.display_name });
    }
    if (r.profile?.avatar_nft) view.querySelector('.ava')?.replaceWith(avatar(r.profile.avatar_nft, { size: 72 }));
  }).catch(() => {});
  return view;
}

function notYetView(ctx, res) {
  const a = res.access || {};
  const bear = h('div.stat__value.num', '—');
  const nfts = h('div.stat__value.num', '—');
  const view = h('div',
    h('div.si-head', h('div.eyebrow', 'ALMOST THERE'), h('h2.si-title.si-title--sm', 'Not quite yet'),
      h('p.lede', `BEAR Park opens at ${num(BEAR.minEntry, 0)} $BEAR or one BEAR NFT.`)),
    h('div.si-figures',
      h('div.frost', h('div.stat__label', '$BEAR held'), bear),
      h('div.frost', h('div.stat__label', 'BEAR NFTs'), nfts)),
    h('div.si-actions',
      h('a.btn.btn--gold.btn--block', { href: LINKS.trade, target: '_blank', rel: 'noopener' }, 'Get $BEAR on BEAR Swap', icon('external')),
      h('a.btn.btn--block', { href: LINKS.xrpcafe, target: '_blank', rel: 'noopener' }, 'Find a BEAR NFT on xrp.cafe', icon('external')),
      h('button.btn.btn--line.btn--block', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const r = await api(`/auth/access/${res.wallet}`);
          session.setAccess(r.access);
          if (r.access?.eligible) { ctx.show(welcomeView(res)); await sleep(1100); ctx.close(); enterPark(); return; }
          roll(bear, num(r.access?.bear, 0));
          btn.after(statement({ tone: 'info', body: 'Still under the line. Holdings update a few seconds after a trade settles.' }));
        } catch (err) {
          btn.after(errorLine(err.message || 'Could not check right now.', { small: true }));
        } finally { btn.disabled = false; }
      } }, icon('refresh'), 'Check again'),
      h('button.btn--text.btn', { type: 'button', onclick: async () => { await session.end(); ctx.show(chooseView(ctx), { back: true }); } }, 'Use another wallet')));
  requestAnimationFrame(() => { roll(bear, num(a.bear, 0)); roll(nfts, num(a.nfts, 0)); });
  return view;
}

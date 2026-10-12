// The frame around every page: header (nav, honey, notifications, wallet),
// the phone menu, the account and notification sheets, and the footer.

import { h, icon, fill } from './core/dom.js';
import { session } from './core/session.js';
import { NAV, href } from './core/router.js';
import { flood, roll, leaf, fadeIn, fadeOut, EASE, skip } from './core/motion.js';
import { points, profile, notifications, honeyChanged } from './core/data.js';
import { holdings } from './core/ledger.js';
import { LINKS } from './core/market.js';
import { post, forgetFeeds } from './core/api.js';
import { num, compact, short, ago } from './core/format.js';
import { dialog, avatar, displayName, copyButton, skRows, empty } from './core/ui.js';
import { openSignIn } from './signin/sheet.js';
import { secretTaps, jester } from './core/fun.js';

export function brand({ href: to = '#/' } = {}) {
  const logo = h('span.hdr__logo', h('img', { src: '/apple-touch-icon.png', alt: '', width: 36, height: 36, draggable: false }));
  // Inside the park the BEAR coin keeps a secret: tap it five times for the Jester.
  // (The landing's logo reloads the page, so its secret lives on the wooden sign.)
  if (to.startsWith('#')) secretTaps(logo, 5, jester);
  return h('a.hdr__brand', { href: to, 'aria-label': 'BEAR Park home' },
    logo,
    h('span.wordmark.wordmark--inline', h('span.bear', 'BEAR'), h('span.park', 'PARK')));
}

// ---------------------------------------------------------------------------
// Header

export function header({ signedIn }) {
  const links = NAV.map((r) => h('a.hdr__link', { href: href(r.id === 'home' ? '/' : `/${r.id}`), dataset: { route: r.id } }, r.label));
  const mark = h('span.hdr__mark', { style: { opacity: '0' } });
  const nav = h('nav.hdr__nav', { 'aria-label': 'Park' }, links, mark);
  const end = h('div.hdr__end');
  const burger = h('button.burger.burger--phone', { type: 'button', 'aria-label': 'Menu', 'aria-expanded': 'false', onclick: () => openMenu(burger) },
    h('span', h('i'), h('i'), h('i')));

  const el = h('header.hdr', h('div.hdr__row', brand({ href: signedIn ? '#/' : '/' }), signedIn ? nav : h('span'), end));

  if (signedIn) {
    const w = session.wallet;
    end.append(honeyChip(w), bell(w), walletTile(w), burger);
  } else {
    const btn = h('button.btn.hdr-signin', { type: 'button', onclick: () => openSignIn({ origin: btn }) },
      h('span.glyph', icon('wallet')), h('span.label', 'Sign in'));
    end.append(flood(btn));
  }

  el.setRoute = (id) => {
    links.forEach((a) => a.setAttribute('aria-current', a.dataset.route === id ? 'page' : 'false'));
    const a = links.find((l) => l.dataset.route === id);
    if (!a) { mark.style.opacity = '0'; return; }
    requestAnimationFrame(() => {
      const first = mark.style.opacity === '0';
      if (first) mark.style.transition = 'none';
      mark.style.transform = `translateX(${a.offsetLeft + a.offsetWidth / 2 - 17}px)`;
      mark.style.opacity = '1';
      if (first) { void mark.offsetWidth; mark.style.transition = ''; }
    });
  };

  // The bar draws across, then its tiles turn in (BEAR Swap's header entrance).
  if (!skip()) {
    el.animate([{ transform: 'scaleX(.04)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 580, delay: 80, easing: EASE.decel, fill: 'backwards' });
    [...el.querySelectorAll('.hdr__brand, .hdr__link, .hdr__end > *')].forEach((tile, i) => {
      const k = i % 4;
      const from = ['perspective(1400px) rotateY(-74deg) translateX(-10px)', 'perspective(1400px) rotateX(68deg) translateY(10px)', 'perspective(1400px) rotateY(74deg) translateX(10px)', 'perspective(1400px) rotateX(-68deg) translateY(-10px)'][k];
      tile.style.transformOrigin = ['left center', 'center bottom', 'right center', 'center top'][k];
      tile.animate([{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 460, delay: 660 + i * 70, easing: EASE.decel, fill: 'backwards' });
    });
  }
  return el;
}

function honeyChip(w) {
  const fig = h('span.hdr-chip__figure.num', '—');
  const chip = h('a.hdr-chip.hdr-chip--honey', { href: '#/earn', 'aria-label': 'Your honey points' },
    h('span.glyph', icon('honey')), h('span.hdr-chip__stack', h('span', fig, h('span.hdr-chip__unit', 'HNY'))));
  points(w).subscribe((s) => {
    if (s.value) roll(fig, num(s.value.total_points, 0));
    else if (s.error) fig.textContent = '—';
  });
  // Games and raids announce new honey on the parent window.
  addEventListener('honeyPointsUpdated', () => honeyChanged(w));
  return chip;
}

function bell(w) {
  const dot = h('span.badge-dot', { hidden: true });
  const btn = h('button.icon-btn', { type: 'button', 'aria-label': 'Notifications', onclick: () => openNotifications(w, btn) }, icon('bell'), dot);
  notifications(w).subscribe((s) => {
    const unread = (s.value || []).filter((n) => !n.read).length;
    dot.hidden = !unread;
    dot.textContent = unread > 9 ? '9+' : String(unread);
  });
  return btn;
}

function walletTile(w) {
  const figure = h('span.hdr-chip__figure.num', '—');
  const tile = h('button.hdr-chip.hdr-chip--wallet', { type: 'button', 'aria-label': 'Your wallet', onclick: () => openAccount(w, tile) },
    h('span.glyph', icon('wallet')),
    h('span.hdr-chip__stack', h('span.hdr-chip__eyebrow', short(w, 4, 4)), h('span', figure, h('span.hdr-chip__unit', 'BEAR'))));
  holdings(w).subscribe((s) => {
    if (s.value) roll(figure, compact(s.value.bear));
    else if (s.error) { figure.textContent = '—'; }
  });
  return tile;
}

// ---------------------------------------------------------------------------
// Phone menu: Metro rows that turn in from the right.

function openMenu(burger) {
  burger.setAttribute('aria-expanded', 'true');
  const current = location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'home';
  const rows = NAV.map((r) => h('a.menu__row', { href: href(r.id === 'home' ? '/' : `/${r.id}`), 'aria-current': r.id === current ? 'page' : null, onclick: () => close() },
    r.id === 'bear' ? h('span.wordmark.wordmark--inline', { style: { fontSize: '22px' } }, h('span.bear', '$BEAR')) : r.label));
  const w = session.wallet;
  const panel = h('nav.menu', { 'aria-label': 'Menu' },
    h('h2.menu__title', 'Menu'),
    rows,
    h('div.menu__div', 'More'),
    h('a.menu__row', { href: `#/u/${w}`, onclick: () => close() }, 'Your profile'),
    h('a.menu__row', { href: LINKS.swapHome, target: '_blank', rel: 'noopener' }, h('span.wordmark.wordmark--inline', { style: { fontSize: '20px' } }, h('span.bear', 'BEAR'), h('span.park', 'SWAP'))),
    h('div.menu__foot',
      h('button.btn.btn--line.btn--block', { type: 'button', onclick: () => { close(); signOut(); } }, icon('logout'), 'Disconnect')));
  const scrim = h('div.menu-scrim', { onclick: () => close() });
  document.body.append(scrim, panel);
  document.documentElement.classList.add('covered');
  fadeIn(scrim);
  if (!skip()) {
    panel.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 450, easing: EASE.decel, fill: 'backwards' });
    [...panel.querySelectorAll('.menu__title, .menu__row')].forEach((r, i) => {
      r.style.transformOrigin = 'right center';
      r.animate([{ transform: 'perspective(1400px) translateX(10px) rotateY(74deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 120 + Math.min(i, 9) * 40, easing: EASE.hingeIn, fill: 'backwards' });
    });
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  panel.querySelector('a')?.focus({ preventScroll: true });
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    burger.setAttribute('aria-expanded', 'false');
    panel.inert = true;
    await Promise.all([
      fadeOut(scrim, { duration: 300 }),
      skip() ? null : panel.animate([{ transform: 'none' }, { transform: 'translateX(100%)' }], { duration: 300, easing: EASE.accel, fill: 'forwards' }).finished,
    ]);
    scrim.remove(); panel.remove();
    document.documentElement.classList.remove('covered');
    burger.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------------------
// Account sheet: who you are, what you hold, where to go.

function openAccount(w, origin) {
  const balance = h('div.figure.figure--md', '—');
  const name = h('div', { style: { font: '700 18px/1.2 var(--font)' } }, short(w));
  const ava = h('span', avatar(null, { size: 56 }));
  const life = new AbortController();
  const d = dialog({
    eyebrow: 'SIGNED IN', title: 'Your wallet', origin, sheet: true, onClose: () => life.abort(),
    body: [
      h('div.cluster', { style: { gap: '14px', marginBottom: '18px' } }, ava,
        h('div', { style: { minWidth: '0' } }, name,
          h('div.cluster', { style: { gap: '4px' } }, h('span.muted.num', { style: { fontSize: '12.5px' } }, short(w, 8, 6)), copyButton(w, 'Copy address')))),
      h('div.frost.frost--pad', { style: { marginBottom: '16px' } },
        h('div.caption', '$BEAR in this wallet'), balance,
        h('div.tile__sub', { id: 'acct-xrp' }, ' ')),
      h('div.stack', { style: { '--gap': '10px' } },
        h('a.btn.btn--block', { href: `#/u/${w}`, onclick: () => d.close() }, icon('user'), 'Your profile'),
        h('a.btn.btn--block', { href: LINKS.trade, target: '_blank', rel: 'noopener' }, icon('arrow-right'), 'Trade $BEAR on BEAR Swap'),
        h('a.btn.btn--block.btn--line', { href: LINKS.bithomp(w), target: '_blank', rel: 'noopener' }, icon('external'), 'View on Bithomp')),
    ],
    foot: [h('button.btn.btn--danger', { type: 'button', onclick: async () => { await d.close(); signOut(); } }, icon('logout'), 'Disconnect')],
  });
  holdings(w).subscribe((s) => {
    if (s.value) {
      roll(balance, num(s.value.bear, 0));
      const xrp = d.el.querySelector('#acct-xrp');
      if (xrp && s.value.xrp != null) xrp.textContent = `${num(s.value.xrp, 2)} XRP`;
    }
  }, life.signal);
  profile(w).subscribe((s) => {
    if (!s.value) return;
    name.textContent = displayName({ ...s.value, wallet_address: w });
    fill(ava, avatar(s.value.avatar_nft, { size: 56 }));
  }, life.signal);
}

export async function signOut() {
  await session.end();
  forgetFeeds(); // this tab's cached reads (and their warm copies) go with the session
  location.replace('/');
}

// ---------------------------------------------------------------------------
// Notifications

// The server writes 'Anonymous' for people without a name; their address says more.
const who = (d) => (d.displayName && d.displayName !== 'Anonymous' ? d.displayName : short(d.wallet || '') || 'A BEAR');
const emojis = (d) => (Array.isArray(d.reactions) ? ` ${d.reactions.slice(0, 3).join(' ')}` : '');
/** What they said, for comments and replies: one quiet line under the headline. */
const said = (d) => {
  const t = String(d.commentText || '').replace(/\s+/g, ' ').trim();
  return t ? `“${t.length > 90 ? `${t.slice(0, 88)}…` : t}”` : '';
};
/** What each notification says, and where tapping it goes. */
const NOTES = {
  follower: (d) => [`${who(d)} followed you`, d.wallet && `#/u/${d.wallet}`],
  reaction: (d) => [`${who(d)} reacted to your comment${emojis(d)}`, d.profileWallet && `#/u/${d.profileWallet}${d.commentId ? `?c=${d.commentId}` : ''}`],
  profile_comment: (d) => [`${who(d)} commented on your profile`, d.profileWallet && `#/u/${d.profileWallet}${d.commentId ? `?c=${d.commentId}` : ''}`],
  profile_reply: (d) => [`${who(d)} replied to your comment`, d.profileWallet && `#/u/${d.profileWallet}${d.commentId ? `?c=${d.commentId}` : ''}`],
  bulletin_comment: (d) => [`${who(d)} commented on your post`, board(d)],
  bulletin_reply: (d) => [`${who(d)} replied to your comment`, board(d)],
  bulletin_post_reaction: (d) => [`${who(d)} reacted to your post${emojis(d)}`, board(d)],
  bulletin_comment_reaction: (d) => [`${who(d)} reacted to your comment${emojis(d)}`, board(d)],
};
const board = (d) => d.postId && `#/community?post=${d.postId}${d.commentId ? `&comment=${d.commentId}` : ''}`;

function openNotifications(w, origin) {
  const list = h('div.rows', skRows(4));
  const life = new AbortController();
  const d = dialog({ eyebrow: 'NOTIFICATIONS', title: 'Activity', origin, onClose: () => life.abort(), body: [h('div', { style: { margin: '0 -24px' } }, list)] });
  // Back / forward (or any other route change) takes the sheet with it.
  addEventListener('hashchange', () => d.close(), { once: true, signal: life.signal });
  const feed = notifications(w);
  const marking = new Set(); // ids being marked read right now
  const isNew = new Set(); // unread when this sheet showed them: they stay highlighted while it's open
  let painted = false;
  let fresh = false;
  // Paint what's cached at once, but mark read only from the fresh answer: the
  // cached list can be a minute old, and setting it back over the fresh one
  // used to drop notifications that arrived in between.
  feed.refresh().finally(() => { fresh = true; if (!life.signal.aborted) markRead(feed.get().value || []); });

  feed.subscribe((s) => {
    if (!s.value) { if (s.error) fill(list, empty('Could not load', 'Try again in a moment.')); return; }
    if (!s.value.length) { fill(list, empty('All quiet', 'Follows, comments and replies will show up here.')); return; }
    fill(list, s.value.slice(0, 40).map((n) => {
      let data = n.data || {};
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
      const [text, to] = (NOTES[n.type] || (() => [data.message || 'Something happened in the park', data.wallet && `#/u/${data.wallet}`]))(data);
      const quote = said(data); // the comment it's about, when there is one
      if (!n.read) isNew.add(n.id);
      return h(to ? 'a.row' : 'div.row', { href: to || null, onclick: to ? () => d.close() : null, class: isNew.has(n.id) ? 'row--you' : '' },
        avatar(data.avatarNft, { size: 36 }),
        h('div.row__main', h('div.row__title', { style: { whiteSpace: 'normal' } }, text),
          quote ? h('div.row__sub', { style: { whiteSpace: 'normal' } }, quote) : null,
          h('div.row__sub', ago(n.created_at))));
    }));
    if (!painted) { painted = true; leaf(list.children); }
    if (fresh) markRead(s.value);
  }, life.signal);

  // Mark everything shown as read (best effort); the bell clears now. One
  // request for all of them; an older API without it gets one per notification.
  function markRead(all) {
    const unread = all.filter((n) => !n.read && !marking.has(n.id));
    if (!unread.length) return;
    for (const n of unread) marking.add(n.id);
    const ids = new Set(unread.map((n) => n.id));
    post('/notifications/read-all', { wallet_address: w })
      .catch((err) => (err.status === 404
        ? Promise.allSettled(unread.slice(0, 40).map((n) => post(`/notifications/${n.id}/read`, { wallet_address: w })))
        : Promise.reject(err)))
      .then(() => {
        const now = feed.get().value || [];
        feed.set(now.map((n) => (ids.has(n.id) ? { ...n, read: true } : n)));
      })
      .catch(() => { /* the bell stays lit; the next open tries again */ })
      .finally(() => { for (const id of ids) marking.delete(id); });
  }
}

// ---------------------------------------------------------------------------
// Footer: the Panorama.

export function footer() {
  const col = (title, links) => h('div',
    h('h3.foot__head', title),
    links.map(([text, to, ext]) => h('a.foot__link', { href: to, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null }, text, icon(ext ? 'external' : 'chevron-right'))));
  const social = (name, to, label) => flood(h('a.social.btn', { href: to, target: '_blank', rel: 'noopener', 'aria-label': label }, h('span.glyph', icon(name))));
  return h('footer.foot.frost.frost--section.frost--lg',
    h('div.foot__grid',
      h('div.stack', { style: { '--gap': '14px' } },
        h('span.wordmark', { style: { fontSize: '34px' } }, h('span.bear', 'BEAR'), h('span.park', 'PARK')),
        h('p.body', { style: { margin: '0', maxWidth: '34ch' } }, 'The home of $BEAR on the XRP Ledger. Play, raid, earn honey — and never hand anyone your keys.'),
        h('div.socials', social('x', LINKS.x, 'BEAR on X'), social('discord', LINKS.discord, 'BEAR Discord'), social('kick', LINKS.kick, 'BEAR on Kick'))),
      col('Park', [['Play', '/main.html#/play'], ['Raids', '/main.html#/raids'], ['Earn', '/main.html#/earn'], ['Community', '/main.html#/community'], ['Shop', '/main.html#/shop']]),
      col('$BEAR', [['Trade on BEAR Swap', LINKS.trade, true], ['Price & holders', '/main.html#/bear'], ['BEAR NFTs', LINKS.xrpcafe, true], ['Pixel BEARs', LINKS.xrpcafePixel, true]]),
      col('Legal', [['Privacy', '/privacy'], ['Terms', '/terms'], ['Support', '/support'], ['Data deletion', '/data-deletion']])),
    h('div.foot__bar', h('span', `© ${new Date().getFullYear()} BEAR Park`), h('span', 'Non-custodial — BEAR Park never sees your keys.')));
}


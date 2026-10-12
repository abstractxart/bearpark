// BEAR Park boots here. index.html is the front door (signed out); main.html
// is the park (signed in). Both load this file and it decides what to draw.

import { h } from './core/dom.js';
import { session } from './core/session.js';
import { api } from './core/api.js';
import { mountOrbs, watchVisibility } from './core/orbs.js';
import { mountIcons } from './core/icons.js';
import { startRouter } from './core/router.js';
import { profile } from './core/data.js';
import { header, footer } from './shell.js';

const entry = document.body.dataset.entry; // 'landing' | 'park'

// No-blur fallback: browsers without backdrop-filter and Android WebViews
// (X's in-app browser) where re-blurring the drifting orbs costs ~17 ms a frame.
const blur = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
document.documentElement.dataset.backdrop = blur && !/; wv\)/.test(navigator.userAgent) ? '1' : '0';

const s = session.get();
if (entry === 'park' && !s) {
  location.replace(`/${location.search}${location.hash}`);
} else if (entry === 'landing' && s && s.access?.eligible !== false) {
  const raid = new URLSearchParams(location.search).get('raid');
  location.replace(`/main.html${raid && /^\d+$/.test(raid) ? `#/raids?raid=${raid}` : location.hash}`);
} else {
  boot();
}

async function boot() {
  mountIcons();
  mountOrbs(document.getElementById('orbs'));
  watchVisibility();
  const app = document.getElementById('app');
  app.replaceChildren();

  if (entry === 'landing') {
    app.append(header({ signedIn: false }));
    const { default: landing } = await import('./pages/landing.js');
    app.append(landing(), footer());
    // A wallet that signed in but isn't over the line yet: show where they stand.
    if (s && s.access?.eligible === false) {
      const { openSignIn } = await import('./signin/sheet.js');
      openSignIn({});
    }
    return;
  }

  const hdr = header({ signedIn: true });
  const outlet = h('div.outlet', { style: { flex: '1', display: 'flex', flexDirection: 'column' } });
  app.append(hdr, outlet, footer());

  const wallet = s.wallet;
  startRouter(outlet, {
    ctxBase: { wallet, session: s },
    onRoute: (route) => hdr.setRoute(route.id),
  });

  // Keep the games' names in step with the profile.
  profile(wallet).subscribe((p) => {
    if (p.value) session.setIdentity({ displayName: p.value.display_name || null });
  });

  // Re-check entry in the background; a wallet that sold below the line goes back to the door.
  api(`/auth/access/${wallet}`).then((r) => {
    session.setAccess(r.access);
    if (r.access && r.access.eligible === false) location.replace('/');
  }).catch(() => { /* the ledger is unreachable: don't lock anyone out over it */ });

  // The token died mid-visit: sign in again over the page. Signed out (here or
  // in another tab), or a different wallet signed in elsewhere: start over.
  session.subscribe(async (now, reason) => {
    if (reason === 'expire') {
      const { openSignIn } = await import('./signin/sheet.js');
      openSignIn({ onSignedIn: () => location.reload() });
    } else if (reason === 'end' || (reason === 'elsewhere' && now?.wallet !== wallet)) {
      location.replace(now ? '/main.html' : '/');
    }
  });
}

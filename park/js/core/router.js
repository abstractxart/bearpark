// Hash routes for the signed-in park. Each page module exports
// `default async function page(ctx)` returning its root element, and may export
// `title`. Modules are warmed on idle so moving between pages never waits on a
// download (the owner's rule: no loading icon between pages, ever).

import { h, scope } from './dom.js';
import { arrive, depart, revealOnScroll } from './motion.js';

export const ROUTES = [
  { id: 'home', label: 'Home', icon: 'home', match: /^\/?$/, load: () => import('../pages/home.js') },
  { id: 'play', label: 'Play', icon: 'gamepad', match: /^\/play$/, load: () => import('../pages/play.js'), blurb: 'Four games, honey for every minute' },
  { id: 'raids', label: 'Raids', icon: 'flag', match: /^\/raids$/, load: () => import('../pages/raids.js'), blurb: 'Boost $BEAR on X, earn honey' },
  { id: 'earn', label: 'Earn', icon: 'honey', match: /^\/earn$/, load: () => import('../pages/earn.js'), blurb: 'Honey points and daily BEARdrops' },
  { id: 'community', label: 'Community', icon: 'users', match: /^\/community$/, load: () => import('../pages/community.js'), blurb: 'The board, BEAR friends, the stream' },
  { id: 'shop', label: 'Shop', icon: 'bag', match: /^\/shop$/, load: () => import('../pages/shop.js'), blurb: 'Cosmetics, NFTs and merch' },
  { id: 'bear', label: '$BEAR', icon: 'chart', match: /^\/bear$/, load: () => import('../pages/bear.js'), blurb: 'Price, chart, holders, NFTs' },
  { id: 'profile', label: 'Profile', icon: 'user', match: /^\/u\/(r[1-9A-HJ-NP-Za-km-z]{24,34})$/i, load: () => import('../pages/profile.js'), hidden: true },
];
export const NAV = ROUTES.filter((r) => !r.hidden);

// The old one-page site's anchors, and the PWA manifest's shortcuts.
const LEGACY = {
  'bear-overview': '/bear', 'sec-m7': '/earn', 'honey-points': '/earn', raids: '/raids',
  'cosmetics-store': '/shop', bearcade: '/play', games: '/play', leaderboards: '/play?tab=boards',
  'bulletin-board': '/community', community: '/community', bg123: '/community?tab=bg123',
  nfts: '/bear?tab=nfts', memes: '/community?tab=stream', network: '/bear',
};

export function parse(hash = location.hash) {
  let raw = hash.replace(/^#/, '');
  if (raw && !raw.startsWith('/')) raw = LEGACY[raw] || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

export function href(path) { return `#${path}`; }

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) return;
  if (replace) history.replaceState(null, '', target);
  else history.pushState(null, '', target);
  dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Start the router: renders into `outlet`, calls `onRoute(route)` so the header
 * can move its marker. `ctxBase` is merged into every page's context.
 */
export function startRouter(outlet, { ctxBase = {}, onRoute } = {}) {
  let current = null; // { route, el, scope, key }
  let token = 0;

  // A ?raid=<id> deep link from an old share lands on the raid.
  const deep = new URLSearchParams(location.search).get('raid');
  if (deep && /^\d+$/.test(deep)) {
    history.replaceState(null, '', `${location.pathname}#/raids?raid=${deep}`);
  } else if (location.hash && !location.hash.startsWith('#/')) {
    const { path, query } = parse();
    history.replaceState(null, '', `#${path}${query.toString() ? `?${query}` : ''}`);
  }

  async function render() {
    const my = ++token;
    const { path, query } = parse();
    let route = ROUTES.find((r) => r.match.test(path));
    if (!route) { navigate('/', { replace: true }); return; }
    const params = path.match(route.match).slice(1);
    const key = `${route.id}:${params.join('/')}`;
    if (current?.key === key) { current.onQuery?.(query); return; }

    onRoute?.(route);
    const modPromise = route.load();
    const leaving = current;
    current = null;
    if (leaving) {
      leaving.scope.dispose();
      leaving.el.inert = true;
      // The next page's code loads while the old one turns away.
      // A hidden tab can stall the leave animation: never wait on it for long.
      await Promise.all([
        Promise.race([depart(blocks(leaving.el)), new Promise((r) => setTimeout(r, 900))]),
        modPromise.catch(() => {}),
      ]);
      leaving.el.remove();
    }
    if (my !== token) return;

    const s = scope();
    let el;
    try {
      const mod = await modPromise;
      el = await mod.default({ ...ctxBase, params, query, signal: s.signal, scope: s, navigate });
      document.title = mod.title ? `${typeof mod.title === 'function' ? mod.title(params) : mod.title} · BEAR Park` : 'BEAR Park';
    } catch (err) {
      console.error(err);
      el = h('main.page', h('div.empty', h('b', 'This page could not open'), 'Check your connection and try again.'));
    }
    if (my !== token) { s.dispose(); return; }
    current = { route, el, scope: s, key, onQuery: el.onQuery };
    outlet.append(el);
    window.scrollTo({ top: 0, behavior: 'instant' });
    arrive(blocks(el), { delay: leaving ? 0 : 120 });
    requestAnimationFrame(() => revealOnScroll(el));
  }

  addEventListener('hashchange', render);
  render();

  // Warm every page's code once the first one is up.
  const warm = () => NAV.forEach((r) => r.load().catch(() => {}));
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1500);

  return { render };
}

/** The blocks a page arrives and leaves in: anything marked data-e, else its children. */
function blocks(el) {
  const marked = el.querySelectorAll('[data-e]');
  const list = marked.length ? [...marked] : [...el.children];
  return list.filter((b) => {
    const r = b.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight * 1.1;
  }).slice(0, 9);
}

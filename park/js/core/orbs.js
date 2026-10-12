// The orbs wallpaper — BEAR Swap's default theme (OrbsWallpaper.tsx / orbsModel.ts).
// Thirteen radial-gradient discs and a static star field; no canvas, no video.
// Each orb rides one 240s loop whose frequencies are integer harmonics, so the
// drift never shows a seam. Sampled into @keyframes once, then pure compositor.

import { reducedMotion } from './dom.js';

// BEAR Swap's orbs, re-tinted for the park: its purple / yellow / green stripe
// leads, with a violet and a honey-amber where BEAR Swap has blue and red.
const P = { purple: '#7B2CFF', green: '#00E676', gold: '#FFB300', red: '#FF8F00', blue: '#9C27FF' };
const ANCHORS = { purple: [0.18, 0.15], green: [0.75, 0.32], gold: [0.42, 0.65], red: [0.82, 0.78], blue: [1.05, 0.48] };
const DEEP = [[0.62, 0.09], [0.07, 0.46], [0.91, 0.13], [0.28, 0.89], [0.54, 0.40]];
// [colour, r, hx, hy, ampX, ampY, nx, ny, phx, phy, nb, phb, squash, breathe, alpha, orbit?]
const ORBS = [
  [P.blue, 30, ...DEEP[0], 26, 18, 1, 2, 0.13, 0.71, 1, 0.40, 0.03, 0.03, 0.17],
  [P.purple, 22, ...DEEP[1], 20, 24, 2, 1, 0.58, 0.06, 1, 0.85, 0.03, 0.035, 0.14],
  [P.green, 17, ...DEEP[2], 18, 16, 3, 2, 0.29, 0.52, 2, 0.20, 0.03, 0.03, 0.12],
  [P.gold, 26, ...DEEP[3], 24, 20, 1, 3, 0.77, 0.34, 1, 0.62, 0.03, 0.03, 0.13],
  [P.red, 15, ...DEEP[4], 16, 22, 2, 3, 0.44, 0.90, 2, 0.05, 0.03, 0.035, 0.10],
  [P.purple, 290, ...ANCHORS.purple, 104, 66, 2, 3, 0, 0.25, 1, 0.10, 0.055, 0.055, 0.62],
  [P.blue, 268, ...ANCHORS.blue, 112, 60, 2, 5, 0.82, 0.44, 1, 0.55, 0.055, 0.055, 0.64],
  [P.green, 240, ...ANCHORS.green, 88, 80, 3, 2, 0.37, 0.62, 2, 0.30, 0.07, 0.06, 0.66],
  [P.gold, 248, ...ANCHORS.gold, 82, 90, 3, 4, 0.62, 0.18, 2, 0.72, 0.07, 0.06, 0.66],
  [P.red, 232, ...ANCHORS.red, 76, 72, 4, 3, 0.18, 0.82, 2, 0.44, 0.07, 0.06, 0.64],
  ['#18FFFF', 46, ...ANCHORS.purple, 104, 66, 2, 3, 0, 0.25, 5, 0.20, 0.14, 0.09, 0.78, [372, 132, 9, 0.10]],
  ['#B388FF', 40, ...ANCHORS.gold, 82, 90, 3, 4, 0.62, 0.18, 6, 0.61, 0.15, 0.09, 0.76, [318, 116, 12, 0.55]],
  ['#FFD54F', 43, ...ANCHORS.blue, 112, 60, 2, 5, 0.82, 0.44, 5, 0.88, 0.14, 0.09, 0.76, [348, 126, 7, 0.31]],
];

const TAU = Math.PI * 2;
const rgba = (c, a) => `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

function keyframes(i, [, , , , mx, my, nx, ny, px, py, nb, pb, sq, bre, , orbit]) {
  let f = '';
  for (let s = 0; s <= 48; s++) {
    const th = (s / 48) * TAU;
    const ax = nx * th + px * TAU;
    const ay = ny * th + py * TAU;
    const q = sq * (Math.cos(ax) ** 2 - Math.cos(ay) ** 2);
    const br = 1 + bre * Math.sin(nb * th + pb * TAU);
    let ox = 0, oy = 0, ds = 1, op = '';
    if (orbit) {
      const oa = orbit[2] * th + orbit[3] * TAU;
      const d = Math.sin(oa);
      ox = orbit[0] * Math.cos(oa);
      oy = orbit[1] * d;
      ds = 1 + 0.18 * d;
      op = `;opacity:${(1 - 0.42 * (0.5 - 0.5 * d)).toFixed(3)}`;
    }
    f += `${((s / 48) * 100).toFixed(3)}%{transform:translate3d(${(mx * Math.sin(ax) + ox).toFixed(2)}px,${(my * Math.sin(ay) + oy).toFixed(2)}px,0) scale(${((br + q) * ds).toFixed(3)},${((br - q) * ds).toFixed(3)})${op}}`;
  }
  return `@keyframes bp-orb${i}{${f}}`;
}

export function mountOrbs(root) {
  const webview = /; wv\)/.test(navigator.userAgent);
  const still = webview || reducedMotion();
  document.documentElement.dataset.motion = still ? '0' : '1';

  let W = innerWidth;
  let H = innerHeight;
  let css = '';
  const nodes = [];

  ORBS.forEach((orb, i) => {
    const [c, r, hx, hy, , , , , , , , , , , al] = orb;
    const core = r * 0.42;
    const el = document.createElement('div');
    el.className = 'o';
    el.dataset.hx = hx;
    el.dataset.hy = hy;
    el.dataset.r = r;
    el.style.cssText = `left:${hx * W - r}px;top:${hy * H - r}px;width:${2 * r}px;height:${2 * r}px;${still ? '' : `animation:bp-orb${i} 240s linear infinite`}`;
    const halo = document.createElement('i');
    halo.style.cssText = `inset:0;background:radial-gradient(circle closest-side,${rgba(c, al)} 0%,${rgba(c, al * 0.55)} 34%,${rgba(c, al * 0.18)} 68%,${rgba(c, 0)} 100%)`;
    const heart = document.createElement('i');
    heart.style.cssText = `left:${r - core}px;top:${r - core}px;width:${2 * core}px;height:${2 * core}px;background:radial-gradient(circle closest-side,${rgba(c, Math.min(1, al * 1.25))} 0%,${rgba(c, al * 0.45)} 46%,${rgba(c, 0)} 100%)`;
    el.append(halo, heart);
    if (!still) css += keyframes(i, orb);
    nodes.push(el);
  });

  // Stars: three depth tiers, deterministic, one static SVG.
  const SW = W + 200;
  const tints = [P.purple, P.green, P.gold, P.blue, '#18FFFF'];
  const tiers = [[1, 0.4], [1.7, 0.7], [2.6, 0.95]];
  let stars = '';
  for (let g = 0; g < 12; g++) {
    const t = g < 5 ? 0 : g < 9 ? 1 : 2;
    for (let i = 0; i < [7, 6, 5][t]; i++) {
      const k = g * 17 + i;
      stars += `<circle cx="${(hash(k, 1) * SW).toFixed(1)}" cy="${((t ? 0.22 + hash(k, 2) * 0.78 : hash(k, 2)) * H).toFixed(1)}" r="${(0.3 + hash(k, 3) * tiers[t][0]).toFixed(2)}" fill="${tints[Math.floor(hash(k, 5) * 5) % 5]}" opacity="${(tiers[t][1] * (0.5 + hash(k, 4) * 0.5)).toFixed(2)}"/>`;
    }
  }
  root.insertAdjacentHTML('afterbegin', `<svg width="${SW}" height="${H}" style="position:absolute;top:0;left:-100px" aria-hidden="true">${stars}</svg>`);
  root.append(...nodes);
  if (css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }

  // Fly in from the compass, decelerating to rest (no overshoot).
  if (!still && !document.hidden) {
    nodes.forEach((el, i) => {
      const a = (i % 8) * (TAU / 8);
      const d = Math.max(W, H) * 0.7;
      // `translate` composes with the drift's `transform`, so the two never fight.
      el.animate([
        { translate: `${Math.cos(a) * d}px ${Math.sin(a) * d}px`, opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { translate: '0 0', opacity: 1 },
      ], { duration: 2200, delay: 40 * i, easing: 'cubic-bezier(.05,.7,.1,1)', fill: 'backwards' });
    });
  }

  // Re-place the anchors on a real resize; a phone's URL bar (height < 25%) is not one.
  let raf = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const w = innerWidth;
      const h = innerHeight;
      if (w === W && Math.abs(h - H) / H < 0.25) return;
      W = w; H = h;
      for (const el of nodes) {
        const r = Number(el.dataset.r);
        el.style.left = `${Number(el.dataset.hx) * W - r}px`;
        el.style.top = `${Number(el.dataset.hy) * H - r}px`;
      }
    });
  });
}

/** Pause infinite motion while the tab is hidden (the GPU has better things to do). */
export function watchVisibility() {
  const sync = () => document.documentElement.classList.toggle('tab-hidden', document.hidden);
  document.addEventListener('visibilitychange', sync);
  sync();
}

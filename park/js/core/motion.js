// Metro + Material 3 motion, ported from BEAR Swap.
//
// House rules (park/DESIGN.md): transform + opacity only; WAAPI with
// fill:'backwards' so nothing stays transformed; transform-origin set inline,
// never keyframed; placement decelerates and lands — no overshoot, no jiggle,
// no glints; opacity saturates early so a block ARRIVES rather than fades in.
// Under reduced motion or a hidden tab every entrance is skipped and the page
// simply renders at rest.

import { reducedMotion } from './dom.js';

export const EASE = {
  decel: 'cubic-bezier(.05,.7,.1,1)',      // M3 emphasized decelerate: the house entrance
  accel: 'cubic-bezier(.3,0,.8,.15)',      // M3 emphasized accelerate: exits
  std: 'cubic-bezier(.2,0,0,1)',           // M3 standard
  hingeIn: 'cubic-bezier(.1,.9,.2,1)',     // Metro deceleration
  hingeOut: 'cubic-bezier(.4,0,1,1)',
  leave: 'cubic-bezier(.6,0,.86,.42)',     // turnstile push-away
  quart: 'cubic-bezier(.25,1,.5,1)',       // the wallet's Metro cascade
  reel: 'cubic-bezier(.18,.95,.12,1)',
};

export const skip = () => reducedMotion() || document.hidden;

function play(el, frames, opts) {
  if (!el?.animate) return null;
  try {
    return el.animate(frames, { fill: 'backwards', ...opts });
  } catch {
    return null;
  }
}

/** Opacity that is solid by ~30% of the move: the block arrives, it doesn't fade. */
function early(el, delay, ms = 120) {
  return play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, delay, easing: 'linear' });
}

// ---------------------------------------------------------------------------
// Schools: one way of arriving per page load, never the last load's.

const SCHOOLS = ['panorama', 'turnstile', 'rise', 'hinge'];
let school = null;

export function pickSchool() {
  if (school) return school;
  const forced = new URLSearchParams(location.search).get('school');
  if (forced && SCHOOLS.includes(forced)) return (school = forced);
  let last = null;
  try { last = localStorage.getItem('bp_school'); } catch { /* ignore */ }
  const pool = SCHOOLS.filter((s) => s !== last);
  school = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem('bp_school', school); } catch { /* ignore */ }
  return school;
}

/**
 * Bring a set of blocks in, in reading order, the way this load's school does.
 * `els` is an array (or NodeList) of elements; `delay` offsets the whole run.
 */
export function arrive(els, { delay = 0, school: s = pickSchool(), stagger, cap = 9 } = {}) {
  const list = [...els].filter(Boolean);
  if (skip() || !list.length) return;
  list.forEach((el, i) => {
    const k = Math.min(i, cap);
    const at = delay + k * (stagger ?? (s === 'turnstile' ? 58 : s === 'panorama' ? 50 : 70));
    if (s === 'panorama') {
      play(el, [{ transform: `translateX(${90 + (list.length - k) * 14}px)` }, { transform: 'none' }], { duration: 720, delay: at, easing: EASE.decel });
      early(el, at, 300);
    } else if (s === 'turnstile') {
      el.style.transformOrigin = 'left center';
      play(el, [
        { transform: 'perspective(1400px) rotateY(-76deg)', opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { transform: 'perspective(1400px) rotateY(0)', opacity: 1 },
      ], { duration: 520, delay: at, easing: EASE.hingeIn });
    } else if (s === 'hinge') {
      el.style.transformOrigin = k % 2 ? 'center bottom' : 'left center';
      const from = k % 2 ? 'perspective(1200px) rotateX(-40deg) translateY(18px)' : 'perspective(1200px) translateX(-24px) rotateY(32deg)';
      play(el, [{ transform: from }, { transform: 'none' }], { duration: 560, delay: at, easing: EASE.hingeIn });
      early(el, at, 200);
    } else {
      play(el, [{ transform: 'translateY(26px) scale(.985)' }, { transform: 'none' }], { duration: 620, delay: at, easing: EASE.decel });
      early(el, at, 260);
    }
  });
}

/** The leaving page turns away about the screen's left edge. Resolves when gone. */
export function depart(els, { duration = 300 } = {}) {
  const list = [...els].filter(Boolean).slice(0, 9);
  if (skip() || !list.length) return Promise.resolve();
  const anims = list.map((el, i) => {
    el.style.transformOrigin = `${-el.getBoundingClientRect().left}px 50%`;
    return el.animate([
      { transform: 'perspective(1600px) rotateY(0)', opacity: 1 },
      { opacity: 1, offset: 0.6 },
      { transform: 'perspective(1600px) rotateY(76deg)', opacity: 0 },
    ], { duration, delay: i * 42, easing: EASE.leave, fill: 'forwards' });
  });
  return Promise.all(anims.map((a) => a.finished.catch(() => {})));
}

/** Leaf turn for rows and cards revealed as they scroll in. */
export const LEAF = [
  { opacity: 0, transform: 'perspective(900px) translateX(22px) rotateY(62deg)' },
  { opacity: 1, transform: 'perspective(900px) translateX(0) rotateY(0)' },
];

export function leaf(els, { delay = 0, stagger = 45, cap = 12 } = {}) {
  if (skip()) return;
  [...els].slice(0, 20).forEach((el, i) => {
    el.style.transformOrigin = 'left center';
    play(el, LEAF, { duration: 440, delay: delay + Math.min(i, cap) * stagger, easing: EASE.hingeIn });
  });
}

/** A short rise for small text and figures (text travels 8–14px, never 40). */
export function rise(el, { delay = 0, px = 10, duration = 420 } = {}) {
  if (skip() || !el) return;
  play(el, [{ opacity: 0, transform: `translateY(${px}px)` }, { opacity: 1, transform: 'none' }], { duration, delay, easing: EASE.hingeIn });
}

const seen = new WeakSet();
let io = null;
/**
 * Reveal [data-reveal] children of `root` as they scroll in, each group once.
 * data-reveal="rows" leaf-turns the group's direct children; anything else rises.
 */
export function revealOnScroll(root) {
  if (skip() || !('IntersectionObserver' in window)) return;
  io ||= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      io.unobserve(el);
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.dataset.reveal === 'rows') leaf(el.children);
      else rise(el, { px: 14, duration: 500 });
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  for (const el of root.querySelectorAll('[data-reveal]')) {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.92) continue; // already on screen: the page entrance covers it
    io.observe(el);
  }
}

// ---------------------------------------------------------------------------
// Hinge letters: a title's letters swing in about their left edge.

export function hingeText(el, text = el.textContent, { delay = 100, step = 20 } = {}) {
  el.textContent = '';
  el.setAttribute('aria-label', text);
  let n = 0;
  const letters = [];
  for (const word of text.split(/(\s+)/)) {
    if (/^\s+$/.test(word)) { el.append(word); continue; }
    const w = document.createElement('span');
    w.className = 'hinge-word';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const l = document.createElement('span');
      l.className = 'hinge-letter';
      l.textContent = ch;
      w.append(l);
      letters.push([l, n++]);
    }
    el.append(w);
  }
  if (skip()) return;
  play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay, easing: EASE.hingeOut });
  for (const [l, i] of letters) {
    play(l, [
      { transform: 'perspective(600px) translateX(-10px) rotateY(-84deg)' },
      { transform: 'perspective(600px) translateX(0) rotateY(0)' },
    ], { duration: 520, delay: delay + i * step, easing: EASE.hingeIn });
  }
}

// ---------------------------------------------------------------------------
// Container transform: a surface grows out of the control that opened it.

function boxTransform(from, to) {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${Math.max(0.02, from.width / to.width)}, ${Math.max(0.02, from.height / to.height)})`;
}

export function morphOpen(card, origin, { duration = 650 } = {}) {
  if (skip()) return Promise.resolve();
  const to = card.getBoundingClientRect();
  const from = origin?.getBoundingClientRect?.() || origin;
  const frames = from && from.width
    ? [{ transform: boxTransform(from, to), opacity: 0.4 }, { opacity: 1, offset: 0.3 }, { transform: 'none', opacity: 1 }]
    : [{ transform: 'translateY(40px) scale(.96)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'none', opacity: 1 }];
  const a = play(card, frames, { duration, easing: EASE.std });
  return a ? a.finished.catch(() => {}) : Promise.resolve();
}

export function morphClose(card, origin, { duration = 420 } = {}) {
  if (skip()) return Promise.resolve();
  const to = card.getBoundingClientRect();
  const from = origin?.isConnected ? origin.getBoundingClientRect() : null;
  const frames = from && from.width
    ? [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.25 }, { transform: boxTransform(from, to), opacity: 0 }]
    : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(24px) scale(.97)', opacity: 0 }];
  const a = card.animate(frames, { duration, easing: from ? EASE.std : EASE.accel, fill: 'forwards' });
  return a.finished.catch(() => {});
}

export function fadeIn(el, { duration = 200, delay = 0 } = {}) {
  if (skip()) return;
  play(el, [{ opacity: 0 }, { opacity: 1 }], { duration, delay, easing: 'linear' });
}
export function fadeOut(el, { duration = 200 } = {}) {
  if (skip()) return Promise.resolve();
  return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE.hingeOut, fill: 'forwards' }).finished.catch(() => {});
}

// ---------------------------------------------------------------------------
// The error language: the rule draws, the words hinge in, ONE shake.

export function errorIn(box) {
  if (skip() || !box) return;
  const rule = box.querySelector('.m-err__rule');
  const msg = box.querySelector('.m-err__msg');
  if (rule) play(rule, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 240, easing: EASE.std });
  if (msg) {
    msg.style.transformOrigin = 'left center';
    play(msg, [{ opacity: 0, transform: 'perspective(600px) rotateY(-70deg)' }, { opacity: 1, transform: 'perspective(600px) rotateY(0)' }], { duration: 300, delay: 50, easing: EASE.hingeIn });
  }
  shake(box);
}

export function shake(el) {
  if (skip() || !el) return;
  el.animate([
    { transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(0)', offset: 0.4 },
    { transform: 'translateX(-5px)', offset: 0.52 }, { transform: 'translateX(4px)', offset: 0.64 },
    { transform: 'translateX(-2px)', offset: 0.76 }, { transform: 'translateX(1px)', offset: 0.88 },
    { transform: 'translateX(0)', offset: 1 },
  ], { duration: 500, easing: 'ease-in-out' });
}

// ---------------------------------------------------------------------------
// Number reels: a figure's digits spin into place (BEAR Swap's RollingFigure).

export function roll(el, text, { spins = 1, step = 55 } = {}) {
  const value = String(text);
  if (skip() || el.dataset.rolled === value) {
    el.textContent = value;
    el.dataset.rolled = value;
    return;
  }
  el.dataset.rolled = value;
  el.textContent = '';
  el.classList.add('reel');
  el.setAttribute('aria-label', value);
  let k = 0;
  for (const ch of value) {
    if (!/\d/.test(ch)) {
      const s = document.createElement('span');
      s.textContent = ch;
      s.setAttribute('aria-hidden', 'true');
      el.append(s);
      play(s, [{ opacity: 0, transform: 'translateY(.35em)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 200, easing: EASE.decel });
      continue;
    }
    const d = Number(ch);
    const box = document.createElement('span');
    box.className = 'reel__d';
    box.setAttribute('aria-hidden', 'true');
    const ghost = document.createElement('span');
    ghost.className = 'reel__ghost';
    ghost.textContent = ch;
    const col = document.createElement('span');
    col.className = 'reel__col';
    const rows = (spins + Math.min(k, 2)) * 10 + d + 1;
    for (let i = 0; i < rows; i++) {
      const s = document.createElement('span');
      s.textContent = String(i % 10);
      col.append(s);
    }
    box.append(ghost, col);
    el.append(box);
    col.style.transform = `translateY(${-((rows - 1) / rows) * 100}%)`;
    play(col, [{ transform: 'translateY(0)' }, { transform: `translateY(${-((rows - 1) / rows) * 100}%)` }], {
      duration: 700 + k * step * 2.2, easing: EASE.reel,
    });
    k++;
  }
}

// ---------------------------------------------------------------------------
// Gold flood: quiet glass that floods gold from where the pointer came in.

export function flood(btn) {
  let t = 0;
  btn.classList.add('flood');
  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(t);
    if (!btn.hasAttribute('data-on')) {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      btn.style.setProperty('--fx', `${x}px`);
      btn.style.setProperty('--fy', `${y}px`);
      btn.style.setProperty('--fr', `${1.12 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y))}px`);
    }
    btn.setAttribute('data-on', '');
  });
  btn.addEventListener('pointerleave', () => { t = setTimeout(() => btn.removeAttribute('data-on'), 60); });
  btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) btn.setAttribute('data-on', ''); });
  btn.addEventListener('blur', () => btn.removeAttribute('data-on'));
  return btn;
}

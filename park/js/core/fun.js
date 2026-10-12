// BEAR Park's fun layer — the life the old cartoon park had, in the Metro house
// style:
//
//   bearCity(stage)        BEARs that stroll the park art, pause, and wave when
//                          tapped or hovered ("gm!", "BEAR!", "honey?")
//   jester()               the Jester runs across the screen dropping honey
//   secretTaps(el, n, fn)  the 5-tap trigger (the landing sign, the header logo)
//   celebrate({ kind })    a burst of honey hexes / BEAR coins when you win
//   floatHeads(tile)       BEAR heads drifting behind Friends' hero tile
//   liveTile(tile)         Windows Phone live-tile flips on Home
//   surprise({ choices })  "Where would you like to go?" — a reel that picks
//   gameReturn({ wallet }) "+N honey from that run" when you're back from a game
//
// The rules it keeps (park/DESIGN.md): transform and opacity only, WAAPI and a
// few CSS loops, a handful of elements. Everything stops while the tab is hidden,
// while its stage is off screen or under the header, and while a dialog covers
// the page (re-blurring moving art under a frosted scrim costs every frame).
// Under reduced motion nothing walks, floats or flips; taps still answer. Every
// layer is pointer-events: none except the characters themselves, which only
// live where no control is. Styles: /park/css/fun.css.

import { h, icon, reducedMotion } from './dom.js';
import { EASE, roll } from './motion.js';
import { toast } from './ui.js';
import { points, honeyChanged } from './data.js';
import { num } from './format.js';
import { ART, CITY, JESTER, HEADS, GAMES } from './art.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const still = () => reducedMotion();
const phone = () => innerWidth < 640;
const hdrH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 56;
const covered = () => document.documentElement.classList.contains('covered');

// ---------------------------------------------------------------------------
// When is a stage worth animating? On screen (below the header), the tab
// visible, and no dialog over the page.

const coverFns = new Set();
let coverMo = null;
function watchCover(fn, signal) {
  if (!coverMo) {
    coverMo = new MutationObserver(() => { for (const f of [...coverFns]) f(); });
    coverMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  coverFns.add(fn);
  signal?.addEventListener('abort', () => coverFns.delete(fn), { once: true });
}

function whenActive(el, onChange, signal, threshold = 0) {
  let seen = false;
  let on = false;
  const sync = () => {
    const now = seen && !document.hidden && !covered();
    if (now !== on) { on = now; onChange(now); }
  };
  const io = new IntersectionObserver((entries) => { seen = entries[entries.length - 1].isIntersecting; sync(); },
    { threshold, rootMargin: `-${hdrH()}px 0px 0px 0px` });
  io.observe(el);
  document.addEventListener('visibilitychange', sync, signal ? { signal } : undefined);
  watchCover(sync, signal);
  signal?.addEventListener('abort', () => { io.disconnect(); if (on) { on = false; onChange(false); } }, { once: true });
}

// ---------------------------------------------------------------------------
// Speech bubbles (Bear City, the Jester): the park's inked cartoon type.

const SAYS = ['gm!', 'BEAR!', 'honey?', 'gm fren', 'LFG!', 'wen raid?', 'hi!', 'stay BEARish'];
let lastSay = '';
function nextSay() {
  const text = pick(SAYS.filter((s) => s !== lastSay));
  lastSay = text;
  return text;
}

function speak(bubble, text, { ms = 1500, shift = 0 } = {}) {
  bubble.textContent = text;
  bubble.style.setProperty('--sx', `${shift}px`);
  bubble.hidden = false;
  bubble.getAnimations().forEach((a) => a.cancel());
  clearTimeout(bubble._t);
  if (!still()) bubble.animate([{ opacity: 0, transform: 'translateY(6px) scale(.86)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE.decel });
  bubble._t = setTimeout(async () => {
    if (!still()) await bubble.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 200, easing: EASE.accel, fill: 'forwards' }).finished.catch(() => {});
    bubble.hidden = true;
    bubble.getAnimations().forEach((a) => a.cancel());
  }, ms);
}

// ---------------------------------------------------------------------------
// Bear City: BEARs strolling on the park art.

/**
 * The grass of the park panorama (ART.park, 4096×1024, object-fit: cover,
 * centred) inside a W×H stage: x from the panorama's `from` fraction — left of
 * ~0.35 is the lake, and BEARs don't walk on water — to the right edge.
 */
export const parkGround = (from = 0.36) => (W, H) => {
  const iw = 4096 * Math.max(W / 4096, H / 1024);
  return [Math.max(6, (W - iw) / 2 + iw * from), W - 6];
};

/**
 * bearCity(stage, { count, feet: [nearPx, farPx], size: [farPx, nearPx], lane, exits, signal })
 * `stage` is a positioned, clipped box of park art (a .park-band). The BEARs
 * walk its bottom strip: `feet` is how far above its bottom edge they stand
 * (near → far), `size` their height (far → near), `lane(width)` the x range
 * they keep to (the park's grass by default). With `exits` a BEAR now and then
 * walks off an edge and a different one walks in.
 */
export function bearCity(stage, { count = 5, feet = [10, 26], size = [48, 64], lane = parkGround(), exits = true, signal } = {}) {
  const calm = still();
  const layer = h('div.city', { 'aria-hidden': 'true' });
  stage.append(layer);
  const cast = shuffle(CITY);
  const bears = [];
  let W = 0;
  let H = 0;
  let active = false;

  const range = (b) => {
    const [x0, x1] = lane?.(W, H) || [6, W - 6];
    return [x0, Math.max(x0, x1 - b.w)];
  };
  const place = (b, x) => { b.x = x; b.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`; };
  const face = (b, dir) => { b.dir = dir; b.el.dataset.face = dir < 0 ? 'left' : 'right'; };
  /** Where a BEAR is right now, mid-walk or not. */
  const nowX = (b) => {
    const a = b.anim;
    if (!a || !b.dur) return b.x;
    const t = Math.min(1, Math.max(0, (Number(a.currentTime) || 0) / b.dur));
    return b.from + (b.x - b.from) * t;
  };

  function setSprite(b, spr) {
    b.spr = spr;
    b.w = Math.round((spr.w * b.hh) / spr.h);
    b.img.src = spr.src;
    b.img.width = b.w;
    b.img.height = b.hh;
    b.el.style.width = `${b.w}px`;
  }

  function make(depth) {
    const hh = Math.round(size[0] + (size[1] - size[0]) * depth);
    const img = h('img', { alt: '', decoding: 'async', draggable: false });
    const say = h('span.city-say', { hidden: true });
    const el = h('span.city-bear', {
      style: { height: `${hh}px`, bottom: `${Math.round(feet[1] - (feet[1] - feet[0]) * depth)}px`, zIndex: String(1 + Math.round(depth * 8)) },
    }, img, say);
    const b = { el, img, say, hh, w: 0, x: 0, from: 0, dur: 0, dir: 1, anim: null, timer: 0, waving: false, hoverAt: 0, exiting: false };
    el.addEventListener('click', () => wave(b));
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || Date.now() - b.hoverAt < 2600) return;
      b.hoverAt = Date.now();
      wave(b);
    });
    layer.append(el);
    return b;
  }

  function idle(b) {
    clearTimeout(b.timer);
    b.timer = 0;
    if (!active || b.waving) return;
    b.timer = setTimeout(() => { b.timer = 0; decide(b); }, rand(1400, 4800));
  }

  function decide(b) {
    if (!active || b.waving) return;
    const [x0, x1] = range(b);
    const r = Math.random();
    if (exits && r < 0.12) {
      // off an open edge (never back across the lake)
      b.exiting = true;
      walk(b, b.dir > 0 || x0 > 10 ? W + 24 : -b.w - 24);
    } else if (r < 0.26) {
      face(b, -b.dir); // a look the other way
      idle(b);
    } else {
      let dir = Math.random() < 0.65 ? b.dir : -b.dir;
      let to = b.x + dir * rand(60, 240);
      if (to < x0 || to > x1) { dir = -dir; to = b.x + dir * rand(60, 240); }
      walk(b, Math.min(x1, Math.max(x0, to)));
    }
  }

  function walk(b, to, speed = rand(24, 38)) {
    const from = nowX(b);
    b.anim?.cancel();
    const dist = Math.abs(to - from);
    if (dist < 6) { b.anim = null; place(b, from); idle(b); return; }
    face(b, to > from ? 1 : -1);
    b.from = from;
    b.dur = (dist / speed) * 1000;
    place(b, to);
    b.el.classList.add('is-walking');
    const a = b.el.animate([{ transform: `translate3d(${from.toFixed(1)}px,0,0)` }, { transform: `translate3d(${to.toFixed(1)}px,0,0)` }], { duration: b.dur, easing: 'linear' });
    b.anim = a;
    a.onfinish = () => {
      if (b.anim !== a) return;
      b.anim = null;
      b.el.classList.remove('is-walking');
      if (b.exiting) enter(b); else idle(b);
    };
    if (!active || b.waving) a.pause();
  }

  /** A different BEAR walks in from one side. */
  function enter(b) {
    b.exiting = false;
    const out = new Set(bears.map((x) => x.spr));
    setSprite(b, pick(CITY.filter((s) => !out.has(s))) || b.spr);
    const [x0, x1] = range(b);
    const left = x0 <= 10 && Math.random() < 0.5;
    place(b, left ? -b.w - 16 : W + 16);
    const go = () => walk(b, left ? rand(x0, x0 + (x1 - x0) * 0.45) : rand(x0 + (x1 - x0) * 0.55, x1));
    b.img.decode?.().then(go, go) ?? go();
  }

  function wave(b) {
    if (b.waving) return;
    b.waving = true;
    clearTimeout(b.timer);
    b.timer = 0;
    b.anim?.pause();
    b.el.classList.remove('is-walking');
    // keep the bubble inside the stage
    const text = nextSay();
    const cx = nowX(b) + b.w / 2;
    b.say.textContent = text;
    b.say.hidden = false;
    const bw = b.say.offsetWidth || 60;
    const left = Math.min(Math.max(4, cx - bw / 2), W - bw - 4);
    speak(b.say, text, { shift: Math.round(left - (cx - bw / 2)) });
    const done = () => {
      b.waving = false;
      if (b.anim) { b.el.classList.add('is-walking'); if (active) b.anim.play(); } else idle(b);
    };
    if (calm) { setTimeout(done, 1500); return; }
    b.img.animate([
      { transform: 'translateY(0) rotate(0deg)', easing: 'cubic-bezier(.2,.7,.3,1)' },
      { transform: 'translateY(-14px) rotate(-7deg)', offset: 0.28, easing: 'cubic-bezier(.5,0,.8,.4)' },
      { transform: 'translateY(0) rotate(5deg)', offset: 0.52, easing: 'ease-in-out' },
      { transform: 'translateY(0) rotate(-3deg)', offset: 0.75, easing: 'ease-in-out' },
      { transform: 'translateY(0) rotate(0deg)' },
    ], { duration: 860 }).finished.then(done, done);
  }

  function setActive(on) {
    active = on && !calm;
    layer.classList.toggle('is-paused', !active);
    for (const b of bears) {
      if (active) {
        if (b.waving) continue;
        if (b.anim) b.anim.play(); else if (!b.timer) idle(b);
      } else {
        b.anim?.pause();
        clearTimeout(b.timer);
        b.timer = 0;
      }
    }
  }

  // First layout places the cast; later resizes keep everyone inside the lane.
  const ro = new ResizeObserver(() => {
    const w = stage.clientWidth;
    if (!w || (w === W && stage.clientHeight === H)) return;
    const first = !W;
    W = w;
    H = stage.clientHeight;
    if (first) {
      const depths = shuffle(Array.from({ length: count }, (_, i) => (count > 1 ? i / (count - 1) : 1)));
      const slots = shuffle(Array.from({ length: count }, (_, i) => i));
      depths.forEach((d, i) => {
        const b = make(d);
        setSprite(b, cast[i % cast.length]);
        const [x0, x1] = range(b);
        place(b, x0 + (x1 - x0) * ((slots[i] + rand(0.15, 0.85)) / count));
        face(b, Math.random() < 0.5 ? -1 : 1);
        bears.push(b);
      });
      whenActive(stage, setActive, signal);
      return;
    }
    for (const b of bears) {
      const x = nowX(b);
      b.anim?.cancel();
      b.anim = null;
      b.exiting = false;
      b.el.classList.remove('is-walking');
      const [x0, x1] = range(b);
      place(b, Math.min(x1, Math.max(x0, x)));
      if (!b.waving) idle(b);
    }
  });
  ro.observe(stage);
  signal?.addEventListener('abort', () => {
    ro.disconnect();
    for (const b of bears) { b.anim?.cancel(); clearTimeout(b.timer); clearTimeout(b.say._t); }
  }, { once: true });
  return layer;
}

// ---------------------------------------------------------------------------
// Secret taps and the Jester

/** Run `fn` when `el` is tapped `n` times, each within `within` ms of the last. */
export function secretTaps(el, n, fn, { within = 1800 } = {}) {
  let count = 0;
  let t = 0;
  el.addEventListener('click', () => {
    count += 1;
    clearTimeout(t);
    t = setTimeout(() => { count = 0; }, within);
    // A small press: `scale` composes with the element's own transform (the sign's tilt).
    if (!still()) el.animate([{ scale: '.9' }, { scale: '1' }], { duration: 240, easing: EASE.decel });
    if (count >= n) { count = 0; clearTimeout(t); fn(); }
  });
  return el;
}

let jesterOn = false;
/** The Jester BEAR runs across the screen, hops, and drops honey. One at a time. */
export function jester() {
  if (jesterOn || document.hidden) return;
  jesterOn = true;
  const W = innerWidth;
  const H = innerHeight;
  const hh = phone() ? 150 : 206;
  const w = Math.round((JESTER.w * hh) / JESTER.h);
  const ltr = Math.random() < 0.7;
  const img = h('img.fun-jester__img', { src: JESTER.src, alt: '', width: w, height: hh, decoding: 'async', draggable: false });
  const say = h('span.city-say.fun-jester__say', { hidden: true });
  const hop = h('div.fun-jester__hop', img, say);
  const big = h('div.fun-jester__big', hop);
  const run = h('div.fun-jester__run', { style: { width: `${w}px`, height: `${hh}px` } }, big);
  const layer = h('div.fun-jester', { 'aria-hidden': 'true' }, run);
  img.style.setProperty('--lean', `${ltr ? 7 : -7}deg`);
  if (!ltr) img.style.scale = '-1 1';
  document.body.append(layer);
  let ended = false;
  const end = () => { if (ended) return; ended = true; layer.remove(); jesterOn = false; };

  if (still()) {
    // No running under reduced motion: he steps into the corner and says hi.
    run.style.transform = `translateX(${W - w - 20}px)`;
    speak(say, 'You found me!', { ms: 2200 });
    setTimeout(end, 2600);
    return;
  }

  const from = ltr ? -w - 40 : W + 40;
  const to = ltr ? W + 40 : -w - 40;
  const dur = 1800 + W * 1.05;
  const xAt = (t) => from + (to - from) * Math.min(1, Math.max(0, t / dur));
  run.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: dur, easing: 'linear', fill: 'both' });
  hop.animate([
    { transform: 'translateY(0)', easing: 'cubic-bezier(.2,.6,.4,1)' },
    { transform: 'translateY(-15px)', offset: 0.5, easing: 'cubic-bezier(.6,0,.8,.4)' },
    { transform: 'translateY(0)' },
  ], { duration: 330, iterations: Math.ceil(dur / 330) });
  // one big hop arc in the middle of the run
  big.animate([
    { transform: 'translateY(0)', easing: 'cubic-bezier(.15,.65,.35,1)' },
    { transform: `translateY(${phone() ? -56 : -84}px)`, offset: 0.5, easing: 'cubic-bezier(.65,0,.85,.35)' },
    { transform: 'translateY(0)' },
  ], { duration: 720, delay: dur * 0.44 });
  setTimeout(() => speak(say, 'Honey for all!', { ms: dur * 0.36 }), dur * 0.3);

  // Honey hexes tumble from his hands and settle on the ground, then fade.
  const ground = H * 0.86;
  const hand = ground - hh * 0.5;
  for (let k = 0; k < 6; k++) {
    const t = dur * (0.16 + k * 0.13);
    setTimeout(() => {
      if (ended) return;
      const s = rand(12, 18);
      const hex = h('i.fun-hex', { style: { left: `${xAt(t) + w / 2}px`, top: `${hand}px`, width: `${s}px`, height: `${s}px`, backgroundColor: pick(HONEY) } });
      layer.append(hex);
      const dx = (ltr ? -1 : 1) * rand(8, 36);
      const fall = ground - hand - s / 2 + rand(-6, 8);
      hex.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(.6)', opacity: 0, easing: 'cubic-bezier(.45,0,.9,.55)' },
        { opacity: 1, offset: 0.08 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${fall}px) rotate(${rand(-160, 160)}deg) scale(1)`, opacity: 1, offset: 0.45, easing: 'linear' },
        { transform: `translate(-50%,-50%) translate(${dx}px,${fall}px) rotate(${rand(-160, 160)}deg) scale(1)`, opacity: 1, offset: 0.8 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${fall}px) scale(.9)`, opacity: 0 },
      ], { duration: 1500, fill: 'both' });
    }, t);
  }
  setTimeout(end, dur + 1700);
}

// ---------------------------------------------------------------------------
// Celebrations

const HONEY = ['#ffd65a', '#edb723', '#f5c542', '#e3a50b'];
const BURST = {
  honey: HONEY,
  raid: ['#edb723', '#ffd65a', '#f5c542', '#8b5cf6', '#a78bfa', '#7b1ff0'],
  bear: HONEY,
  purchase: ['#7b1ff0', '#a78bfa', '#feb501', '#ffd65a', '#07ae08', '#34d058'],
};
const UNITS = { honey: 'HONEY', raid: 'HONEY', bear: '$BEAR', purchase: '' };

function pointOf(origin) {
  const el = typeof origin === 'function' ? origin() : origin;
  const r = el?.getBoundingClientRect?.();
  let x = innerWidth / 2;
  let y = innerHeight * 0.42;
  if (r && (r.width || r.height) && r.bottom > 0 && r.top < innerHeight) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
  else if (el && Number.isFinite(el.x) && Number.isFinite(el.y) && !r) { x = el.x; y = el.y; }
  return { x: Math.min(Math.max(x, 40), innerWidth - 40), y: Math.min(Math.max(y, 90), innerHeight - 70) };
}

/**
 * celebrate({ kind: 'honey'|'bear'|'raid'|'purchase', amount, origin, unit })
 * Honey hexes (or BEAR coins) radiate from `origin` (an element, a function
 * returning one, or {x, y}) and settle; with an `amount`, "+N" rolls up above
 * it. About 1.4 s, then the layer is gone. Leave `amount` out when the origin
 * already shows the number. Under reduced motion it does nothing — pair it with
 * a toast.
 */
export function celebrate({ kind = 'honey', amount = null, origin = null, unit } = {}) {
  if (still() || document.hidden) return null;
  const at = pointOf(origin);
  const layer = h('div.fun-burst', { 'aria-hidden': 'true' });
  document.body.append(layer);
  const colors = BURST[kind] || BURST.honey;
  const n = phone() ? 10 : 14;
  const anims = [];

  const ring = h('i.fun-ring', { style: { left: `${at.x}px`, top: `${at.y}px` } });
  layer.append(ring);
  anims.push(ring.animate([{ transform: 'scale(.2)', opacity: 0.85 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 640, easing: EASE.decel, fill: 'both' }));

  for (let i = 0; i < n; i++) {
    const coin = kind === 'bear' && i % 3 !== 2;
    const s = Math.round(coin ? rand(20, 28) : rand(10, 20));
    const bit = coin
      ? h('img.fun-bit.fun-bit--coin', { src: ART.coin, alt: '', width: s, height: s, decoding: 'async' })
      : h('i.fun-bit.fun-hex', { style: { backgroundColor: pick(colors) } });
    Object.assign(bit.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${s}px`, height: `${s}px` });
    layer.append(bit);
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + rand(-0.26, 0.26);
    const r = phone() ? rand(50, 96) : rand(66, 128);
    const x1 = Math.cos(a) * r;
    const y1 = Math.sin(a) * r - 16;
    const x2 = x1 * 1.12;
    const y2 = y1 + rand(38, 76);
    const rot = rand(-150, 150);
    anims.push(bit.animate([
      { transform: 'translate(-50%,-50%) translate(0,0) rotate(0deg) scale(.3)', opacity: 0, easing: EASE.decel },
      { opacity: 1, offset: 0.1 },
      { transform: `translate(-50%,-50%) translate(${x1}px,${y1}px) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.42, easing: 'cubic-bezier(.45,0,.85,.5)' },
      { opacity: 1, offset: 0.7 },
      { transform: `translate(-50%,-50%) translate(${x2}px,${y2}px) rotate(${rot}deg) scale(.85)`, opacity: 0 },
    ], { duration: rand(1150, 1400), delay: rand(0, 70), fill: 'both' }));
  }

  const value = Number(amount);
  if (amount != null && Number.isFinite(value) && value > 0) {
    const fig = h('span.fun-amount__fig.num');
    const u = unit ?? UNITS[kind];
    const tag = h('div.fun-amount', { style: { left: `${at.x}px`, top: `${at.y}px` } }, fig, u ? h('span.fun-amount__unit', u) : null);
    layer.append(tag);
    roll(fig, `+${num(value, value % 1 ? (kind === 'bear' ? 2 : 1) : 0)}`);
    anims.push(tag.animate([
      { transform: 'translateY(12px)', opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { transform: 'translateY(-30px)', opacity: 1, offset: 0.74 },
      { transform: 'translateY(-40px)', opacity: 0 },
    ], { duration: 1650, easing: EASE.decel, fill: 'both' }));
  }

  let gone = false;
  const done = () => { if (!gone) { gone = true; layer.remove(); } };
  Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(done);
  setTimeout(done, 2600);
  return layer;
}

// ---------------------------------------------------------------------------
// Floating BEAR heads (Community → Friends)

// [x %, y %, size px]: a loose cluster on the tile's right half, clear of its words.
const SLOTS = [[56, 27, 42], [70, 13, 48], [85, 21, 36], [61, 66, 34], [96, 8, 26], [63, 92, 24]];

/** A light cluster of BEAR heads drifting behind a tile's content. Tap one for the next face. */
export function floatHeads(tile, { count = phone() ? 5 : 6, signal } = {}) {
  const calm = still();
  const layer = h('div.heads', { 'aria-hidden': 'true' });
  tile.prepend(layer); // first, so the mascot and the words paint over it
  const pool = shuffle(HEADS);
  let timer = 0;
  let active = false;
  let lastSwap = null;

  const heads = SLOTS.slice(0, count).map(([x, y, s], k) => {
    const img = h('img', { src: pool[k].src, alt: '', width: s, height: s, loading: 'lazy', decoding: 'async', draggable: false });
    const el = h('span.head', { style: { left: `${x}%`, top: `${y}%`, width: `${s}px`, height: `${s}px`, rotate: `${rand(-14, 14).toFixed(1)}deg` } }, img);
    layer.append(el);
    const head = { el, img, spr: pool[k], drift: null };
    if (!calm) {
      head.drift = el.animate([
        { transform: 'translate(0,0) rotate(0deg)' },
        { transform: `translate(${rand(-9, 9).toFixed(1)}px,${rand(-11, -4).toFixed(1)}px) rotate(${rand(-9, 9).toFixed(1)}deg)` },
      ], { duration: rand(4200, 7200), delay: -rand(0, 4000), direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
      head.drift.pause();
    }
    el.addEventListener('click', () => swap(head));
    return head;
  });

  async function swap(head) {
    if (head.busy) return;
    head.busy = true;
    lastSwap = head;
    const out = new Set(heads.map((x) => x.spr));
    const next = pick(HEADS.filter((s) => !out.has(s))) || head.spr;
    const pre = new Image();
    pre.src = next.src;
    await pre.decode?.().catch(() => {});
    if (!calm) await head.img.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.5) rotate(-20deg)' }], { duration: 200, easing: EASE.accel, fill: 'forwards' }).finished.catch(() => {});
    head.spr = next;
    head.img.src = next.src;
    head.img.getAnimations().forEach((a) => a.cancel());
    if (!calm) head.img.animate([{ opacity: 0, transform: 'scale(.55) rotate(16deg)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE.decel });
    head.busy = false;
  }

  function cycle() {
    clearTimeout(timer);
    if (!active) return;
    timer = setTimeout(() => {
      swap(pick(heads.filter((x) => x !== lastSwap)) || heads[0]);
      cycle();
    }, rand(3800, 6200));
  }

  if (!calm) {
    whenActive(tile, (on) => {
      active = on;
      for (const x of heads) { if (on) x.drift?.play(); else x.drift?.pause(); }
      if (on) cycle(); else clearTimeout(timer);
    }, signal);
  }
  signal?.addEventListener('abort', () => { clearTimeout(timer); heads.forEach((x) => x.drift?.cancel()); }, { once: true });
  return layer;
}

// ---------------------------------------------------------------------------
// Live tiles (Home): Windows Phone flips, one tile at a time.

let lastFlip = 0;

/**
 * liveTile(tile, { live, faces, ready, onShow, every, delay, signal })
 * `live` is the tile's inner wrapper and `faces` its children, stacked in one
 * grid cell (so the tile never changes height). Every `every` ms (± a little)
 * it flips to the next face that is `ready` — only while the tile is on
 * screen, not hovered or focused, and never within 1.5 s of another tile.
 */
export function liveTile(tile, { live, faces, ready = [], onShow, every = 7000, delay = 3000, signal } = {}) {
  faces.forEach((f, k) => { f.classList.add('live__face'); if (k) hide(f); });
  if (still() || faces.length < 2) return;
  let i = 0;
  let timer = 0;
  let hover = false;
  let focus = false;
  let seen = false;
  const opts = signal ? { signal } : undefined;
  const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.6, rootMargin: `-${hdrH()}px 0px 0px 0px` });
  io.observe(tile);
  tile.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; }, opts);
  tile.addEventListener('pointerleave', () => { hover = false; }, opts);
  tile.addEventListener('focusin', () => { focus = true; }, opts);
  tile.addEventListener('focusout', () => { focus = false; }, opts);

  function hide(f) { f.setAttribute('aria-hidden', 'true'); f.inert = true; }
  function show(f) { f.removeAttribute('aria-hidden'); f.inert = false; }

  async function flip(next) {
    const out = live.animate([
      { transform: 'perspective(640px) rotateX(0deg)', opacity: 1 },
      { transform: 'perspective(640px) rotateX(86deg)', opacity: 0.25 },
    ], { duration: 230, easing: EASE.accel, fill: 'forwards' });
    await out.finished.catch(() => {});
    hide(faces[i]);
    show(faces[next]);
    i = next;
    onShow?.(next);
    live.animate([
      { transform: 'perspective(640px) rotateX(-86deg)', opacity: 0.25 },
      { transform: 'perspective(640px) rotateX(0deg)', opacity: 1 },
    ], { duration: 420, easing: EASE.decel, fill: 'backwards' });
    out.cancel();
  }

  function tick() {
    const quiet = seen && !hover && !focus && !document.hidden && !covered();
    const gap = Date.now() - lastFlip;
    if (!quiet) { timer = setTimeout(tick, 1600); return; }
    if (gap < 1500) { timer = setTimeout(tick, 1500 - gap + rand(200, 700)); return; }
    let next = (i + 1) % faces.length;
    for (let k = 0; k < faces.length && next !== 0 && ready[next] && !ready[next](); k++) next = (next + 1) % faces.length;
    if (next !== i) { lastFlip = Date.now(); flip(next); }
    timer = setTimeout(tick, every + rand(-900, 900));
  }
  timer = setTimeout(tick, delay);
  signal?.addEventListener('abort', () => { clearTimeout(timer); io.disconnect(); }, { once: true });
}

// ---------------------------------------------------------------------------
// "Where would you like to go?" — a reel of the park's places that lands on one.

/**
 * surprise({ choices }) → a quiet button. `choices()` returns
 * [{ label, go, weight }] at tap time (weights from live data: a raid that's
 * live, a drop that's ready). The label reels through places and lands on the
 * pick, then goes there.
 */
export function surprise({ choices, label = 'Surprise me', all = [] }) {
  const col = h('span.where__col', h('span', label), all.map((t) => h('span', { 'aria-hidden': 'true' }, t)));
  const status = h('span.sr-only', { role: 'status' });
  const btn = h('button.btn.btn--sm.where', { type: 'button', 'aria-label': `${label}: take me somewhere in the park` }, icon('sparkle'), h('span.where__reel', col), status);
  let spinning = false;
  btn.addEventListener('click', async () => {
    if (spinning) return;
    const list = (choices() || []).filter((c) => c && c.weight > 0);
    if (!list.length) return;
    spinning = true;
    let roll_ = Math.random() * list.reduce((s, c) => s + c.weight, 0);
    const choice = list.find((c) => (roll_ -= c.weight) <= 0) || list[list.length - 1];
    status.textContent = `Off to ${choice.label}`;
    const words = [label, ...shuffle(list.filter((c) => c !== choice)).slice(0, 6).map((c) => c.label), choice.label];
    col.replaceChildren(...words.map((t, k) => h('span', k ? { 'aria-hidden': 'true' } : {}, t)), ...all.map((t) => h('span.where__ghost', { 'aria-hidden': 'true' }, t)));
    if (!still()) {
      const pct = ((words.length - 1) / (words.length + all.length)) * 100;
      const spin = col.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${pct}%)` }], { duration: 1150, easing: EASE.reel, fill: 'forwards' });
      // a stalled frame clock (hidden tab) must never strand the tap
      await Promise.race([spin.finished.catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
      spin.finish();
    }
    btn.classList.add('is-picked');
    await new Promise((r) => setTimeout(r, still() ? 120 : 360));
    choice.go();
    // Coming back to this page (a game, the back button): ready for another spin.
    setTimeout(() => {
      spinning = false;
      btn.classList.remove('is-picked');
      col.getAnimations().forEach((a) => a.cancel());
      col.replaceChildren(h('span', label), all.map((t) => h('span', { 'aria-hidden': 'true' }, t)));
    }, 1200);
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Back from a game: "+N honey from that run".

const LEFT = 'bp:left-for-game';
let linksWatched = false;

/** Remember the honey you had as you leave for a game (links do this by themselves). */
export function leaveForGame(wallet, gameId) {
  const v = points(wallet).get().value;
  if (v?.total_points == null) return;
  try { sessionStorage.setItem(LEFT, JSON.stringify({ w: wallet, total: Number(v.total_points), at: Date.now(), game: gameId })); } catch { /* private mode */ }
}

function watchGameLinks(wallet) {
  if (linksWatched) return;
  linksWatched = true;
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    let u;
    try { u = new URL(a.href, location.href); } catch { return; }
    if (u.origin !== location.origin) return;
    const g = GAMES.find((x) => u.pathname === x.path || u.pathname.startsWith(`${x.path}/`) || u.pathname === `${x.path}.html`);
    if (g) leaveForGame(wallet, g.id);
  }, true);
}

/**
 * On a page you land on after a game (Home, Play): if your honey went up while
 * you were away, a toast says by how much and honey bursts from `origin`.
 * Checks on arrival, on a back-forward restore and when the tab comes back.
 */
export function gameReturn({ wallet, origin = null, signal } = {}) {
  if (!wallet) return;
  watchGameLinks(wallet);
  let busy = false;
  const check = async () => {
    if (busy || document.hidden || signal?.aborted) return;
    let rec = null;
    try { rec = JSON.parse(sessionStorage.getItem(LEFT) || 'null'); } catch { rec = null; }
    if (!rec) return;
    const forget = () => { try { sessionStorage.removeItem(LEFT); } catch { /* ignore */ } };
    if (rec.w !== wallet || !(Date.now() - rec.at < 6 * 3600_000)) { forget(); return; }
    busy = true;
    try {
      honeyChanged(wallet);
      await points(wallet).refresh();
      const st = points(wallet).get();
      if (signal?.aborted || st.value?.total_points == null || st.at < rec.at) return; // not read yet: next time
      forget();
      const gain = Math.round((Number(st.value.total_points) - rec.total) * 10) / 10;
      if (!(gain >= 0.1)) return;
      const g = GAMES.find((x) => x.id === rec.game);
      toast({ eyebrow: g ? g.name.toUpperCase() : 'WELCOME BACK', title: `+${num(gain, gain % 1 ? 1 : 0)} honey from that run`, body: `Your honey is now ${num(st.value.total_points, 0)}.` });
      celebrate({ kind: 'honey', amount: gain, origin });
    } catch { /* the next visit tries again */ } finally {
      busy = false;
    }
  };
  check();
  const opts = signal ? { signal } : undefined;
  addEventListener('pageshow', (e) => { if (e.persisted) check(); }, opts);
  document.addEventListener('visibilitychange', check, opts);
}

// Price charts drawn as SVG: a sparkline for tiles and an area chart with a
// crosshair for the $BEAR page. No chart library; the line draws itself in with
// a clip wipe (a dash-draw leaves a gap on non-scaling strokes).

import { h } from './dom.js';
import { skip, EASE } from './motion.js';

let uid = 0;

function scale(values, w, hgt, pad = 2) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  return values.map((v, i) => [
    pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2),
    pad + (1 - (v - min) / span) * (hgt - pad * 2),
  ]);
}

const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');

function wipe(clipRect, w, delay = 0) {
  if (skip()) return;
  clipRect.style.transformBox = 'fill-box';
  clipRect.style.transformOrigin = 'left center';
  clipRect.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, delay, easing: EASE.decel, fill: 'backwards' });
}

/** A tiny trend line, coloured by direction. */
export function sparkline(values, { width = 120, height = 36, tone = null } = {}) {
  if (!values?.length) return h('span');
  const up = tone ?? (values.at(-1) >= values[0] ? 'up' : 'down');
  const color = up === 'up' ? 'var(--up)' : up === 'down' ? 'var(--down)' : 'var(--ink-3)';
  const pts = scale(values, width, height, 3);
  const id = `sp${++uid}`;
  const rect = h('rect', { x: 0, y: 0, width, height });
  const svg = h('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true', style: { overflow: 'visible' } },
    h('defs',
      h('clipPath', { id: `${id}c` }, rect),
      h('linearGradient', { id: `${id}g`, x1: 0, y1: 0, x2: 0, y2: 1 },
        h('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '.28' }),
        h('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }))),
    h('g', { 'clip-path': `url(#${id}c)` },
      h('path', { d: `${pathOf(pts)}L${width - 3} ${height}L3 ${height}Z`, fill: `url(#${id}g)` }),
      h('path', { d: pathOf(pts), fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' })));
  requestAnimationFrame(() => wipe(rect, width, 120));
  return svg;
}

/**
 * The $BEAR chart: area + line, hover/touch crosshair with a price card.
 * candles: [{ t, c, v }] ascending. format(v) renders a price.
 */
export function areaChart(candles, { height = 280, format = String, formatTime = (t) => new Date(t).toLocaleString() } = {}) {
  const wrap = h('div.chart', { style: { position: 'relative', height: `${height}px`, touchAction: 'pan-y' } });
  if (!candles?.length) return wrap;
  const values = candles.map((c) => c.c);
  const up = values.at(-1) >= values[0];
  const color = up ? 'var(--up)' : 'var(--down)';
  const id = `ac${++uid}`;
  let W = 0;
  const card = h('div.chart__card', { hidden: true });
  const dot = h('div.chart__dot', { hidden: true });
  const line = h('div.chart__line', { hidden: true });
  wrap.append(line, dot, card);

  function draw() {
    W = wrap.clientWidth;
    if (!W) return;
    wrap.querySelector('svg')?.remove();
    const pts = scale(values, W, height, 8);
    const rect = h('rect', { x: 0, y: 0, width: W, height });
    const svg = h('svg', { viewBox: `0 0 ${W} ${height}`, width: W, height, 'aria-hidden': 'true', style: { position: 'absolute', inset: '0' } },
      h('defs',
        h('clipPath', { id: `${id}c` }, rect),
        h('linearGradient', { id: `${id}g`, x1: 0, y1: 0, x2: 0, y2: 1 },
          h('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '.32' }),
          h('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }))),
      h('g', { 'clip-path': `url(#${id}c)` },
        h('path', { d: `${pathOf(pts)}L${W - 8} ${height}L8 ${height}Z`, fill: `url(#${id}g)` }),
        h('path', { d: pathOf(pts), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' })));
    wrap.prepend(svg);
    wrap._pts = pts;
    return rect;
  }

  const ro = new ResizeObserver(() => { const first = !W; const rect = draw(); if (first && rect) wipe(rect, W); });
  ro.observe(wrap);

  function show(clientX) {
    const pts = wrap._pts;
    if (!pts) return;
    const r = wrap.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), W);
    const i = Math.round(((x - 8) / Math.max(1, W - 16)) * (pts.length - 1));
    const k = Math.min(pts.length - 1, Math.max(0, i));
    const [px, py] = pts[k];
    const c = candles[k];
    line.hidden = dot.hidden = card.hidden = false;
    line.style.transform = `translateX(${px}px)`;
    dot.style.transform = `translate(${px - 5}px, ${py - 5}px)`;
    card.replaceChildren(h('b', format(c.c)), h('span', formatTime(c.t)));
    const cw = card.offsetWidth;
    card.style.transform = `translateX(${Math.min(Math.max(px - cw / 2, 0), W - cw)}px)`;
  }
  const hide = () => { line.hidden = dot.hidden = card.hidden = true; };
  wrap.addEventListener('pointermove', (e) => show(e.clientX));
  wrap.addEventListener('pointerdown', (e) => show(e.clientX));
  wrap.addEventListener('pointerleave', hide);
  wrap.addEventListener('pointercancel', hide);
  return wrap;
}

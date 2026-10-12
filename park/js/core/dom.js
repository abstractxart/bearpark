// Tiny DOM toolkit. Every page is built with h(), so nothing is ever parsed
// from strings and user text can never become markup.

/**
 * h('div.card.glass', { onclick, style: {...}, dataset: {...} }, ...children)
 * The tag may carry .classes and one #id. Children may be strings, numbers,
 * nodes, arrays, or null/false (skipped).
 */
export function h(tag, props, ...children) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    if (props != null && props !== false) children.unshift(props);
    props = {};
  }
  const [, name = 'div', rest = ''] = /^([a-z0-9-]*)(.*)$/i.exec(tag);
  const svg = SVG_TAGS.has(name);
  const el = svg ? document.createElementNS(SVG_NS, name) : document.createElement(name);
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class' || key === 'className') {
      for (const c of String(value).split(/\s+/)) if (c) el.classList.add(c);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (v == null) continue;
        if (k.startsWith('--')) el.style.setProperty(k, v);
        else el.style[k] = v;
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'ref' && typeof value === 'function') {
      value(el);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else if (!svg && key in el && !key.includes('-') && key !== 'list' && key !== 'form') {
      el[key] = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'defs',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'text', 'tspan', 'use', 'ellipse']);

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Replace an element's children. */
export function fill(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** An inline SVG icon from the sprite in icons.js, sized by CSS (1em). */
export function icon(name, cls = '') {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('class', `icon ${cls}`.trim());
  el.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  el.append(use);
  return el;
}

/** Abortable listeners that die with a scope (a page, a sheet). */
export function scope() {
  const ctrl = new AbortController();
  const cleanups = [];
  return {
    signal: ctrl.signal,
    on(target, type, fn, opts = {}) {
      target.addEventListener(type, fn, { ...opts, signal: ctrl.signal });
    },
    add(fn) { cleanups.push(fn); },
    get dead() { return ctrl.signal.aborted; },
    dispose() {
      if (ctrl.signal.aborted) return;
      ctrl.abort();
      for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* keep disposing */ } }
    },
  };
}

export const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Components. Each returns a DOM node built with h(); styles live in core.css.
// The rules they encode (no spinners, never a 0 for failed data, one error
// language, gold only for the one armed action) are in park/DESIGN.md.

import { h, icon, fill, $$ } from './dom.js';
import { errorIn, morphOpen, morphClose, fadeIn, fadeOut, rise, roll } from './motion.js';
import { parseAvatar, ladderImg, DEFAULT_AVATAR } from './media.js';
import { short } from './format.js';

// ---------------------------------------------------------------------------
// Waiting states

export function skRows(n = 5) {
  return h('div.rows', { 'aria-busy': 'true' }, Array.from({ length: n }, (_, i) =>
    h('div.sk-row', h('span.sk.sk--circle', { style: { '--d': `${i * 90}ms` } }),
      h('div.sk-row__main',
        h('span.sk.sk--line', { style: { '--w': `${48 + ((i * 37) % 30)}%`, '--d': `${i * 90}ms` } }),
        h('span.sk.sk--line', { style: { '--w': `${26 + ((i * 23) % 20)}%`, height: '9px', '--d': `${i * 90 + 40}ms` } })),
      h('span.sk', { style: { width: '64px', height: '18px', '--d': `${i * 90}ms` } }))));
}

export const skFigure = (w = '3.2em') => h('span.sk.sk--figure', { style: { '--w': w } });
export const skLine = (w = '60%') => h('span.sk.sk--line', { style: { '--w': w } });

/** A figure that could not load: a calm dash, never a zero. */
export const failedFigure = (note = "couldn't load · retrying") =>
  h('span', h('span.failed', '—'), note ? h('span.failed-note', note) : null);

// ---------------------------------------------------------------------------
// Live binding: paint a feed into a slot — shimmer → value, failure → dash.

/**
 * bind(slot, feed, render, { signal, skeleton, failed })
 * `render(value)` returns the node(s) for a value. While the feed has no value
 * yet the slot shows `skeleton()`; if it fails before any value arrives it
 * shows `failed()`. A later failure keeps the last good value on screen.
 */
export function bind(slot, feed, render, { signal, skeleton = () => skFigure(), failed = () => failedFigure(), animate = true } = {}) {
  let painted = false;
  feed.subscribe((state) => {
    if (state.value !== undefined && state.value !== null) {
      const node = render(state.value, state);
      fill(slot, node);
      if (!painted && animate) rise(slot, { px: 8, duration: 360 });
      painted = true;
    } else if (state.error) {
      fill(slot, failed(state.error));
    } else if (!painted) {
      fill(slot, skeleton());
    }
  }, signal);
  return slot;
}

/** A figure whose digits roll into place when it changes. */
export function rollingFigure(text, cls = '') {
  const el = h(`span.num${cls ? `.${cls}` : ''}`);
  queueMicrotask(() => roll(el, text));
  return el;
}

// ---------------------------------------------------------------------------
// The error language and statements

export function errorLine(message, { small = false } = {}) {
  const box = h(`div.m-err${small ? '.m-err--sm' : ''}`, { role: 'alert' },
    h('span.m-err__rule'), icon('warning'), h('span.m-err__msg', message));
  requestAnimationFrame(() => errorIn(box));
  return box;
}

export function statement({ tone = 'warn', title, body, children = [] }) {
  const cls = tone === 'warn' ? '' : `.statement--${tone}`;
  return h(`div.statement${cls}`, { role: tone === 'danger' ? 'alert' : null },
    title ? h('div.statement__title', title) : null,
    body ? h('div.statement__body', body) : null,
    children);
}

export function empty(title, body) {
  return h('div.empty', h('b', title), body);
}

// ---------------------------------------------------------------------------
// Toasts: an eyebrow, a light title, a gold rule that counts down.

let toastHost;
export function toast({ eyebrow = 'BEAR PARK', title, body, tone = '', ms = 4200 } = {}) {
  toastHost ||= document.body.appendChild(h('div.toast-host', { 'aria-live': 'polite' }));
  const clock = h('i.toast__clock');
  const el = h(`div.toast${tone ? `.toast--${tone}` : ''}`, { role: 'status' },
    h('div.toast__eyebrow', eyebrow), title ? h('div.toast__title', title) : null, body ? h('div.toast__body', body) : null, clock);
  toastHost.append(el);
  el.animate([{ transform: 'translateY(24px) scale(.98)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.05,.7,.1,1)', fill: 'backwards' });
  const tick = clock.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
  el.addEventListener('pointerenter', () => tick.pause());
  el.addEventListener('pointerleave', () => tick.play());
  tick.finished.then(async () => {
    await el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(12px)' }], { duration: 220, easing: 'cubic-bezier(.3,0,.8,.15)', fill: 'forwards' }).finished;
    el.remove();
  }).catch(() => {});
  return el;
}

// ---------------------------------------------------------------------------
// Dialogs and sheets: grow out of the control that opened them.

const openDialogs = [];

/**
 * dialog({ title, eyebrow, body, foot, origin, size: 'wide'|'xl', sheet, onClose, label })
 * Returns { el, body, close(), setFoot(nodes) }. Esc, the scrim and × all run
 * the exit; the page behind is inert while it is open.
 */
export function dialog({ title, eyebrow, body = [], foot = null, origin = null, size = '', sheet = false, onClose, label, dismissable = true } = {}) {
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const bodyEl = h('div.dlg__body', body);
  let footEl = foot ? h('div.dlg__foot', foot) : null;
  const closeBtn = dismissable ? h('button.icon-btn.dlg__close', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close')) : null;
  const card = h(`div.dlg${size ? `.dlg--${size}` : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title ? titleId : null, 'aria-label': title ? null : label },
    sheet ? h('div.dlg__grab') : null,
    (title || eyebrow || closeBtn) ? h('div.dlg__head',
      h('div.zune', eyebrow ? h('div.eyebrow.eyebrow--sm', eyebrow) : null, title ? h('h2.dlg__title', { id: titleId }, title) : null),
      closeBtn) : null,
    bodyEl, footEl);
  const scrim = h('div.dlg-scrim', { onclick: () => dismissable && close() });
  const host = h(`div.dlg-host${sheet ? '.dlg-host--sheet' : ''}`, scrim, card);

  const api = {};
  const app = document.getElementById('app');
  const prevFocus = document.activeElement;
  document.body.append(host);
  if (app && !openDialogs.length) app.inert = true;
  document.documentElement.classList.add('covered');
  openDialogs.push(api);

  fadeIn(scrim, { duration: 200 });
  morphOpen(card, origin);
  requestAnimationFrame(() => (card.querySelector('[autofocus]') || closeBtn || card).focus?.({ preventScroll: true }));

  const onKey = (e) => {
    if (openDialogs.at(-1) !== api) return;
    if (e.key === 'Escape' && dismissable) { e.preventDefault(); close(); }
    if (e.key === 'Tab') trapTab(card, e);
  };
  document.addEventListener('keydown', onKey);

  let closing = null;
  function close(result) {
    if (closing) return closing;
    card.inert = true;
    closing = (async () => {
      document.removeEventListener('keydown', onKey);
      await Promise.all([fadeOut(scrim, { duration: 220 }), morphClose(card, origin)]);
      host.remove();
      openDialogs.splice(openDialogs.indexOf(api), 1);
      if (!openDialogs.length) {
        if (app) app.inert = false;
        document.documentElement.classList.remove('covered');
      }
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.(result);
    })();
    return closing;
  }

  return Object.assign(api, {
    el: card,
    body: bodyEl,
    close,
    setFoot(nodes) {
      if (!nodes) { footEl?.remove(); footEl = null; return; }
      if (footEl) fill(footEl, nodes);
      else card.append((footEl = h('div.dlg__foot', nodes)));
    },
    setTitle(text) { const t = card.querySelector('.dlg__title'); if (t) t.textContent = text; },
  });
}

function trapTab(root, e) {
  const items = $$('a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])', root)
    .filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** A Metro confirm in place of window.confirm(). Resolves true / false. */
export function confirmDialog({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false, origin } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const d = dialog({
      title, origin, size: '',
      body: [typeof body === 'string' ? h('p.body', { style: { margin: '0' } }, body) : body],
      foot: [
        h('button.btn.btn--line', { type: 'button', onclick: () => { answered = true; d.close(false); } }, cancel),
        h(`button.btn${danger ? '.btn--danger' : '.btn--gold'}`, { type: 'button', autofocus: true, onclick: () => { answered = true; d.close(true); } }, confirm),
      ],
      onClose: (v) => resolve(answered ? v : false),
    });
  });
}

// ---------------------------------------------------------------------------
// Pivot tabs: labels + one gold mark that slides on the 400/30/.8 spring.

/**
 * pivot([{ id, label }], { selected, onChange, align: 'start'|'fill' })
 * Returns the element; el.select(id) changes tab programmatically.
 */
export function pivot(tabs, { selected = tabs[0]?.id, onChange, align = 'fill', label = 'Sections' } = {}) {
  const mark = h('span.pivot__mark');
  const buttons = tabs.map((t) => h('button.pivot__tab', {
    type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-selected': String(t.id === selected),
    onclick: () => select(t.id, true),
  }, t.label));
  const bar = h('div.pivot__bar', { role: 'tablist', 'aria-label': label }, buttons, mark);
  const el = h(`div.pivot${align === 'start' ? '.pivot--start' : ''}`, bar);

  function place(animate) {
    const i = tabs.findIndex((t) => t.id === selected);
    const b = buttons[i];
    if (!b) return;
    if (!animate) mark.style.transition = 'none';
    mark.style.transform = `translateX(${b.offsetLeft + b.offsetWidth / 2 - 17 - bar.scrollLeft}px)`;
    if (!animate) { void mark.offsetWidth; mark.style.transition = ''; }
  }
  function select(id, user) {
    if (!tabs.some((t) => t.id === id)) return;
    const changed = id !== selected;
    selected = id;
    buttons.forEach((b, i) => b.setAttribute('aria-selected', String(tabs[i].id === id)));
    place(true);
    const b = buttons[tabs.findIndex((t) => t.id === id)];
    if (user) b?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    if (changed) onChange?.(id, user);
  }
  bar.addEventListener('scroll', () => place(false), { passive: true });
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.id === selected);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    select(next.id, true);
    buttons[tabs.indexOf(next)].focus();
  });
  new ResizeObserver(() => place(false)).observe(bar);
  requestAnimationFrame(() => place(false));
  el.select = (id) => select(id, false);
  el.selected = () => selected;
  return el;
}

/** Words pivot inside sheets/panels. */
export function words(tabs, { selected = tabs[0]?.id, onChange } = {}) {
  const el = h('div.words', { role: 'tablist' });
  const render = () => fill(el, tabs.map((t) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(t.id === selected),
    onclick: () => { if (t.id !== selected) { selected = t.id; render(); onChange?.(t.id); } },
  }, t.label)));
  render();
  return el;
}

// ---------------------------------------------------------------------------
// People

/**
 * avatar(rawAvatarNft, { size, name, ring }) — the NFT bear someone picked,
 * walking the IPFS gateway ladder; the BEAR coin if none or all fail.
 */
export function avatar(raw, { size = 40, name = '', ring = null } = {}) {
  const a = parseAvatar(raw);
  const box = h('span.ava', { style: { '--s': `${size}px` }, title: a?.bearName || name || null });
  const fallback = () => { box.classList.remove('is-wait'); box.replaceChildren(h('img', { src: DEFAULT_AVATAR, alt: '', loading: 'lazy', decoding: 'async' })); };
  const first = a?.imageUrl || a?.fallbackImageUrl;
  if (first) {
    // The BEAR coin shows through until the bear arrives, never an empty circle.
    box.classList.add('is-wait');
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer', onload: () => box.classList.remove('is-wait') });
    // Big avatars keep their animation; small ones show the first frame (KBs, not MBs).
    const opts = { width: size, animated: !!a.isAnimated && size >= 96, nftId: a.nftId };
    ladderImg(img, first, () => {
      if (a.fallbackImageUrl && first !== a.fallbackImageUrl) {
        const still = h('img', { alt: '', decoding: 'async', referrerPolicy: 'no-referrer', onload: () => box.classList.remove('is-wait') });
        ladderImg(still, a.fallbackImageUrl, fallback, { width: size, nftId: a.nftId });
        img.replaceWith(still);
      } else {
        fallback();
      }
    }, opts);
    box.append(img);
  } else {
    fallback();
  }
  if (!ring?.image_url) return box;
  return h('span.ava-wrap', { style: { '--s': `${size}px` } }, box,
    h('span.ava-ring', h('img', { src: ring.image_url, alt: '', loading: 'lazy' })));
}

export function displayName(person) {
  return person?.display_name?.trim() || short(person?.wallet_address || person?.wallet || '');
}

/** A link to someone's profile page. */
export const profileHref = (wallet) => `#/u/${wallet}`;

// ---------------------------------------------------------------------------
// Page furniture

/**
 * The heading every page opens with: a Metro eyebrow over BEAR Park's cartoon
 * title (Luckiest Guy, inked outline), the tri-stripe beneath. `gold` names the
 * word(s) of the title to set in gold.
 */
export function pageHead({ eyebrow, title, gold = null, aside = null, lede = null }) {
  let titleNodes = title;
  if (typeof title === 'string' && gold && title.includes(gold)) {
    const [before, after] = [title.slice(0, title.indexOf(gold)), title.slice(title.indexOf(gold) + gold.length)];
    titleNodes = [before, h('span.gold', gold), after];
  }
  return h('header.page-head',
    h('div.zune', { 'data-e': '' },
      eyebrow ? h('div.eyebrow', eyebrow) : null,
      h('h1.park-title', titleNodes),
      h('span.tri'),
      lede ? h('p.lede', { style: { margin: '12px 0 0', maxWidth: '58ch' } }, lede) : null),
    aside);
}

export function sectionHead(title, aside = null) {
  return h('div.section__head', h('h2.section-title', title), aside ? h('div.section__aside', aside) : null);
}

/** A frosted section pane with a title row and an edge-to-edge rule. */
export function pane({ title = null, aside = null, body = [], cls = '' } = {}) {
  return h(`section.frost.frost--section${cls ? `.${cls}` : ''}`,
    title || aside ? h('div.pane-head', title ? h('div.eyebrow', title) : h('span'), aside ? h('div.section__aside', aside) : null) : null,
    title || aside ? h('div.rule') : null,
    body);
}

export function copyButton(text, label = 'Copy') {
  const btn = h('button.icon-btn', { type: 'button', 'aria-label': label, title: label }, icon('copy'));
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      btn.replaceChildren(icon('check'));
      setTimeout(() => btn.replaceChildren(icon('copy')), 1400);
    } catch {
      toast({ eyebrow: 'COPY', title: 'Could not copy', tone: 'danger' });
    }
  });
  return btn;
}

export function external(href, text, cls = 'btn btn--line') {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls }, text, icon('external'));
}

/** Load a page's stylesheet once: /park/css/pages/<name>.css */
const loadedCss = new Set();
export function loadCss(name) {
  if (loadedCss.has(name)) return;
  loadedCss.add(name);
  document.head.append(h('link', { rel: 'stylesheet', href: `/park/css/pages/${name}.css` }));
}

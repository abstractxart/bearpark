// Reactions on bulletin posts and comments.
//
// The board's lists carry each item's reactions ({ counts, userReactions })
// and seed() takes them as they are: no request per post or comment. Against
// an older backend whose lists don't carry them, a bar falls back to asking
// GET …/reactions as it scrolls into view, two at a time, and never for a post
// the feed says nobody reacted to. A toggle is optimistic and the server's
// answer (the full counts) settles it.

import { h, fill } from '../../core/dom.js';
import { api, post } from '../../core/api.js';
import { errorLine } from '../../core/ui.js';
import { rise, leaf } from '../../core/motion.js';
import { num } from '../../core/format.js';
import { smilePlus } from './common.js';

// The server's CHECK constraint allows exactly these six.
export const REACTIONS = [
  { type: 'like', glyph: '👍', label: 'Like' },
  { type: 'laugh', glyph: '😂', label: 'Laugh' },
  { type: 'heart', glyph: '❤️', label: 'Love' },
  { type: 'cry', glyph: '😢', label: 'Sad' },
  { type: 'thumbs_down', glyph: '👎', label: 'Dislike' },
  { type: 'troll', glyph: '🤡', label: 'Troll' },
];

const sum = (counts) => Object.values(counts || {}).reduce((a, n) => a + (Number(n) || 0), 0);

/** Your reactions out of a { wallet: [types] } map; wallets are compared case-insensitively. */
function mineIn(userReactions, wallet) {
  if (!userReactions || !wallet) return [];
  if (Array.isArray(userReactions[wallet])) return userReactions[wallet];
  const w = wallet.toLowerCase();
  const key = Object.keys(userReactions).find((k) => k.toLowerCase() === w);
  return key && Array.isArray(userReactions[key]) ? userReactions[key] : [];
}
const MAX_PARALLEL = 2;

/**
 * reactionStore({ wallet, signal, onTotal })
 * → { bar(kind, id, { total, compact }), seed(kind, id, reactions), setTotal(kind, id, total), get(kind, id) }
 * `kind` is 'post' or 'comment'. `onTotal(kind, id, total)` hears every settled total.
 */
export function reactionStore({ wallet, signal, onTotal }) {
  const states = new Map();
  const queue = [];
  let active = 0;
  let picker = null; // { bar, el, cleanup }

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const st = e.target._st;
        if (st && (!st.loaded || st.stale) && !st.loading) load(st);
      }
    }, { rootMargin: '160px 0px' })
    : null;
  signal.addEventListener('abort', () => { io?.disconnect(); queue.length = 0; closePicker(); }, { once: true });

  function get(kind, id) {
    const key = `${kind}:${id}`;
    let st = states.get(key);
    if (!st) {
      st = { kind, id, counts: {}, mine: new Set(), total: null, loaded: false, stale: false, loading: false, failed: false, busy: new Set(), bars: new Set() };
      states.set(key, st);
    }
    return st;
  }

  /** The feed's own count for an item. Zero means nothing to fetch; a change means stale. */
  function setTotal(kind, id, total) {
    const st = get(kind, id);
    const n = Number(total) || 0;
    st.total = n;
    if (st.busy.size) return;
    if (!st.loaded && n === 0) {
      st.loaded = true;
      st.counts = {};
      st.mine = new Set();
    } else if (st.loaded && sum(st.counts) !== n) {
      st.stale = true;
      if ([...st.bars].some(onScreen)) load(st);
    }
    paint(st);
  }

  /** Reactions that came embedded in a list: the whole answer, nothing to fetch. */
  function seed(kind, id, reactions) {
    const st = get(kind, id);
    if (st.busy.size || !reactions || typeof reactions !== 'object') return st;
    st.counts = { ...(reactions.counts || {}) };
    st.mine = new Set(mineIn(reactions.userReactions, wallet));
    st.loaded = true;
    st.stale = false;
    st.failed = false;
    st.total = sum(st.counts);
    paint(st);
    return st;
  }

  function onScreen(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > -100 && r.top < innerHeight + 100 && r.width > 0;
  }

  function load(st) {
    if (st.loading) return;
    st.loading = true;
    queue.push(st);
    pump();
  }

  function pump() {
    while (active < MAX_PARALLEL && queue.length && !signal.aborted) {
      const st = queue.shift();
      active += 1;
      api(`/bulletin/${st.kind}s/${st.id}/reactions`, { signal })
        .then((r) => {
          if (st.busy.size) return; // a toggle is in flight; its answer wins
          settle(st, r);
        })
        .catch(() => { st.failed = true; })
        .finally(() => {
          st.loading = false;
          active -= 1;
          paint(st);
          pump();
        });
    }
  }

  function settle(st, r) {
    st.counts = { ...(r?.counts || {}) };
    st.mine = new Set(mineIn(r?.userReactions, wallet));
    st.loaded = true;
    st.stale = false;
    st.failed = false;
    st.total = sum(st.counts);
    onTotal?.(st.kind, st.id, st.total);
  }

  async function toggle(st, type, bar) {
    if (st.busy.has(type) || signal.aborted) return;
    st.busy.add(type);
    const before = { counts: { ...st.counts }, mine: new Set(st.mine), total: st.total, loaded: st.loaded };
    const had = st.mine.has(type);
    st.counts[type] = Math.max(0, (Number(st.counts[type]) || 0) + (had ? -1 : 1));
    if (!st.counts[type]) delete st.counts[type];
    if (had) st.mine.delete(type); else st.mine.add(type);
    st.total = Math.max(0, (st.total ?? before.total ?? 0) + (had ? -1 : 1));
    for (const b of st.bars) fill(b._err);
    paint(st);
    try {
      const r = await post(`/bulletin/${st.kind}s/${st.id}/react`, { wallet_address: wallet, reaction_type: type }, { signal });
      settle(st, r);
    } catch (err) {
      if (signal.aborted) return;
      Object.assign(st, before);
      fill(bar._err, errorLine(`Your reaction didn't save. ${err.message}`, { small: true }));
    } finally {
      st.busy.delete(type);
      paint(st);
    }
  }

  function paint(st) {
    for (const bar of st.bars) {
      if (!bar.isConnected) {
        if (Date.now() - bar._born > 4000) { st.bars.delete(bar); io?.unobserve(bar); }
        continue;
      }
      paintBar(bar);
    }
  }

  function paintBar(bar) {
    const st = bar._st;
    let kids;
    if (st.loaded) {
      kids = REACTIONS.filter((r) => Number(st.counts[r.type]) > 0).map((r) => {
        const n = Number(st.counts[r.type]);
        const mine = st.mine.has(r.type);
        return h('button.cm-pill', {
          type: 'button',
          'aria-pressed': String(mine),
          'aria-label': `${r.label}, ${n}${mine ? ', yours — tap to take it back' : ''}`,
          title: r.label,
          onclick: (e) => { e.stopPropagation(); toggle(st, r.type, bar); },
        }, h('span.cm-pill__g', { 'aria-hidden': 'true' }, r.glyph), h('span.cm-pill__n.num', num(n, 0)));
      });
    } else if (st.total > 0) {
      // Until the breakdown arrives (it's fetched as the bar scrolls in), the
      // feed's own total stands in: real data, and nothing shimmering offscreen.
      kids = [h('span.cm-rx__total', `${num(st.total, 0)} ${st.total === 1 ? 'reaction' : 'reactions'}`)];
    } else {
      kids = [];
    }
    fill(bar._pills, kids);
    bar._add.classList.toggle('is-mine', st.mine.size > 0);
  }

  // ── the picker: six tiles above (or below) the button, one tap each ──

  function closePicker(refocus = false) {
    if (!picker) return;
    const { bar, el, cleanup } = picker;
    picker = null;
    cleanup();
    el.remove();
    bar._add.setAttribute('aria-expanded', 'false');
    if (refocus) bar._add.focus({ preventScroll: true });
  }

  function openPicker(bar, viaKeyboard) {
    closePicker();
    const st = bar._st;
    const items = REACTIONS.map((r) => h('button.cm-picker__item', {
      type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(st.mine.has(r.type)), title: r.label,
      onclick: (e) => { e.stopPropagation(); closePicker(viaKeyboard); toggle(st, r.type, bar); },
    }, h('span.cm-picker__g', { 'aria-hidden': 'true' }, r.glyph), h('span.cm-picker__l', r.label)));
    const el = h('div.cm-picker', { role: 'menu', 'aria-label': 'React with' }, items);
    el.addEventListener('click', (e) => e.stopPropagation());
    bar.append(el);

    // Above the button when there's room, else below; never off the side of the screen.
    const scroller = bar.closest('.dlg__body');
    const top = scroller ? scroller.getBoundingClientRect().top : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 60;
    const addRect = bar._add.getBoundingClientRect();
    if (addRect.top - top < el.offsetHeight + 16) el.classList.add('cm-picker--below');
    const overRight = el.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
    if (overRight > 0) el.style.left = `${-overRight}px`;
    const overLeft = 8 - el.getBoundingClientRect().left;
    if (overLeft > 0) el.style.left = `${(parseFloat(el.style.left) || 0) + overLeft}px`;

    bar._add.setAttribute('aria-expanded', 'true');
    rise(el, { px: el.classList.contains('cm-picker--below') ? -6 : 6, duration: 260 });
    leaf(items, { stagger: 18 });
    if (viaKeyboard) items[0].focus({ preventScroll: true });

    const outside = (e) => { if (!el.contains(e.target) && !bar._add.contains(e.target)) closePicker(); };
    const keys = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePicker(true); return; }
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === 'Tab') {
        closePicker(false);
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    picker = { bar, el, cleanup: () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', keys, true); } };
  }

  /** A reaction bar: the React button, then a pill per reaction type in use. */
  function bar(kind, id, { total, compact = false } = {}) {
    const st = get(kind, id);
    if (total !== undefined && st.total === null) setTotal(kind, id, total);
    const add = h('button.cm-rx__add', { type: 'button', 'aria-label': 'React', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      smilePlus(), compact ? null : h('span.cm-rx__addlabel', 'React'));
    const pills = h('div.cm-rx__pills');
    const err = h('div.cm-rx__err');
    const el = h(`div.cm-rx${compact ? '.cm-rx--compact' : ''}`, add, pills, err);
    Object.assign(el, { _st: st, _add: add, _pills: pills, _err: err, _compact: compact, _born: Date.now() });
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      if (picker?.bar === el) closePicker(true);
      else openPicker(el, e.detail === 0);
    });
    st.bars.add(el);
    if (io) io.observe(el);
    else if (!st.loaded) load(st);
    paintBar(el);
    return el;
  }

  return { bar, seed, setTotal, get };
}

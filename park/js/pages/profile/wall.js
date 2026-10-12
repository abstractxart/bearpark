// The wall: threaded comments on a profile, with replies, reactions and
// deletes. Writes are optimistic and roll back with the error language.
// Reactions come embedded in GET /api/comments/:wallet (comment.reactions);
// against an older server without them, each comment's are read once, when
// it scrolls into view, a few at a time.

import { h, icon, fill } from '../../core/dom.js';
import { pane, profileHref, confirmDialog, errorLine, empty, skRows } from '../../core/ui.js';
import { bearAvatar as avatar } from './ipfs.js';
import { leaf, rise } from '../../core/motion.js';
import { api, post, del } from '../../core/api.js';
import { profile, role, equippedFor } from '../../core/data.js';
import { ago, plural, short } from '../../core/format.js';

// The server's reaction types (POST /api/comments/:id/react validates these).
const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'heart', emoji: '❤️', label: 'Love' },
  { type: 'laugh', emoji: '😂', label: 'Laugh' },
  { type: 'cry', emoji: '😢', label: 'Sad' },
  { type: 'thumbs_down', emoji: '👎', label: 'Dislike' },
  { type: 'troll', emoji: '🤡', label: 'Troll' },
];
const TEXT_MAX = 500;
const MAX_INDENT = 3;
const same = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

/** A textarea + Post, optimistic: the text clears at once and comes back on failure. */
function composer({ placeholder, label = 'Post', onSubmit, onCancel = null, initial = '', error = null }) {
  const ta = h('textarea', { rows: 2, maxLength: TEXT_MAX, placeholder, 'aria-label': placeholder });
  ta.value = initial;
  const count = h('span.field__count');
  const send = h('button.btn.btn--sm', { type: 'button', onclick: () => submit() }, icon('send'), label);
  const err = h('div.prof-compose__err', error ? errorLine(error, { small: true }) : null);
  const sync = () => {
    const n = ta.value.length;
    count.textContent = n > TEXT_MAX - 100 ? `${n}/${TEXT_MAX}` : '';
    send.disabled = !ta.value.trim();
  };
  ta.addEventListener('input', sync);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && onCancel) { e.preventDefault(); onCancel(); }
  });
  sync();
  async function submit() {
    const text = ta.value.trim();
    if (!text) return;
    fill(err);
    ta.value = '';
    sync();
    try {
      await onSubmit(text);
    } catch (e) {
      if (!ta.isConnected) return;
      ta.value = text;
      sync();
      fill(err, errorLine(e.message || 'That didn’t post. Try again.', { small: true }));
    }
  }
  const el = h('div.prof-compose',
    h('label.field.prof-compose__field', ta, count),
    h('div.prof-compose__bar', h('span.prof-compose__tip', 'Ctrl + Enter to post'),
      onCancel ? h('button.btn.btn--text', { type: 'button', onclick: onCancel }, 'Cancel') : null, send),
    err);
  return { el, ta, focus: () => ta.focus({ preventScroll: true }) };
}

/**
 * wall({ target, me, ownerName, signal, scope }) → { el, focus(id) }
 */
export function wall({ target, me, ownerName, signal, scope }) {
  const isOwner = same(target, me);
  const countEl = h('span');
  const list = h('div.prof-wall__list', skRows(3));
  const top = composer({
    placeholder: isOwner ? 'Post on your wall' : `Write on ${ownerName()}’s wall`,
    onSubmit: (text) => send(text, null),
  });
  const el = pane({ title: 'Wall', aside: countEl, cls: 'prof-wall', body: [h('div.prof-wall__compose', top.el), h('div.rule'), list] });
  el.dataset.e = '';

  let comments = null;
  let admin = false;
  let reply = null; // { id, text, error }
  let focusId = null;
  const reactions = new Map(); // id → { counts, mine:Set }
  const errors = new Map(); // id → message
  const busy = new Set();

  role(me).subscribe((s) => {
    const next = !!s.value && ['admin', 'master'].includes(s.value.role) && s.value.is_active !== false;
    if (next !== admin) { admin = next; if (comments) render(); }
  }, signal);

  const myName = () => profile(me).get().value?.display_name || null;
  const myAvatar = () => profile(me).get().value?.avatar_nft || null;

  // ── data ──
  async function load({ quiet = false } = {}) {
    try {
      const r = await api(`/comments/${target}`, { signal });
      const first = !comments;
      comments = (r.comments || []).map(norm);
      // Newer servers embed each comment's reactions; then no per-comment
      // reads happen at all. Older ones don't, and the lazy reads fill in.
      for (const c of comments) {
        if (c.reactions && typeof c.reactions === 'object' && ![...busy].some((k) => k === c.id || k.startsWith(`${c.id}:`))) {
          reactions.set(c.id, toState(c.reactions));
        }
      }
      render();
      if (first) leaf([...list.children].slice(0, 8));
      if (focusId) reveal(focusId);
      loadRings();
    } catch (e) {
      if (signal.aborted) return;
      if (!quiet || !comments) {
        fill(list, h('div.prof-pad', errorLine(e.message || 'The wall didn’t load.'),
          h('button.btn.btn--line.btn--sm', { type: 'button', style: { marginTop: '14px' }, onclick: () => { fill(list, skRows(3)); load(); } }, icon('refresh'), 'Try again')));
      }
    }
  }
  const norm = (c) => ({ ...c, id: String(c.id), parent_id: c.parent_id == null ? null : String(c.parent_id) });

  // Commenters' cosmetic rings, like everywhere else in the park: one batched
  // read for the wallets not seen yet, then one repaint if anyone wears one.
  const rings = new Map(); // wallet → ring item or null
  async function loadRings() {
    const wallets = [...new Set(comments.map((c) => c.commenter_wallet).filter((w) => w && !rings.has(w)))];
    if (!wallets.length) return;
    try {
      const map = await equippedFor(wallets);
      let wearing = false;
      for (const w of wallets) {
        const ring = map[w]?.ring || null;
        rings.set(w, ring);
        if (ring?.image_url) wearing = true;
      }
      if (wearing && !signal.aborted && !list.contains(document.activeElement)) render();
    } catch { /* decoration: the bears still show */ }
  }

  function tree() {
    const byId = new Map(comments.map((c) => [c.id, { ...c, kids: [] }]));
    const roots = [];
    for (const c of comments) {
      const node = byId.get(c.id);
      const parent = c.parent_id && byId.get(c.parent_id);
      if (parent) parent.kids.push(node); else roots.push(node);
    }
    const t = (c) => Date.parse(c.created_at) || 0;
    roots.sort((a, b) => t(b) - t(a));
    for (const node of byId.values()) node.kids.sort((a, b) => t(a) - t(b));
    return roots;
  }

  // ── render ──
  let io = null;
  function render() {
    if (!comments) return;
    countEl.textContent = comments.length ? plural(comments.length, 'comment') : '';
    io?.disconnect();
    if (!comments.length) {
      fill(list, empty(isOwner ? 'Your wall is quiet' : 'No comments yet', isOwner ? 'Notes other BEARs leave you land here.' : 'Be the first to write on this wall.'));
      return;
    }
    fill(list, tree().map((node) => thread(node, 0, null)));
    watchReactions();
  }

  function thread(node, depth, parent) {
    return h('div.prof-thread',
      comment(node, depth, parent),
      node.kids.length ? h(`div.prof-thread__kids${depth + 1 > MAX_INDENT ? '.is-flat' : ''}`, { id: `kids-${node.id}` }, node.kids.map((k) => thread(k, depth + 1, node))) : null);
  }

  function comment(c, depth, parent) {
    const name = c.commenter_name && c.commenter_name !== 'Anonymous' ? c.commenter_name : short(c.commenter_wallet);
    const mine = same(c.commenter_wallet, me);
    const canDelete = !c.pending && (mine || isOwner || admin);
    const when = new Date(c.created_at);
    const replySlot = h('div.prof-c__reply');
    const errSlot = h('div.prof-c__err', errors.has(c.id) ? errorLine(errors.get(c.id), { small: true }) : null);
    const reactBtn = h('button.prof-act', { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', disabled: c.pending, onclick: (e) => openPicker(c.id, e.currentTarget) }, icon('heart'), 'React');
    const el = h(`article.prof-c${c.pending ? '.is-pending' : ''}`, { id: `c-${c.id}`, dataset: { id: c.id } },
      h('a.prof-c__ava', { href: profileHref(c.commenter_wallet), 'aria-label': name, tabIndex: -1 }, avatar(c.commenter_avatar, { size: depth ? 32 : 40, ring: rings.get(c.commenter_wallet) || null })),
      h('div.prof-c__main',
        h('div.prof-c__head',
          h('a.prof-c__name', { href: profileHref(c.commenter_wallet) }, name),
          same(c.commenter_wallet, target) ? h('span.chip.chip--gold.prof-c__chip', 'Owner') : null,
          h('time.prof-c__time', { dateTime: c.created_at, title: Number.isFinite(when.getTime()) ? when.toLocaleString() : null }, c.pending ? 'Posting' : ago(c.created_at))),
        depth && parent ? h('div.prof-c__to', icon('reply'), 'to ', parent.commenter_name && parent.commenter_name !== 'Anonymous' ? parent.commenter_name : short(parent.commenter_wallet)) : null,
        h('p.prof-c__text', c.comment_text),
        h('div.prof-react', { 'aria-label': 'Reactions' }),
        h('div.prof-c__actions',
          reactBtn,
          h('button.prof-act', { type: 'button', disabled: c.pending, onclick: () => openReply(c.id) }, icon('reply'), 'Reply'),
          c.kids?.length ? h('button.prof-act', { type: 'button', 'aria-expanded': 'true', 'aria-controls': `kids-${c.id}`, onclick: (e) => toggleKids(c.id, e.currentTarget, c.kids.length) }, icon('chevron-down'), 'Hide replies') : null,
          canDelete ? h('button.prof-act.prof-act--del', { type: 'button', onclick: (e) => remove(c, e.currentTarget) }, icon('trash'), 'Delete') : null),
        errSlot, replySlot));
    paintReactions(c.id, el);
    if (reply?.id === c.id) mountReply(replySlot, c);
    return el;
  }

  function toggleKids(id, btn, n) {
    const kids = list.querySelector(`#kids-${CSS.escape(id)}`);
    if (!kids) return;
    const hide = !kids.hidden;
    kids.hidden = hide;
    btn.setAttribute('aria-expanded', String(!hide));
    fill(btn, icon(hide ? 'chevron-right' : 'chevron-down'), hide ? `Show ${plural(n, 'reply', 'replies')}` : 'Hide replies');
  }

  // ── replies ──
  function openReply(id) {
    reply = { id, text: '', error: null };
    render();
    list.querySelector(`#c-${CSS.escape(id)} .prof-c__reply textarea`)?.focus({ preventScroll: false });
  }
  function mountReply(slot, c) {
    const box = composer({
      placeholder: `Reply to ${c.commenter_name && c.commenter_name !== 'Anonymous' ? c.commenter_name : short(c.commenter_wallet)}`,
      label: 'Reply',
      initial: reply.text,
      error: reply.error,
      onCancel: () => { reply = null; render(); },
      onSubmit: async (text) => {
        const at = reply;
        reply = null;
        try {
          await send(text, c.id);
        } catch (e) {
          reply = { id: at.id, text, error: e.message || 'That reply didn’t post. Try again.' };
          render();
        }
      },
    });
    box.ta.addEventListener('input', () => { if (reply) reply.text = box.ta.value; });
    fill(slot, box.el);
    rise(box.el, { px: 6, duration: 260 });
  }

  // ── writes ──
  async function send(text, parentId) {
    const tmp = norm({
      id: `tmp-${Date.now()}`, profile_wallet: target, commenter_wallet: me, comment_text: text,
      commenter_name: myName(), commenter_avatar: myAvatar(), parent_id: parentId, created_at: new Date().toISOString(),
    });
    tmp.pending = true;
    comments = [tmp, ...(comments || [])];
    render();
    const pid = parentId == null ? null : Number.isFinite(Number(parentId)) ? Number(parentId) : parentId;
    try {
      const r = await post('/comments', {
        profile_wallet: target, commenter_wallet: me, comment_text: text,
        commenter_name: myName(), commenter_avatar: myAvatar(), parent_id: pid,
      });
      const saved = r.comment ? norm({ ...r.comment, commenter_name: r.comment.commenter_name || myName(), commenter_avatar: r.comment.commenter_avatar || myAvatar() }) : null;
      comments = comments.map((c) => (c.id === tmp.id ? saved || { ...tmp, pending: false } : c));
      render();
      if (saved) {
        const node = list.querySelector(`#c-${CSS.escape(saved.id)}`);
        if (node) rise(node, { px: 8, duration: 360 });
      }
      load({ quiet: true });
    } catch (e) {
      comments = comments.filter((c) => c.id !== tmp.id);
      render();
      throw e;
    }
  }

  async function remove(c, origin) {
    // Replies go with it (the server cascades), however deep.
    const gone = new Set([c.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of comments) if (x.parent_id && gone.has(x.parent_id) && !gone.has(x.id)) { gone.add(x.id); grew = true; }
    }
    const kids = gone.size - 1;
    const ok = await confirmDialog({
      title: 'Delete this comment?',
      body: kids === 1 ? 'Its reply goes with it. This can’t be undone.' : kids ? `Its ${kids} replies go with it. This can’t be undone.` : 'This can’t be undone.',
      confirm: 'Delete', danger: true, origin,
    });
    if (!ok) return;
    const before = comments;
    comments = comments.filter((x) => !gone.has(x.id));
    errors.delete(c.id);
    render();
    try {
      await del(`/comments/${encodeURIComponent(c.id)}`, { wallet_address: me });
      load({ quiet: true });
    } catch (e) {
      comments = before;
      errors.set(c.id, e.message || 'That comment wasn’t deleted.');
      render();
    }
  }

  // ── reactions ──
  const toState = (r) => {
    const users = r.userReactions || {};
    const key = Object.keys(users).find((k) => same(k, me));
    return { counts: r.counts || {}, mine: new Set(key ? users[key] : []) };
  };

  function paintReactions(id, root = list.querySelector(`#c-${CSS.escape(id)}`)) {
    if (!root) return;
    const row = root.querySelector('.prof-react');
    const st = reactions.get(id);
    const pills = st ? REACTIONS.filter((r) => st.counts[r.type] > 0).map((r) => h('button.prof-pill', {
      type: 'button', 'aria-pressed': String(st.mine.has(r.type)),
      'aria-label': `${r.label}: ${st.counts[r.type]}${st.mine.has(r.type) ? ', yours' : ''}`,
      onclick: () => react(id, r.type),
    }, h('span.prof-pill__e', { 'aria-hidden': 'true' }, r.emoji), h('span.num', st.counts[r.type]))) : [];
    fill(row, pills);
    row.hidden = !pills.length;
    root.querySelector('.prof-c__actions .prof-act')?.classList.toggle('is-on', !!st?.mine.size);
    if (picker?.id === id) {
      picker.tray.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', String(!!st?.mine.has(REACTIONS[i].type))));
    }
  }

  const rq = [];
  const asked = new Set();
  let inflight = 0;
  function want(id) {
    if (reactions.has(id) || asked.has(id) || id.startsWith('tmp-')) return;
    asked.add(id);
    rq.push(id);
    pumpReactions();
  }
  function pumpReactions() {
    while (inflight < 3 && rq.length) {
      const id = rq.shift();
      inflight += 1;
      api(`/comments/${encodeURIComponent(id)}/reactions`, { signal })
        .then((r) => { if (!busy.has(id)) { reactions.set(id, toState(r)); paintReactions(id); } })
        .catch(() => { asked.delete(id); /* decoration: a miss leaves the row empty until it scrolls in again */ })
        .finally(() => { inflight -= 1; if (!signal.aborted) pumpReactions(); });
    }
  }
  function watchReactions() {
    const nodes = list.querySelectorAll('.prof-c');
    if (!('IntersectionObserver' in window)) { nodes.forEach((n) => want(n.dataset.id)); return; }
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        want(e.target.dataset.id);
      }
    }, { rootMargin: '200px 0px' });
    nodes.forEach((n) => { if (!reactions.has(n.dataset.id)) io.observe(n); });
  }
  signal.addEventListener('abort', () => io?.disconnect(), { once: true });

  async function react(id, type) {
    const key = `${id}:${type}`;
    if (busy.has(key)) return;
    closePicker();
    const prev = reactions.get(id) || { counts: {}, mine: new Set() };
    const next = { counts: { ...prev.counts }, mine: new Set(prev.mine) };
    if (next.mine.has(type)) { next.mine.delete(type); next.counts[type] = Math.max(0, (next.counts[type] || 1) - 1); }
    else { next.mine.add(type); next.counts[type] = (next.counts[type] || 0) + 1; }
    reactions.set(id, next);
    errors.delete(id);
    const node = list.querySelector(`#c-${CSS.escape(id)}`);
    if (node) fill(node.querySelector('.prof-c__err'));
    paintReactions(id);
    busy.add(key);
    busy.add(id);
    try {
      const r = await post(`/comments/${encodeURIComponent(id)}/react`, { wallet_address: me, reaction_type: type });
      reactions.set(id, toState(r));
    } catch (e) {
      reactions.set(id, prev);
      const n = list.querySelector(`#c-${CSS.escape(id)}`);
      if (n) fill(n.querySelector('.prof-c__err'), errorLine(e.message || 'That reaction didn’t land.', { small: true }));
    } finally {
      busy.delete(key);
      busy.delete(id);
      paintReactions(id);
    }
  }

  // The picker: one small tray of the six reactions, under the React button.
  let picker = null;
  function openPicker(id, btn) {
    if (picker?.btn === btn) { closePicker(); return; }
    closePicker();
    const st = reactions.get(id);
    const tray = h('div.prof-picker', { role: 'menu', 'aria-label': 'React' },
      REACTIONS.map((r) => h('button.prof-picker__b', {
        type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(!!st?.mine.has(r.type)), 'aria-label': r.label, title: r.label,
        onclick: () => react(id, r.type),
      }, h('span', { 'aria-hidden': 'true' }, r.emoji))));
    btn.after(tray);
    btn.setAttribute('aria-expanded', 'true');
    picker = { id, btn, tray };
    // Keep the tray on screen next to a deeply indented reply.
    const over = tray.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
    if (over > 0) tray.style.left = `${-over}px`;
    rise(tray, { px: 6, duration: 220 });
    tray.querySelector('button')?.focus({ preventScroll: true });
    want(id);
  }
  function closePicker() {
    if (!picker) return;
    picker.btn.setAttribute('aria-expanded', 'false');
    picker.tray.remove();
    picker = null;
  }
  scope.on(document, 'click', (e) => { if (picker && !picker.tray.contains(e.target) && !picker.btn.contains(e.target)) closePicker(); }, { capture: true });
  scope.on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && picker) { const b = picker.btn; closePicker(); b.focus(); }
  });

  // ── deep link to one comment (?c=<id>) ──
  function reveal(id) {
    const node = list.querySelector(`#c-${CSS.escape(String(id))}`);
    if (!node) return;
    focusId = null;
    node.scrollIntoView({ block: 'center', behavior: document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    node.classList.add('is-focus');
    setTimeout(() => node.classList.remove('is-focus'), 2600);
  }

  load();
  return {
    el,
    focus(id) {
      if (!id) return;
      focusId = String(id);
      if (comments) reveal(focusId);
    },
    focusComposer: () => top.focus(),
    rename(name) {
      if (isOwner) return;
      top.ta.placeholder = `Write on ${name}’s wall`;
      top.ta.setAttribute('aria-label', top.ta.placeholder);
    },
  };
}

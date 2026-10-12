// The bulletin board: a composer, the feed of frosted post cards, and a post
// dialog with its threaded comments. Writes are optimistic; the server's
// answer settles them, and a refusal puts things back with its reason.

import { h, icon, fill, sleep } from '../../core/dom.js';
import { api, post, del } from '../../core/api.js';
import { dialog, confirmDialog, errorLine, toast, pane, skLine, skFigure, avatar, profileHref } from '../../core/ui.js';
import { leaf, rise, roll, skip, EASE } from '../../core/motion.js';
import { profile, equipped, role } from '../../core/data.js';
import { ago, num, short } from '../../core/format.js';
import { ART } from '../../core/art.js';
import { nameOf, avaSlot, ringUp, richText, urlsIn, previewCard, previewSkeleton, closeOnRoute } from './common.js';
import { reactionStore } from './reactions.js';

const PAGE = 20;
const POST_MAX = 1000;     // the old composer's limit (the server sets none)
const COMMENT_MAX = 500;   // likewise
const REFRESH = 60_000;
const MAX_DEPTH = 3;       // replies nest this deep, then continue flat with "↳ name"
const MOD_ROLES = new Set(['admin', 'master', 'moderator']);

const when = (t) => { const d = new Date(t); return Number.isNaN(+d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

function snippet(p) {
  const text = String(p.content || '').replace(/\bhttps?:\/\/(?:www\.)?([^/\s]+)\S*/gi, '$1').replace(/\s+/g, ' ').trim();
  const s = text || p.link_preview?.title || 'A link';
  return s.length > 70 ? `${s.slice(0, 68)}…` : s;
}

const skPost = (i) => h('div.frost.cm-post.cm-post--sk', { 'aria-hidden': 'true' },
  h('div.cm-post__head', h('span.sk.sk--circle', { style: { '--s': '44px', '--d': `${i * 90}ms` } }),
    h('div.stack', { style: { '--gap': '8px', flex: '1' } }, skLine('34%'), skLine('18%'))),
  h('div.stack', { style: { '--gap': '9px', marginTop: '16px' } }, skLine('92%'), skLine('74%'), skLine('40%')));

const skComments = () => h('div.stack', { 'aria-hidden': 'true', style: { '--gap': '18px', padding: '6px 0' } },
  [0, 1, 2].map((i) => h('div.cm-c__row', h('span.sk.sk--circle', { style: { '--s': '34px', '--d': `${i * 90}ms` } }),
    h('div.stack', { style: { '--gap': '8px', flex: '1' } }, skLine(`${26 + i * 7}%`), skLine(`${70 - i * 12}%`)))));

export function boardTab({ wallet, signal, scope, onDeepLinkDone }) {
  let posts = [];           // newest first; drafts carry `pending: true`
  const cards = new Map();  // String(id) → card element
  let started = false;
  let loaded = false;
  let exhausted = false;
  let loadingMore = false;
  let lastRefresh = 0;
  let active = false;
  let timer = 0;
  let seq = 0;
  let isMod = false;
  let open = null;          // the open post dialog: { id, sync() }
  let wanted = null;        // a deep link waiting for the feed: { id, comment }

  const byId = (id) => posts.find((p) => String(p.id) === String(id));

  role(wallet).subscribe((s) => {
    const was = isMod;
    isMod = MOD_ROLES.has(s.value?.role);
    if (was !== isMod) {
      open?.rerender(); // moderators get Delete on every comment
      rebuildCards(); // …and Remove on every post
    }
  }, signal);

  /** Rebuild the cards already on screen in place (no entrance), e.g. when moderator tools arrive. */
  function rebuildCards() {
    if (!loaded) return;
    for (const p of posts) {
      const key = String(p.id);
      const old = cards.get(key);
      if (!old || p.pending) continue;
      const next = card(p);
      cards.set(key, next);
      old.replaceWith(next);
    }
    ringUp(feed);
  }

  const store = reactionStore({
    wallet, signal,
    onTotal: (kind, id, total) => {
      if (kind !== 'post') return;
      const p = byId(id);
      if (!p) return;
      // The store now holds newer reactions than the list did: retire the
      // embedded copy so a re-render can't paint the old one back.
      if (p.reactions) p.reactions = null;
      if (p.reaction_count !== total) { p.reaction_count = total; paintRail(); }
    },
  });

  // A post's reactions: embedded in the list when the backend sends them (no
  // request at all); otherwise the feed's total, and the bar asks lazily.
  const syncRx = (p) => (p.reactions ? store.seed('post', p.id, p.reactions) : store.setTotal('post', p.id, p.reaction_count));
  const NO_REACTIONS = { counts: {}, userReactions: {} };

  // ── composer ──────────────────────────────────────────────────────────

  const me = { name: short(wallet), avatar: null, ring: null };
  const meAva = h('span.cm-compose__ava', avatar(null, { size: 44 }));
  const paintMe = () => fill(meAva, avatar(me.avatar, { size: 44, ring: me.ring }));
  profile(wallet).subscribe((s) => {
    if (!s.value) return;
    me.name = s.value.display_name?.trim() || short(wallet);
    me.avatar = s.value.avatar_nft || null;
    paintMe();
  }, signal);
  equipped(wallet).subscribe((s) => { if (s.value) { me.ring = s.value.ring || null; paintMe(); } }, signal);

  const ta = h('textarea', { rows: 3, maxLength: POST_MAX, placeholder: 'What’s happening in the park?', 'aria-label': 'Write a post' });
  const count = h('span.field__count.num');
  const pvSlot = h('div.cm-compose__pv');
  const composeErr = h('div.cm-compose__err');
  const postBtn = h('button.btn.btn--gold.cm-compose__post', { type: 'button', disabled: true, onclick: () => submit() }, icon('send'), 'Post');
  const composer = h('section.frost.frost--pad.cm-compose', { 'data-e': '', 'aria-label': 'New post' },
    h('div.cm-compose__row', meAva,
      h('div.cm-compose__main', h('div.field.cm-compose__field', ta, count), pvSlot, composeErr)),
    h('div.cm-compose__foot',
      h('span.cm-compose__hint', icon('link'), h('span', 'Paste a link for a preview card')),
      postBtn));

  let busy = false;
  const pv = { url: null, data: null, job: null, ctrl: null, timer: 0, dismissed: new Set() };
  scope.add(() => { clearTimeout(pv.timer); pv.ctrl?.abort(); });

  function onInput() {
    const n = ta.value.length;
    count.textContent = n ? `${num(n, 0)} / ${num(POST_MAX, 0)}` : '';
    count.classList.toggle('is-near', n > POST_MAX * 0.9);
    postBtn.disabled = busy || !ta.value.trim();
    clearTimeout(pv.timer);
    pv.timer = setTimeout(checkLink, 450);
  }
  ta.addEventListener('input', onInput);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });

  function checkLink() {
    const url = urlsIn(ta.value).find((u) => !pv.dismissed.has(u)) || null;
    if (url === pv.url) return;
    pv.ctrl?.abort();
    pv.url = url;
    pv.data = null;
    pv.job = null;
    if (!url) { fill(pvSlot); return; }
    const ctrl = (pv.ctrl = new AbortController());
    fill(pvSlot, previewSkeleton());
    pv.job = api(`/link-preview?url=${encodeURIComponent(url)}`, { signal: ctrl.signal, timeout: 15_000 })
      .then((d) => {
        if (pv.url !== url) return;
        pv.data = d && d.url ? { url, title: d.title || '', description: d.description || '', image: d.image || null, type: d.type || 'website' } : null;
        const card = pv.data ? previewCard(pv.data, { onRemove: dropPreview }) : null;
        fill(pvSlot, card);
        if (card) rise(card, { px: 8, duration: 360 });
      })
      .catch(() => { if (pv.url === url) { pv.data = null; fill(pvSlot); } });
  }

  function dropPreview() {
    if (pv.url) pv.dismissed.add(pv.url);
    pv.ctrl?.abort();
    pv.url = null;
    pv.data = null;
    pv.job = null;
    fill(pvSlot);
    ta.focus({ preventScroll: true });
  }

  async function submit() {
    const content = ta.value.trim();
    if (!content || busy) return;
    busy = true;
    postBtn.disabled = true;
    ta.disabled = true;
    fill(composeErr);
    clearTimeout(pv.timer);
    checkLink();
    // A preview still on its way gets a few seconds to arrive.
    if (pv.url && !pv.data && pv.job) await Promise.race([pv.job, sleep(4000, signal)]);
    if (signal.aborted) return;
    const link_preview = pv.data && urlsIn(content).includes(pv.data.url) ? pv.data : null;

    const draft = {
      id: `tmp-${++seq}`, pending: true, wallet_address: wallet, author_name: me.name, author_avatar: me.avatar,
      content, link_preview, comment_count: 0, reaction_count: 0, created_at: new Date().toISOString(),
    };
    posts.unshift(draft);
    renderFeed();
    try {
      const saved = await post('/bulletin/posts', { wallet_address: wallet, content, link_preview }, { signal });
      const i = posts.indexOf(draft);
      if (saved?.id != null && i >= 0) {
        posts[i] = { ...saved, comment_count: saved.comment_count ?? 0, reaction_count: 0, reactions: saved.reactions || NO_REACTIONS };
        swapCard(draft.id, posts[i]);
      } else {
        posts = posts.filter((p) => p !== draft);
        dropCard(draft.id, false);
        refresh();
      }
      ta.value = '';
      pv.ctrl?.abort();
      Object.assign(pv, { url: null, data: null, job: null });
      pv.dismissed.clear();
      fill(pvSlot);
      ta.blur();
      paintRail();
      toast({ eyebrow: 'BULLETIN BOARD', title: 'You’re on the board', body: 'Your post is live for every BEAR.' });
    } catch (err) {
      if (signal.aborted) return;
      posts = posts.filter((p) => p !== draft);
      dropCard(draft.id, true);
      fill(composeErr, errorLine(`Your post didn’t go up. ${err.message}`));
    } finally {
      busy = false;
      ta.disabled = false;
      onInput();
    }
  }

  // ── the feed ──────────────────────────────────────────────────────────

  const feedErr = h('div.cm-feed-err');
  const feed = h('div.cm-feed', { role: 'feed', 'aria-label': 'Bulletin board', 'aria-busy': 'true' }, [0, 1, 2].map(skPost));
  const feedState = h('div.cm-feed-state');
  const moreSlot = h('div.cm-more');

  function card(p) {
    const own = p.wallet_address === wallet;
    const name = nameOf(p);
    const time = h('time.cm-post__time', { dateTime: p.created_at, title: when(p.created_at) }, p.pending ? 'just now' : ago(p.created_at));
    const talkN = h('span.num', num(p.comment_count || 0, 0));
    const talk = p.pending ? null : h('button.cm-post__talk', {
      type: 'button',
      'aria-label': `${p.comment_count || 0} comments — open the post`,
      onclick: (e) => { e.stopPropagation(); openPost(p.id, el, { write: true }); },
    }, icon('comment'), talkN);
    // Your own posts, and (for moderators) anyone's: the server allows both.
    const delBtn = (own || isMod) && !p.pending
      ? h('button.icon-btn.cm-post__del', { type: 'button', 'aria-label': own ? 'Delete your post' : `Remove ${name}'s post`, title: own ? 'Delete' : 'Remove (moderator)', onclick: (e) => { e.stopPropagation(); removePost(p.id, e.currentTarget, null, !own); } }, icon('trash'))
      : null;
    const el = h(`article.frost.cm-post${p.pending ? '.is-pending' : ''}`, { dataset: { id: String(p.id) }, 'aria-label': `Post by ${name}` },
      h('header.cm-post__head',
        h('a.cm-who', { href: profileHref(p.wallet_address) },
          avaSlot(p.author_avatar, p.wallet_address, 44),
          h('span.cm-who__text', h('span.cm-who__name', name), time)),
        delBtn),
      p.content ? h('p.cm-post__text', richText(p.content)) : null,
      p.link_preview ? previewCard(p.link_preview) : null,
      p.pending ? null : h('footer.cm-post__foot', (syncRx(p), store.bar('post', p.id, { total: p.reaction_count })), talk));
    el.addEventListener('click', (e) => {
      if (p.pending || e.target.closest('a, button, .cm-picker')) return;
      if (String(getSelection?.() || '').length) return; // selecting text, not opening
      openPost(p.id, el);
    });
    Object.assign(el, { _time: time, _talkN: talkN, _talk: talk });
    return el;
  }

  function updateCard(el, p) {
    if (p.pending) return;
    el._time.textContent = ago(p.created_at);
    if (el._talkN) {
      el._talkN.textContent = num(p.comment_count || 0, 0);
      el._talk.setAttribute('aria-label', `${p.comment_count || 0} comments — open the post`);
    }
    syncRx(p);
  }

  function swapCard(oldId, p) {
    const old = cards.get(String(oldId));
    const next = card(p);
    cards.delete(String(oldId));
    cards.set(String(p.id), next);
    if (old?.isConnected) old.replaceWith(next);
    else renderFeed();
    ringUp(next);
  }

  function dropCard(id, animate) {
    const key = String(id);
    const el = cards.get(key);
    if (!el) return;
    cards.delete(key);
    if (!animate || skip()) { el.remove(); return; }
    el.style.pointerEvents = 'none';
    el.style.transformOrigin = 'left center';
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'perspective(900px) translateX(-24px) rotateY(-26deg)' }],
      { duration: 280, easing: EASE.accel, fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove());
  }

  function renderFeed() {
    if (!loaded) return;
    feed.removeAttribute('aria-busy');
    fill(feedState);
    const created = [];
    const seen = new Set();
    let prev = null;
    for (const p of posts) {
      const key = String(p.id);
      seen.add(key);
      let el = cards.get(key);
      if (!el) { el = card(p); cards.set(key, el); created.push(el); } else updateCard(el, p);
      const want = prev ? prev.nextElementSibling : feed.firstElementChild;
      if (want !== el) feed.insertBefore(el, want);
      prev = el;
    }
    for (const [key, el] of cards) if (!seen.has(key)) { cards.delete(key); el.remove(); }
    for (const child of [...feed.children]) if (!child.dataset.id) child.remove();
    if (!posts.length) {
      feedState.append(h('div.frost.cm-quiet',
        h('img.cm-quiet__sign', { src: ART.sign, alt: '', loading: 'lazy' }),
        h('div', h('b', 'The board is quiet'), h('p', 'Be the first BEAR to post something.'))));
    }
    if (created.length) { leaf(created); ringUp(feed); }
    paintRail();
    paintMore();
  }

  function paintMore() {
    if (!loaded || !posts.length || loadingMore) return;
    if (exhausted) {
      fill(moreSlot, h('p.cm-end', h('span.tri', { style: { '--tri-w': '44px' } }), 'That’s the whole board'));
      return;
    }
    fill(moreSlot, h('button.btn.btn--line.cm-more__btn', { type: 'button', onclick: loadMore }, 'Load more', icon('chevron-down')));
  }

  async function loadFirst() {
    feed.setAttribute('aria-busy', 'true');
    try {
      const page = await api(`/bulletin/posts?limit=${PAGE}&offset=0`, { signal });
      const list = Array.isArray(page) ? page : [];
      posts = [...posts.filter((p) => p.pending), ...list];
      exhausted = list.length < PAGE;
      loaded = true;
      lastRefresh = Date.now();
      renderFeed();
      if (wanted) openWanted();
    } catch (err) {
      if (signal.aborted) return;
      fill(feed);
      fill(feedState, h('div.stack', { style: { '--gap': '12px', alignItems: 'flex-start' } },
        errorLine(`The board didn’t load. ${err.message}`),
        h('button.btn.btn--line.btn--sm', { type: 'button', onclick: () => { fill(feedState); fill(feed, [0, 1, 2].map(skPost)); loadFirst(); } }, icon('refresh'), 'Try again')));
      paintRail(err);
    } finally {
      schedule();
    }
  }

  async function loadMore() {
    if (loadingMore || exhausted) return;
    loadingMore = true;
    fill(moreSlot, h('div.stack', { style: { '--gap': '14px' } }, skPost(0), skPost(1)));
    const real = posts.filter((p) => !p.pending).length;
    try {
      const page = await api(`/bulletin/posts?limit=${PAGE}&offset=${real}`, { signal });
      const list = Array.isArray(page) ? page : [];
      const have = new Set(posts.map((p) => String(p.id)));
      posts.push(...list.filter((p) => !have.has(String(p.id))));
      exhausted = list.length < PAGE;
      loadingMore = false;
      fill(moreSlot);
      renderFeed();
    } catch (err) {
      loadingMore = false;
      if (signal.aborted) return;
      paintMore();
      moreSlot.prepend(errorLine(`More posts didn’t load. ${err.message}`, { small: true }));
    }
  }

  /** One request for everything on screen: new posts, fresh counts, deletions. */
  async function refresh() {
    if (!loaded) return loadFirst();
    const real = posts.filter((p) => !p.pending);
    const n = Math.min(100, Math.max(PAGE, real.length));
    try {
      const fresh = await api(`/bulletin/posts?limit=${n}&offset=0`, { signal });
      if (!Array.isArray(fresh)) return;
      lastRefresh = Date.now();
      const ids = new Set(fresh.map((p) => String(p.id)));
      const complete = fresh.length < n;
      const oldest = fresh.length ? Date.parse(fresh.at(-1).created_at) : Infinity;
      const tail = complete ? [] : real.filter((p) => !ids.has(String(p.id)) && Date.parse(p.created_at) < oldest);
      if (complete) exhausted = true;
      posts = [...posts.filter((p) => p.pending), ...fresh, ...tail];
      renderFeed();
      open?.sync();
    } catch { /* keep what's on screen; the next tick tries again */ }
  }

  function schedule() {
    clearTimeout(timer);
    if (!active || document.hidden || signal.aborted) return;
    timer = setTimeout(async () => { await refresh(); schedule(); }, REFRESH);
  }
  function wake() {
    if (loaded && Date.now() - lastRefresh >= REFRESH) refresh().finally(schedule);
    else schedule();
  }
  scope.add(() => clearTimeout(timer));
  scope.on(document, 'visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (active) wake(); });

  async function removePost(id, btn, d = null, asMod = false) {
    const ok = await confirmDialog({
      title: asMod ? 'Remove this post from the board?' : 'Delete this post?',
      body: asMod ? 'You’re removing it as a moderator. Its comments and reactions go with it. This can’t be undone.' : 'Its comments and reactions go with it. This can’t be undone.',
      confirm: asMod ? 'Remove post' : 'Delete post', danger: true, origin: btn,
    });
    if (!ok || signal.aborted) return;
    if (d) await d.close();
    const i = posts.findIndex((p) => String(p.id) === String(id));
    if (i < 0) return;
    const [gone] = posts.splice(i, 1);
    fill(feedErr);
    dropCard(id, true);
    paintRail();
    if (!posts.length) renderFeed();
    try {
      await del(`/bulletin/posts/${id}`, { wallet_address: wallet }, { signal });
    } catch (err) {
      if (signal.aborted) return;
      posts.splice(Math.min(i, posts.length), 0, gone);
      renderFeed();
      fill(feedErr, errorLine(`${asMod ? 'The post wasn’t removed.' : 'Your post wasn’t deleted.'} ${err.message}`));
    }
  }

  // ── the rail: the board in numbers, what's loved, what's talked about ──

  const totalFig = h('div.tile__value.num', skFigure('1.4em'));
  const totalSub = h('div.tile__sub', ' ');
  const boardTile = h('div.tile.tile--gold.cm-board-tile',
    h('img.tile__mascot', { src: ART.sign, alt: '', loading: 'lazy' }),
    h('div.tile__label', 'Bulletin board'),
    h('div.stack', { style: { '--gap': '4px' } }, totalFig, h('div.tile__sub', 'posts from the BEARs'), totalSub));
  const loved = h('div.rows', skRail());
  const talked = h('div.rows', skRail());
  const rail = h('aside.stack.cm-rail', { 'data-e': '', style: { '--gap': '16px' }, 'aria-label': 'Board highlights' },
    boardTile,
    pane({ title: 'Most loved', body: [loved] }),
    pane({ title: 'Most talked about', body: [talked] }));

  function skRail() {
    return [0, 1, 2].map((i) => h('div.sk-row', h('span.sk.sk--circle', { style: { '--s': '32px', '--d': `${i * 90}ms` } }),
      h('div.sk-row__main', h('span.sk.sk--line', { style: { '--w': '72%' } }), h('span.sk.sk--line', { style: { '--w': '40%', height: '9px' } }))));
  }

  function railRows(list, key, glyph, none) {
    if (!list.length) return h('p.cm-rail__none', none);
    return list.map((p) => h('button.row.cm-rail__row', { type: 'button', onclick: (e) => openPost(p.id, e.currentTarget) },
      avaSlot(p.author_avatar, p.wallet_address, 32),
      h('span.row__main', h('span.row__title', snippet(p)), h('span.row__sub', `${nameOf(p)} · ${ago(p.created_at)}`)),
      h('span.row__value.cm-rail__v', icon(glyph), num(p[key], 0))));
  }

  function paintRail(err = null) {
    if (err && !loaded) {
      fill(totalFig, h('span.failed', '—'));
      totalSub.textContent = "couldn't load · retrying";
      fill(loved);
      fill(talked);
      return;
    }
    if (!loaded) return;
    const real = posts.filter((p) => !p.pending);
    const top = (k) => real.filter((p) => Number(p[k]) > 0)
      .sort((a, b) => b[k] - a[k] || Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 4);
    roll(totalFig, `${num(real.length, 0)}${exhausted ? '' : '+'}`);
    const c = real.reduce((a, p) => a + (Number(p.comment_count) || 0), 0);
    const r = real.reduce((a, p) => a + (Number(p.reaction_count) || 0), 0);
    totalSub.textContent = `${num(c, 0)} comments · ${num(r, 0)} reactions`;
    fill(loved, railRows(top('reaction_count'), 'reaction_count', 'heart', 'No reactions yet.'));
    fill(talked, railRows(top('comment_count'), 'comment_count', 'comment', 'No comments yet.'));
    ringUp(rail);
  }

  // ── the post dialog ───────────────────────────────────────────────────

  function openPost(id, origin, { write = false, comment = null } = {}) {
    const p = byId(id);
    if (!p || p.pending || open) return;
    const life = new AbortController();
    const stop = () => life.abort();
    signal.addEventListener('abort', stop, { once: true });
    const sig = life.signal;
    let comments = null;
    let replyTo = null;
    let sending = false;

    const own = p.wallet_address === wallet;
    const name = nameOf(p);
    const delBtn = own || isMod
      ? h('button.btn.btn--danger.btn--sm', { type: 'button', 'aria-label': own ? 'Delete your post' : `Remove ${name}'s post (moderator)`, onclick: (e) => removePost(p.id, e.currentTarget, d, !own) }, icon('trash'), own ? 'Delete' : 'Remove')
      : null;
    const countEl = h('span.section__aside.num', num(p.comment_count || 0, 0));
    const thread = h('div.cm-thread', skComments());
    const replying = h('div.cm-replying');
    const replyErr = h('div.cm-reply__err');
    const box = h('textarea', { rows: 1, maxLength: COMMENT_MAX, placeholder: 'Add a comment', 'aria-label': 'Comment', autofocus: write && matchMedia('(pointer: fine)').matches });
    const boxCount = h('span.field__count.num');
    const send = h('button.btn.btn--gold.cm-reply__send', { type: 'button', disabled: true, onclick: () => submitComment() }, 'Comment');

    const d = dialog({
      eyebrow: 'BULLETIN BOARD', label: `Post by ${name}`, size: 'wide', origin,
      body: [
        h('article.cm-full',
          h('header.cm-full__head',
            h('a.cm-who.cm-who--lg', { href: profileHref(p.wallet_address) },
              avaSlot(p.author_avatar, p.wallet_address, 52),
              h('span.cm-who__text', h('span.cm-who__name', name), h('time.cm-post__time', { dateTime: p.created_at, title: when(p.created_at) }, ago(p.created_at)))),
            delBtn),
          p.content ? h('p.cm-full__text', richText(p.content)) : null,
          p.link_preview ? previewCard(p.link_preview) : null,
          h('div.cm-full__rx', (syncRx(byId(p.id) || p), store.bar('post', p.id, { total: p.reaction_count })))),
        h('div.cm-full__chead', h('div.eyebrow', 'Comments'), countEl),
        thread,
      ],
      foot: [h('div.cm-reply', replying, replyErr, h('div.cm-reply__row', h('div.field.cm-reply__field', box, boxCount), send))],
      onClose: () => {
        life.abort();
        signal.removeEventListener('abort', stop);
        open = null;
        onDeepLinkDone?.();
      },
    });
    closeOnRoute(d);
    ringUp(d.el);

    open = {
      id: p.id,
      sync() { const cur = byId(p.id); if (!cur) d.close(); },
      rerender() { if (comments) renderThread(); },
    };

    const grow = () => {
      box.style.height = 'auto';
      box.style.height = `${Math.min(box.scrollHeight + 2, 160)}px`;
      box.style.overflowY = box.scrollHeight > 160 ? 'auto' : 'hidden';
    };
    box.addEventListener('input', () => {
      const n = box.value.length;
      boxCount.textContent = n > COMMENT_MAX * 0.8 ? `${n} / ${COMMENT_MAX}` : '';
      boxCount.parentElement.classList.toggle('is-counting', !!boxCount.textContent);
      grow();
      send.disabled = sending || comments === null || !box.value.trim();
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitComment(); } });

    function setCount(n) {
      const cur = byId(p.id) || p;
      cur.comment_count = n;
      countEl.textContent = num(n, 0);
      const el = cards.get(String(p.id));
      if (el) updateCard(el, cur);
      paintRail();
    }

    function loadComments() {
      api(`/bulletin/posts/${p.id}/comments`, { signal: sig }).then((list) => {
        comments = Array.isArray(list) ? list : [];
        // Embedded reactions mean no per-comment request; without them the bars ask lazily.
        for (const c of comments) if (c?.reactions) store.seed('comment', c.id, c.reactions);
        setCount(comments.length);
        renderThread(true);
        send.disabled = !box.value.trim();
        if (comment != null) spotlight(comment);
      }).catch((err) => {
        if (sig.aborted) return;
        fill(thread, h('div.stack', { style: { '--gap': '12px', alignItems: 'flex-start', padding: '6px 0' } },
          errorLine(`Comments didn’t load. ${err.message}`),
          h('button.btn.btn--line.btn--sm', { type: 'button', onclick: () => { fill(thread, skComments()); loadComments(); } }, icon('refresh'), 'Try again')));
      });
    }
    loadComments();

    function renderThread(first = false) {
      countEl.textContent = num(comments.length, 0);
      if (!comments.length) {
        fill(thread, h('p.cm-thread__empty', 'No comments yet. Start the conversation.'));
        return;
      }
      const index = new Map(comments.map((c) => [String(c.id), c]));
      const kids = new Map();
      for (const c of comments) {
        const parent = c.parent_id != null && index.has(String(c.parent_id)) ? String(c.parent_id) : 'root';
        if (!kids.has(parent)) kids.set(parent, []);
        kids.get(parent).push(c);
      }
      const build = (c, depth) => {
        const parent = depth > MAX_DEPTH ? index.get(String(c.parent_id)) : null;
        const node = commentNode(c, parent);
        const children = kids.get(String(c.id)) || [];
        if (!children.length) return [node];
        if (depth < MAX_DEPTH) {
          node.append(h('div.cm-c__replies', children.flatMap((ch) => build(ch, depth + 1))));
          return [node];
        }
        return [node, ...children.flatMap((ch) => build(ch, depth + 1))];
      };
      fill(thread, (kids.get('root') || []).flatMap((c) => build(c, 0)));
      ringUp(thread);
      if (first) leaf(thread.children);
    }

    function commentNode(c, flatParent) {
      const mine = c.wallet_address === wallet;
      const canDelete = !c.pending && (mine || isMod);
      const who = nameOf(c);
      return h(`div.cm-c${c.pending ? '.is-pending' : ''}`, { dataset: { id: String(c.id) } },
        h('div.cm-c__row',
          h('a.cm-c__ava', { href: profileHref(c.wallet_address), tabIndex: -1, 'aria-hidden': 'true' }, avaSlot(c.author_avatar, c.wallet_address, 34)),
          h('div.cm-c__body',
            h('div.cm-c__meta',
              h('a.cm-c__name', { href: profileHref(c.wallet_address) }, who),
              h('time.cm-c__time', { dateTime: c.created_at, title: when(c.created_at) }, c.pending ? 'just now' : ago(c.created_at))),
            flatParent ? h('div.cm-c__to', icon('reply'), h('span', nameOf(flatParent))) : null,
            h('p.cm-c__text', richText(c.content)),
            c.pending ? null : h('div.cm-c__actions',
              store.bar('comment', c.id, { compact: true }),
              h('button.cm-c__act', { type: 'button', onclick: () => setReply(c) }, icon('reply'), 'Reply'),
              canDelete ? h('button.cm-c__act.cm-c__act--del', { type: 'button', 'aria-label': mine ? 'Delete your comment' : `Delete ${who}'s comment`, onclick: (e) => removeComment(c, e.currentTarget) }, icon('trash'), 'Delete') : null))));
    }

    function setReply(c) {
      replyTo = c;
      fill(replying,
        h('span.cm-replying__text', icon('reply'), 'Replying to ', h('b', nameOf(c))),
        h('button.icon-btn.cm-replying__x', { type: 'button', 'aria-label': 'Cancel reply', onclick: () => clearReply(true) }, icon('close')));
      rise(replying, { px: 6, duration: 260 });
      box.focus();
    }
    function clearReply(refocus) {
      replyTo = null;
      fill(replying);
      if (refocus) box.focus();
    }

    function spotlight(cid) {
      const el = thread.querySelector(`.cm-c[data-id="${CSS.escape(String(cid))}"]`);
      if (!el) return;
      el.classList.add('is-target');
      requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
      setTimeout(() => el.classList.remove('is-target'), 2600);
    }

    async function submitComment() {
      const content = box.value.trim();
      if (!content || sending || comments === null) return;
      sending = true;
      send.disabled = true;
      box.disabled = true;
      fill(replyErr);
      const parent = replyTo;
      const draft = {
        id: `tmp-${++seq}`, pending: true, post_id: p.id, wallet_address: wallet, author_name: me.name, author_avatar: me.avatar,
        content, parent_id: parent ? parent.id : null, created_at: new Date().toISOString(),
      };
      comments.push(draft);
      renderThread();
      thread.querySelector(`.cm-c[data-id="${draft.id}"]`)?.scrollIntoView({ block: 'nearest' });
      try {
        const saved = await post('/bulletin/comments', { post_id: p.id, wallet_address: wallet, content, parent_id: parent ? parent.id : null }, { signal: sig });
        const i = comments.indexOf(draft);
        if (i >= 0) comments[i] = saved?.id != null ? saved : { ...draft, pending: false };
        if (saved?.id != null) store.seed('comment', saved.id, saved.reactions || NO_REACTIONS); // brand new: nobody has reacted
        box.value = '';
        boxCount.textContent = '';
        boxCount.parentElement.classList.remove('is-counting');
        grow();
        clearReply(false);
        setCount(comments.length);
        renderThread();
        const el = thread.querySelector(`.cm-c[data-id="${CSS.escape(String(saved?.id))}"]`);
        if (el) rise(el, { px: 8, duration: 380 });
      } catch (err) {
        if (sig.aborted) return;
        comments = comments.filter((c) => c !== draft);
        renderThread();
        fill(replyErr, errorLine(`Your comment didn’t post. ${err.message}`, { small: true }));
      } finally {
        sending = false;
        if (!sig.aborted) {
          box.disabled = false;
          send.disabled = !box.value.trim();
          box.focus({ preventScroll: true });
        }
      }
    }

    async function removeComment(c, btn) {
      const ok = await confirmDialog({ title: 'Delete this comment?', body: 'Replies to it go with it. This can’t be undone.', confirm: 'Delete', danger: true, origin: btn });
      if (!ok || sig.aborted) return;
      const gone = new Set([String(c.id)]);
      for (let grew = true; grew;) {
        grew = false;
        for (const x of comments) {
          if (x.parent_id != null && gone.has(String(x.parent_id)) && !gone.has(String(x.id))) { gone.add(String(x.id)); grew = true; }
        }
      }
      const before = comments;
      comments = comments.filter((x) => !gone.has(String(x.id)));
      if (replyTo && gone.has(String(replyTo.id))) clearReply(false);
      fill(replyErr);
      setCount(comments.length);
      renderThread();
      try {
        await del(`/bulletin/comments/${c.id}`, { wallet_address: wallet }, { signal: sig });
      } catch (err) {
        if (sig.aborted) return;
        comments = before;
        setCount(comments.length);
        renderThread();
        fill(replyErr, errorLine(`The comment wasn’t deleted. ${err.message}`, { small: true }));
      }
    }
  }

  // ── deep links: #/community?post=<id>&comment=<id> ──

  function openWanted() {
    const { id, comment } = wanted;
    wanted = null;
    if (byId(id)) { openPost(id, null, { comment }); return; }
    // Older than the first page: one wider read, then give up politely.
    api('/bulletin/posts?limit=100&offset=0', { signal }).then((list) => {
      const found = Array.isArray(list) && list.find((p) => String(p.id) === String(id));
      if (!found) { fill(feedErr, errorLine('That post is no longer on the board.')); onDeepLinkDone?.(); return; }
      const have = new Set(posts.map((p) => String(p.id)));
      posts.push(...list.filter((p) => !have.has(String(p.id))));
      exhausted = list.length < 100;
      renderFeed();
      openPost(id, null, { comment });
    }).catch(() => {});
  }

  function want(id, comment = null) {
    if (!id || !/^\d+$/.test(String(id))) return;
    if (open && String(open.id) === String(id)) return;
    wanted = { id, comment };
    if (loaded) openWanted();
  }

  const el = h('div.cols.cols--main.cm-board',
    h('div.stack.cm-board__main', { style: { '--gap': '14px' } },
      composer,
      h('div.stack', { 'data-e': '', style: { '--gap': '14px' } }, feedErr, feed, feedState, moreSlot)),
    rail);

  return {
    el,
    show() {
      active = true;
      if (!started) { started = true; loadFirst(); } else wake();
    },
    hide() {
      active = false;
      clearTimeout(timer);
    },
    want,
  };
}

// BEAR NFTs on a profile: the gallery (BEAR collection vs Pixel BEARs), the
// detail dialog, and the NFT tiles the avatar picker shares. Art resolves
// lazily as tiles scroll in, through one small queue, so a wallet with a
// hundred bears never fires a hundred metadata reads at once.

import { h, icon, fill } from '../../core/dom.js';
import { pivot, dialog, empty, errorLine, external, copyButton, toast } from '../../core/ui.js';
import { leaf, rise } from '../../core/motion.js';
import { ipfsLadder } from '../../core/media.js';
import { ladder, ladderEl, fetchMeta, cachedMeta } from './ipfs.js';
import { bearNfts } from '../../core/ledger.js';
import { BEAR, LINKS } from '../../core/market.js';
import { hexToUtf8, short, num } from '../../core/format.js';

// ---------------------------------------------------------------------------
// What an NFT is, before any metadata arrives

/** 'bear' (the BEAR collection), 'pixel' (taxon 2) or 'other' (not a BEAR NFT). */
export const kindOf = (n) => (n.Issuer !== BEAR.nftIssuer ? 'other' : n.NFTokenTaxon === 2 ? 'pixel' : 'bear');
export const KIND_LABEL = { bear: 'BEAR collection', pixel: 'Pixel BEAR', other: 'NFT' };

/** "Pixel BEAR #2456" straight from the on-ledger URI's file name, when it carries one. */
export function nameFromUri(n) {
  if (!n?.URI) return null;
  const text = hexToUtf8(n.URI);
  let seg = text.slice(text.lastIndexOf('/') + 1).replace(/\.json$/i, '');
  try { seg = decodeURIComponent(seg); } catch { /* keep it raw */ }
  return seg && seg.length < 60 && /#\d+/.test(seg) && /[a-z]/i.test(seg) ? seg : null;
}

export const fallbackName = (n) => `${{ bear: 'BEAR', pixel: 'Pixel BEAR', other: 'NFT' }[kindOf(n)]} ·${n.NFTokenID.slice(-4)}`;

// Every Pixel BEAR's art lives in one IPFS folder, named by its number, so the
// grid can paint without reading 100 metadata files first. The metadata still
// answers when this misses (and for traits, in the detail view).
const PIXEL_ART = 'ipfs://bafybeicosh5bbjcq6xc24tmmpuzrvepd37pgef4oa2yw5z7o4gj3vu4osm/pixel-bear-#';
export function quickImage(n) {
  if (kindOf(n) !== 'pixel') return null;
  const m = /#(\d+)/.exec(nameFromUri(n) || '');
  return m ? `${PIXEL_ART}${m[1]}.png` : null;
}

const isVideo = (url) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || '');

// ---------------------------------------------------------------------------
// Metadata through a small queue (cache hits skip it)

const queue = [];
let active = 0;
const LIMIT = 5;

export function resolveMeta(n, signal) {
  if (!n?.URI) return Promise.resolve(null);
  const hit = cachedMeta(n.URI);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => { queue.push({ uri: n.URI, resolve, signal }); pump(); });
}
function pump() {
  while (active < LIMIT && queue.length) {
    const job = queue.shift();
    if (job.signal?.aborted) { job.resolve(null); continue; }
    active += 1;
    fetchMeta(job.uri).catch(() => null).then((meta) => {
      active -= 1;
      job.resolve(meta);
      pump();
    });
  }
}

/** The JSON the server stores as profiles.avatar_nft (the shape every reader parses). */
export function avatarJson(n, meta) {
  const still = meta?.image ? ipfsLadder(meta.image)[0] : null;
  const anim = meta?.animation ? ipfsLadder(meta.animation)[0] : null;
  if (!still && !anim) return null;
  return JSON.stringify({
    nftId: n.NFTokenID,
    imageUrl: anim || still,
    fallbackImageUrl: anim ? still : null,
    bearName: meta.name || nameFromUri(n) || fallbackName(n),
    isAnimated: !!meta.animation,
  });
}

// ---------------------------------------------------------------------------
// Tiles

/**
 * A square NFT tile: skeleton → art (lazy) and its name. `tag` is the element
 * (a button by default). The tile gets `.load()` (start resolving) and `.meta`.
 */
export function nftTile(n, { signal, onClick, pressed = null, label = null } = {}) {
  const kind = kindOf(n);
  const guess = nameFromUri(n);
  const art = h(`span.prof-nft__art${kind === 'pixel' ? '.is-pixel' : ''}`, h('span.sk.sk--block'));
  const name = h('span.prof-nft__name', guess || h('span.sk.sk--line', { style: { '--w': '70%' } }));
  const tile = h('button.prof-nft', {
    type: 'button',
    'aria-pressed': pressed == null ? null : String(pressed),
    'aria-label': label || guess || KIND_LABEL[kind],
    onclick: onClick ? (e) => onClick(e, tile) : null,
  }, art, name);
  tile.meta = undefined;

  let started = false;
  const showImg = (url, onFail) => {
    const img = h('img', { alt: '', decoding: 'async', referrerPolicy: 'no-referrer', onload: () => art.classList.add('is-in') });
    art.querySelector('img')?.remove();
    art.append(img);
    ladderEl(img, url, onFail, { width: 180, nftId: n.NFTokenID }); // a grid tile: the first frame, sized
  };
  const none = () => {
    art.querySelector('img')?.remove();
    if (!art.querySelector('.prof-nft__none')) art.append(h('span.prof-nft__none', icon('image')));
    art.classList.add('is-in', 'is-none');
  };
  const viaMeta = async () => {
    const meta = await resolveMeta(n, signal);
    if (signal?.aborted) return;
    tile.meta = meta;
    const title = meta?.name || guess || fallbackName(n);
    if (!guess || meta?.name) fill(name, title);
    tile.setAttribute('aria-label', label || title);
    const url = meta?.image || (isVideo(meta?.animation) ? '' : meta?.animation);
    if (url) showImg(url, none);
    else none();
  };
  tile.load = () => {
    if (started) return;
    started = true;
    const quick = quickImage(n);
    if (quick) showImg(quick, viaMeta);
    else viaMeta();
  };
  return tile;
}

/** Start each tile's art when it scrolls near view (inside `root`, or the page). */
export function lazyLoad(tiles, { root = null, signal } = {}) {
  if (!('IntersectionObserver' in window)) { tiles.forEach((t) => t.load()); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      e.target.load?.();
    }
  }, { root, rootMargin: '240px 0px' });
  tiles.forEach((t) => io.observe(t));
  signal?.addEventListener('abort', () => io.disconnect(), { once: true });
  return () => io.disconnect();
}

// ---------------------------------------------------------------------------
// The gallery

const PAGE = 24;

/**
 * nftGallery({ wallet, isSelf, signal, onAvatar }) — BEAR NFTs held by `wallet`.
 * `onAvatar(n, meta)` (own profile only) makes one the profile picture.
 */
export function nftGallery({ wallet, isSelf, signal, onAvatar }) {
  const aside = h('span.prof-nfts__count');
  const tabsSlot = h('div.prof-nfts__tabs');
  const body = h('div.prof-nfts__body', h('div.prof-gallery', Array.from({ length: 8 }, (_, i) =>
    h('span.prof-nft.prof-nft--sk', h('span.prof-nft__art', h('span.sk.sk--block', { style: { '--d': `${i * 60}ms` } })), h('span.sk.sk--line', { style: { '--w': '60%' } })))));
  const el = h('section.frost.frost--section.prof-nfts', { 'data-e': '' },
    h('div.pane-head', h('div.eyebrow', 'BEAR NFTs'), h('div.section__aside', aside)),
    tabsSlot, h('div.rule'), body);

  let sig = '';
  let groups = { bear: [], pixel: [] };
  let tab = null;
  let stopLazy = () => {};

  function paintTab() {
    stopLazy();
    const list = groups[tab] || [];
    if (!list.length) {
      fill(body, empty(tab === 'pixel' ? 'No Pixel BEARs' : 'No BEAR collection NFTs',
        h('span', isSelf ? 'Pick one up on xrp.cafe and it shows here. ' : 'None in this wallet right now. ',
          h('a.prof-link', { href: tab === 'pixel' ? LINKS.xrpcafePixel : LINKS.xrpcafe, target: '_blank', rel: 'noopener' }, 'Browse the collection'))));
      return;
    }
    const grid = h('div.prof-gallery');
    const more = h('div.prof-more');
    let shown = 0;
    const addPage = () => {
      const next = list.slice(shown, shown + PAGE).map((n) => nftTile(n, {
        signal,
        onClick: (e, tile) => openNft(n, { origin: tile, meta: tile.meta, onAvatar: isSelf ? onAvatar : null, signal }),
      }));
      grid.append(...next);
      shown += next.length;
      stopLazy = lazyLoad([...grid.children].slice(shown - next.length), { signal });
      fill(more, shown < list.length
        ? h('button.btn.btn--line.btn--sm', { type: 'button', onclick: () => addPage() }, `Show ${num(Math.min(PAGE, list.length - shown), 0)} more`, h('span.muted', `of ${num(list.length - shown, 0)}`))
        : null);
      return next;
    };
    const first = addPage();
    fill(body, grid, more);
    leaf(first.slice(0, 12));
  }

  bearNfts(wallet).subscribe((s) => {
    if (!s.value) {
      if (s.error && !sig) fill(body, h('div.prof-pad', errorLine("Couldn't read this wallet's NFTs from the ledger. Retrying.")));
      return;
    }
    const all = s.value.all || [];
    const next = all.map((n) => n.NFTokenID).join();
    if (next === sig && sig) return;
    sig = next || 'none';
    groups = { bear: all.filter((n) => kindOf(n) === 'bear'), pixel: all.filter((n) => kindOf(n) === 'pixel') };
    aside.textContent = all.length ? `${num(all.length, 0)} held` : '';
    if (!all.length) {
      fill(tabsSlot);
      fill(body, empty('No BEAR NFTs yet',
        h('span', isSelf ? 'BEAR and Pixel BEAR NFTs in your wallet show here. ' : 'This wallet holds no BEAR or Pixel BEAR NFTs. ',
          h('a.prof-link', { href: LINKS.xrpcafe, target: '_blank', rel: 'noopener' }, 'See them on xrp.cafe'))));
      return;
    }
    if (!tab || !groups[tab].length) tab = groups.bear.length ? 'bear' : 'pixel';
    fill(tabsSlot, pivot([
      { id: 'bear', label: `BEAR · ${num(groups.bear.length, 0)}` },
      { id: 'pixel', label: `Pixel BEARs · ${num(groups.pixel.length, 0)}` },
    ], { selected: tab, align: 'start', label: 'NFT collections', onChange: (id) => { tab = id; paintTab(); rise(body, { px: 8, duration: 320 }); } }));
    paintTab();
  }, signal);

  return el;
}

// ---------------------------------------------------------------------------
// One NFT, large

/** openNft(n, { origin, meta, onAvatar, signal }) — `signal` closes it when the page leaves. */
export function openNft(n, { origin, meta: known, onAvatar, signal } = {}) {
  const kind = kindOf(n);
  const guess = nameFromUri(n);
  const life = new AbortController();
  const art = h(`div.prof-nftd__art${kind === 'pixel' ? '.is-pixel' : ''}`, h('span.sk.sk--block'));
  const traits = h('div.prof-traits', Array.from({ length: 6 }, () => h('div.prof-trait', h('span.sk.sk--line', { style: { '--w': '50%' } }), h('span.sk.sk--line', { style: { '--w': '80%' } }))));
  const fee = Number(n.TransferFee);
  const facts = h('div.prof-nftd__facts',
    h('div.fact', h('span', 'Token'), h('b.prof-nftd__id', short(n.NFTokenID, 8, 6), copyButton(n.NFTokenID, 'Copy token ID'))),
    n.nft_serial != null ? h('div.fact', h('span', 'Serial'), h('b', num(n.nft_serial, 0))) : null,
    Number.isFinite(fee) ? h('div.fact', h('span', 'Creator royalty'), h('b', `${num(fee / 1000, 2)}%`)) : null,
    h('div.fact', h('span', 'Collection'), h('b', KIND_LABEL[kind])));
  const errSlot = h('div');
  let avatarBtn = null;
  const d = dialog({
    eyebrow: KIND_LABEL[kind].toUpperCase(),
    title: known?.name || guess || fallbackName(n),
    origin,
    size: 'wide',
    onClose: () => life.abort(),
    body: [h('div.prof-nftd', art, h('div.prof-nftd__side', h('div.caption', 'Traits'), traits, facts, errSlot))],
    foot: [
      external(`https://xrp.cafe/nft/${n.NFTokenID}`, 'View on xrp.cafe'),
      onAvatar ? (avatarBtn = h('button.btn.btn--gold', { type: 'button', disabled: true, onclick: () => setAvatar() }, 'Make it my avatar')) : null,
    ],
  });

  signal?.addEventListener('abort', () => d.close(), { once: true });
  let meta = known;
  async function setAvatar() {
    if (!meta) return;
    avatarBtn.disabled = true;
    avatarBtn.textContent = 'Saving';
    fill(errSlot);
    try {
      await onAvatar(n, meta);
      d.close();
      toast({ eyebrow: 'AVATAR', title: meta.name || 'New avatar set', body: 'It shows on the boards, the wall and in the games.' });
    } catch (e) {
      fill(errSlot, errorLine(e.message));
      avatarBtn.disabled = false;
      avatarBtn.textContent = 'Make it my avatar';
    }
  }

  function paint(m) {
    meta = m;
    if (m?.name) d.setTitle(m.name);
    const still = m?.image;
    const anim = m?.animation;
    const showStill = () => {
      if (!still) { fill(art, h('span.prof-nft__none', icon('image'))); return; }
      const img = h('img', { alt: m?.name || '', decoding: 'async', referrerPolicy: 'no-referrer' });
      ladderEl(img, still, () => fill(art, h('span.prof-nft__none', icon('image'))), { width: 480, animated: true, nftId: n.NFTokenID });
      fill(art, img);
    };
    if (anim && isVideo(anim)) {
      const v = h('video', { muted: true, playsInline: true, loop: true, autoplay: !matchMedia('(prefers-reduced-motion: reduce)').matches, controls: false, poster: still ? ladder(still, { width: 480 })[0] : null });
      v.muted = true;
      ladderEl(v, anim, showStill);
      fill(art, v);
    } else if (anim) {
      // The sized still shows at once; the full animation (MBs) swaps in when it lands.
      showStill();
      const img = h('img', { alt: m?.name || '', decoding: 'async', referrerPolicy: 'no-referrer' });
      img.addEventListener('load', () => { if (art.isConnected) fill(art, img); }, { once: true });
      ladderEl(img, anim, () => {});
    } else {
      showStill();
    }
    const attrs = (m?.attributes || []).filter((a) => a && (a.trait_type || a.trait || a.name) && a.value != null && a.value !== '');
    fill(traits, attrs.length
      ? attrs.map((a) => h('div.prof-trait', h('span.prof-trait__k', String(a.trait_type || a.trait || a.name)), h('span.prof-trait__v', String(a.value))))
      : h('div.prof-trait.prof-trait--none', 'No traits listed'));
    if (avatarBtn) avatarBtn.disabled = !(still || anim);
  }

  if (known) paint(known);
  else {
    const quick = quickImage(n);
    if (quick) paint({ image: quick, name: guess, attributes: [] });
    fetchMeta(n.URI || '').then((m) => {
      if (life.signal.aborted) return;
      if (m) paint(m);
      else if (!quick) {
        fill(art, h('span.prof-nft__none', icon('image')));
        fill(traits, h('div.prof-trait.prof-trait--none', 'This NFT’s details couldn’t be read from IPFS'));
      } else {
        fill(traits, h('div.prof-trait.prof-trait--none', 'Traits couldn’t be read from IPFS'));
      }
    }).catch(() => {});
  }
  return d;
}

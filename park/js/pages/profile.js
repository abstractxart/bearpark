// Profile: #/u/<wallet>. The person's banner and bear, their name in the park's
// cartoon type, honey and follows on the wall of tiles, then About, their BEAR
// NFTs and the wall of comments. Your own profile edits in place; anyone
// else's has one armed action: Follow.

import { h, icon, fill } from '../core/dom.js';
import { loadCss, copyButton, pane, statement, errorLine, skFigure, skLine, failedFigure } from '../core/ui.js';
import { roll, rise } from '../core/motion.js';
import { profile, equipped, points, followCounts, honeyBoard } from '../core/data.js';
import { holdings, bearNfts } from '../core/ledger.js';
import { bearFeed, LINKS } from '../core/market.js';
import { ART } from '../core/art.js';
import { num, compact, short } from '../core/format.js';
import { nftGallery, avatarJson } from './profile/nfts.js';
import { bearAvatar } from './profile/ipfs.js';
import { wall as wallPane } from './profile/wall.js';
import { followButton, openFollowList, xControl, openFinder, xHref } from './profile/social.js';
import { openEditProfile, saveProfile } from './profile/edit.js';

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const nameOf = (p) => p?.display_name?.trim() || '';

export const title = (params) => {
  const w = params?.[0] || '';
  return (w && nameOf(profile(w).get().value)) || short(w) || 'Profile';
};

export default function profilePage({ wallet: me, params, query, signal, scope, navigate }) {
  loadCss('profile');
  const target = params[0];
  const isSelf = same(target, me);
  const feed = profile(target);
  let prof; // undefined: not known yet · null: no profile · object: the row
  let eq = null;

  const openEdit = (origin) => openEditProfile({ wallet: me, current: profile(me).get().value || null, origin, signal });

  // ── hero: the banner band ──
  const avaBox = h(isSelf ? 'button.prof-ava.prof-ava--self' : 'div.prof-ava',
    isSelf ? { type: 'button', 'aria-label': 'Change your avatar', onclick: (e) => openEdit(e.currentTarget) } : {},
    h('span.sk.sk--circle.prof-ava__sk'));
  const eyebrow = h('div.eyebrow.prof-eyebrow', isSelf ? 'Your profile' : 'BEAR Park profile');
  const nameEl = h('h1.park-title.prof-name', h('span.sk.prof-name__sk'));
  const xTag = h('span.prof-xtag');
  const actErr = h('div.prof-actions__err');
  const editSlot = h('span.prof-edit-slot');
  const actions = h('div.prof-actions',
    isSelf ? [editSlot, xControl({ me, signal, errSlot: actErr })] : followButton({ me, target, signal, errSlot: actErr }));

  const band = h('section.park-band.prof-band', { 'data-e': '' },
    h('button.icon-btn.prof-find', { type: 'button', 'aria-label': 'Find a BEAR', title: 'Find a BEAR', onclick: (e) => openFinder({ origin: e.currentTarget, me, signal }) }, icon('search')),
    h('div.prof-hero',
      avaBox,
      h('div.prof-id', eyebrow, nameEl, h('span.tri'),
        h('div.prof-wallet',
          h('span.prof-wallet__addr.num', { title: target }, short(target, 6, 6)),
          copyButton(target, 'Copy wallet address'),
          h('a.icon-btn', { href: LINKS.bithomp(target), target: '_blank', rel: 'noopener', 'aria-label': 'View this wallet on Bithomp', title: 'Bithomp' }, icon('external')),
          xTag)),
      h('div.prof-actions-wrap', actions, actErr)));

  let bannerKey = null;
  function paintBanner(b) {
    const key = `${b?.id || ''}|${b?.image_url || ''}|${b?.css_gradient || ''}`;
    if (key === bannerKey) return;
    bannerKey = key;
    band.querySelector(':scope > img, :scope > .prof-band__grad')?.remove();
    const park = () => h('img', { src: ART.park, srcset: ART.parkSet, sizes: '(min-width: 1280px) 1240px, 100vw', alt: '', decoding: 'async' });
    let node;
    if (b?.image_url) {
      node = h('img', { src: b.image_url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      node.addEventListener('error', () => { band.classList.add('prof-band--park'); node.replaceWith(park()); }, { once: true });
    } else if (b?.css_gradient) {
      node = h('div.prof-band__grad', { style: { backgroundImage: b.css_gradient } });
    } else {
      node = park();
    }
    band.classList.toggle('prof-band--park', !b?.image_url && !b?.css_gradient);
    band.prepend(node);
  }

  let avatarKey = null;
  function paintAvatar() {
    if (prof === undefined) return;
    const ring = eq?.ring?.image_url ? eq.ring : null;
    const key = `${prof?.avatar_nft || ''}|${ring?.image_url || ''}|${ring?.is_animated || ''}`;
    if (key === avatarKey) return;
    avatarKey = key;
    const type = /^[a-z-]+$/.test(ring?.ring_type || '') ? ring.ring_type : '';
    fill(avaBox,
      bearAvatar(prof?.avatar_nft, { name: nameOf(prof), eager: true }),
      ring ? h(`span.prof-ring${type ? `.prof-ring--${type}` : ''}${ring.is_animated ? '.is-turning' : ''}`, { title: ring.name || null },
        h('img', { src: ring.image_url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' })) : null,
      isSelf ? h('span.prof-ava__edit', { 'aria-hidden': 'true' }, icon('edit')) : null);
  }

  // ── the wall of tiles ──
  const honeyLabel = h('div.tile__label', 'Honey');
  const honeyFig = h('div.tile__value.num.prof-honey__fig', skFigure('2.4em'));
  const honeySub = h('div.tile__sub', ' ');
  const honeyTile = h(`${isSelf ? 'a' : 'div'}.tile.tile--gold.prof-stat--honey`, { href: isSelf ? '#/earn' : null },
    h('img.tile__mascot', { src: ART.honey, alt: '', decoding: 'async' }),
    honeyLabel, h('div.stack', { style: { '--gap': '4px' } }, honeyFig, honeySub));

  const countTile = (cls, label, tab) => {
    const fig = h('div.tile__value.num', skFigure('1.4em'));
    const tile = h(`button.tile.${cls}`, { type: 'button', onclick: (e) => openFollowList({ wallet: target, name: displayFor(), tab, origin: e.currentTarget, signal }) },
      h('div.tile__label', label), h('div.stack', { style: { '--gap': '4px' } }, fig, h('div.tile__sub', 'See who')));
    tile.fig = fig;
    return tile;
  };
  const followersTile = countTile('tile--purple', 'Followers', 'followers');
  const followingTile = countTile('tile--green', 'Following', 'following');

  const bearFig = h('div.tile__value.tile__value--md.num', skFigure('2em'));
  const bearSub = h('div.tile__sub', ' ');
  const bearTile = h('div.tile.prof-stat--bear', h('div.tile__label', '$BEAR held'), h('div.stack', { style: { '--gap': '4px' } }, bearFig, bearSub));

  const nftFig = h('div.tile__value.tile__value--md.num', skFigure('1.4em'));
  const nftSub = h('div.tile__sub', ' ');
  const nftTile = h('button.tile.prof-stat--nfts', { type: 'button', onclick: () => gallery.scrollIntoView({ behavior: document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) },
    h('div.tile__label', 'BEAR NFTs'), h('div.stack', { style: { '--gap': '4px' } }, nftFig, nftSub));

  const stats = h('div.tile-wall.prof-stats', { 'data-e': '' }, honeyTile, followersTile, followingTile, bearTile, nftTile);

  // ── about ──
  const note = h('div.prof-note');
  const bioEl = h('div.prof-bio', skLine('86%'), skLine('62%'));
  const fact = (label) => {
    const value = h('b', skLine('4em'));
    return { el: h('div.fact', h('span', label), value), value };
  };
  const joined = fact('Joined');
  const xFact = fact('X');
  const xrpFact = fact('XRP balance');
  const lineFact = fact('$BEAR trust line');
  const about = pane({
    title: 'About',
    aside: isSelf ? h('button.btn.btn--text', { type: 'button', onclick: (e) => openEdit(e.currentTarget) }, 'Edit') : null,
    cls: 'prof-about',
    body: [h('div.pane-body', note, bioEl, h('div.prof-facts', joined.el, xFact.el, xrpFact.el, lineFact.el))],
  });

  // ── BEAR NFTs and the wall ──
  const gallery = nftGallery({ wallet: target, isSelf, signal, onAvatar: isSelf ? setAvatar : null });
  const wall = wallPane({ target, me, ownerName: () => displayFor(), signal, scope });

  async function setAvatar(n, meta) {
    const raw = avatarJson(n, meta);
    if (!raw) throw new Error('This NFT’s image couldn’t be found on IPFS.');
    const cur = profile(me).get().value;
    if (!nameOf(cur)) throw new Error('Set up your profile first: it needs a name.');
    await saveProfile(me, { name: nameOf(cur), avatarNft: raw }, cur);
  }

  function displayFor() { return nameOf(prof) || short(target); }

  // ── feeds ──
  let named = false;
  feed.subscribe((s) => {
    if (s.value === undefined) {
      if (s.error && prof === undefined) {
        fill(nameEl, h('span.prof-name--addr', short(target, 6, 6)));
        fill(bioEl, errorLine('This profile didn’t load. Retrying.', { small: true }));
        joined.value.replaceChildren(failedFigure(null));
      }
      return;
    }
    // A link with the address lowercased: move to the real one (follows, the
    // wall and everything else are keyed by it).
    const real = s.value?.wallet_address;
    if (real && real !== target && same(real, target)) { navigate(`/u/${real}`, { replace: true }); return; }
    prof = s.value;
    const name = nameOf(prof);
    nameEl.textContent = name || 'Anonymous BEAR';
    nameEl.classList.toggle('is-long', (name || 'Anonymous BEAR').length > 12);
    if (!named) { rise(nameEl, { px: 12, duration: 460 }); named = true; }
    eyebrow.textContent = isSelf ? 'Your profile' : prof ? 'BEAR Park profile' : 'No profile yet';
    if (!signal.aborted) document.title = `${name || short(target)} · BEAR Park`;
    wall.rename(displayFor());
    paintAvatar();

    if (isSelf) {
      const setup = !name;
      fill(editSlot, h(`button.btn${setup ? '.btn--gold' : ''}`, { type: 'button', onclick: (e) => openEdit(e.currentTarget) },
        icon(setup ? 'sparkle' : 'edit'), setup ? 'Set up your profile' : 'Edit profile'));
    }

    fill(note, !prof || !name ? statement({
      tone: 'info',
      title: prof ? 'No name yet' : 'No profile yet',
      body: isSelf
        ? 'Pick a name and an NFT bear. They show on the boards, the wall and in every game.'
        : 'This wallet hasn’t picked a name or a bear. Its ledger facts are still here.',
    }) : null);

    const bio = prof?.bio?.trim();
    if (bio) fill(bioEl, h('p.prof-bio__text', bio));
    else if (isSelf) fill(bioEl, h('p.prof-bio__empty', 'No bio yet. ', h('button.prof-link', { type: 'button', onclick: (e) => openEdit(e.currentTarget) }, 'Add a few words')));
    else fill(bioEl, h('p.prof-bio__empty', 'No bio yet.'));

    const at = prof?.created_at ? new Date(prof.created_at) : null;
    fill(joined.value, at && Number.isFinite(at.getTime()) ? at.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : h('span.muted', '—'));
  }, signal);

  equipped(target).subscribe((s) => {
    if (s.value) { eq = s.value; paintBanner(eq.banner); paintAvatar(); }
    else if (s.error && !band.querySelector(':scope > img, :scope > .prof-band__grad')) paintBanner(null);
  }, signal);

  points(target).subscribe((s) => {
    const v = s.value;
    if (v) {
      if (!honeyFig.dataset.rolled) honeyFig.replaceChildren();
      roll(honeyFig, num(v.total_points, 0));
      honeySub.textContent = `${num(v.raiding_points, 0)} from raids · ${num(v.games_points, 0)} from games`;
      const handle = v.twitter_connected && v.twitter_username;
      const href = handle && xHref(handle);
      fill(xTag, href ? h('a.prof-xh', { href, target: '_blank', rel: 'noopener', 'aria-label': `@${handle} on X` }, icon('x'), `@${handle}`) : null);
      fill(xFact.value, href ? h('a.prof-link', { href, target: '_blank', rel: 'noopener' }, `@${handle}`) : h('span.muted', 'Not linked'));
    } else if (s.error && !honeyFig.dataset.rolled) {
      fill(honeyFig, h('span.failed', '—'));
      honeySub.textContent = "couldn't load · retrying";
      fill(xFact.value, h('span.muted', '—'));
    }
  }, signal);

  honeyBoard(target).subscribe((s) => {
    const rank = s.value?.userRank;
    honeyLabel.textContent = rank ? `Honey · #${num(rank, 0)} on the board` : 'Honey';
  }, signal);

  followCounts(target).subscribe((s) => {
    for (const [tile, key] of [[followersTile, 'followers'], [followingTile, 'following']]) {
      const n = Number(s.value?.[key]);
      if (s.value && Number.isFinite(n)) {
        if (!tile.fig.dataset.rolled) tile.fig.replaceChildren();
        roll(tile.fig, num(n, 0));
      } else if (s.error && !tile.fig.dataset.rolled) {
        fill(tile.fig, h('span.failed', '—'));
      }
    }
  }, signal);

  const paintBag = () => {
    const v = holdings(target).get().value;
    if (!v) return;
    fill(bearFig, h('span', compact(v.bear)));
    const price = bearFeed.get().value?.price;
    bearSub.textContent = !v.hasTrustline ? 'No $BEAR trust line' : price ? `≈ ${num(v.bear * price, 0)} XRP` : `${num(v.bear, 0)} $BEAR`;
    fill(xrpFact.value, v.xrp == null ? h('span.muted', 'Not activated') : `${num(v.xrp, 2)} XRP`);
    fill(lineFact.value, v.hasTrustline ? 'Set' : h('span.muted', 'None'));
  };
  holdings(target).subscribe((s) => {
    if (s.value) paintBag();
    else if (s.error && !bearFig.textContent.trim()) {
      fill(bearFig, h('span.failed', '—'));
      bearSub.textContent = "couldn't load · retrying";
      fill(xrpFact.value, h('span.muted', '—'));
      fill(lineFact.value, h('span.muted', '—'));
    }
  }, signal);
  bearFeed.subscribe(() => paintBag(), signal);

  bearNfts(target).subscribe((s) => {
    if (s.value) {
      fill(nftFig, h('span', num(s.value.all.length, 0)));
      nftSub.textContent = s.value.all.length ? `${num(s.value.ultra, 0)} BEAR · ${num(s.value.pixel, 0)} Pixel` : 'None held';
    } else if (s.error && !nftFig.textContent.trim()) {
      fill(nftFig, h('span.failed', '—'));
      nftSub.textContent = "couldn't load · retrying";
    }
  }, signal);

  // A profile shows what changed since this tab last looked (a new name or
  // bear, a follow, an X link) on this visit, not when its 5-minute feed
  // next refreshes. One read each, and only for copies older than 30 s.
  for (const f of [feed, followCounts(target), points(target)]) {
    if (Date.now() - (f.get().at || 0) > 30_000) f.refresh();
  }

  // ── page ──
  const el = h('main.page.prof',
    band,
    stats,
    h('div.cols.cols--side.prof-cols',
      h('div.prof-side', { 'data-e': '' }, about),
      h('div.stack.prof-main', gallery, wall.el)));

  const c = query.get('c');
  if (c) wall.focus(c);
  el.onQuery = (q) => { const id = q.get('c'); if (id) wall.focus(id); };
  return el;
}

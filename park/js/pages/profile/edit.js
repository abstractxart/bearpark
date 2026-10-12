// Edit profile (and first-time setup): display name, NFT avatar, bio.
// Saves through POST /api/profile (name + avatar) and POST /api/profile/bio,
// then refreshes the shared profile feed and hands the name to the games.

import { h, icon, fill } from '../../core/dom.js';
import { dialog, words, errorLine, toast } from '../../core/ui.js';
import { bearAvatar as avatar } from './ipfs.js';
import { leaf } from '../../core/motion.js';
import { post } from '../../core/api.js';
import { profile } from '../../core/data.js';
import { accountNfts } from '../../core/ledger.js';
import { parseAvatar, warmAvatar } from '../../core/media.js';
import { session } from '../../core/session.js';
import { LINKS } from '../../core/market.js';
import { num } from '../../core/format.js';
import { kindOf, nftTile, lazyLoad, resolveMeta, avatarJson, quickImage, nameFromUri } from './nfts.js';

// The server takes up to 50; the boards and game HUDs were built for the old
// 20-character cap, so the form keeps it.
export const NAME_MAX = 20;
export const BIO_MAX = 500;

/**
 * Save name/avatar and bio for `wallet`. Only the parts that changed are sent;
 * a new profile always sends the name first (the bio route would otherwise
 * create a nameless row).
 */
export async function saveProfile(wallet, { name, avatarNft, bio }, current) {
  const exists = !!current;
  const nameChanged = !exists || (current.display_name || '') !== name || (current.avatar_nft || null) !== (avatarNft || null);
  const bioChanged = bio !== undefined && (current?.bio || '') !== bio;
  if (nameChanged) await post('/profile', { wallet_address: wallet, display_name: name, avatar_nft: avatarNft || null });
  if (avatarNft && avatarNft !== (current?.avatar_nft || null)) warmAvatar(avatarNft); // the image CDN resizes it before anyone's list asks
  if (bioChanged) await post('/profile/bio', { wallet_address: wallet, bio });
  const feed = profile(wallet);
  feed.set({ ...(current || { wallet_address: wallet, created_at: new Date().toISOString() }), display_name: name, avatar_nft: avatarNft || null, ...(bio !== undefined ? { bio } : {}) });
  session.setIdentity({ displayName: name });
  feed.refresh();
  return nameChanged || bioChanged;
}

// The wallet's NFTs, read once per visit (the picker can reopen instantly).
const nftCache = new Map();
function walletNfts(wallet) {
  if (!nftCache.has(wallet)) {
    const job = accountNfts(wallet);
    nftCache.set(wallet, job);
    job.catch(() => nftCache.delete(wallet));
  }
  return nftCache.get(wallet);
}

const PAGE = 30;
const GROUPS = [
  { id: 'bear', label: 'BEAR', none: 'No BEAR collection NFTs in this wallet.' },
  { id: 'pixel', label: 'Pixel BEARs', none: 'No Pixel BEARs in this wallet.' },
  { id: 'other', label: 'Other NFTs', none: 'No other NFTs in this wallet.' },
];

/** openEditProfile({ wallet, current, origin, signal }) — `current` is the profile row or null (setup). */
export function openEditProfile({ wallet, current, origin, signal }) {
  const setup = !current?.display_name;
  const life = new AbortController();
  const startAvatar = current?.avatar_nft || null;
  let chosen = { raw: startAvatar, id: parseAvatar(startAvatar)?.nftId || null };

  // ── name ──
  const nameInput = h('input', { type: 'text', maxLength: Math.max(NAME_MAX, (current?.display_name || '').length), value: current?.display_name || '', placeholder: 'Your BEAR name', autocomplete: 'nickname', 'aria-describedby': 'prof-name-hint', autofocus: true, enterKeyHint: 'done' });
  const nameCount = h('span.field__count');
  const nameSync = () => { nameCount.textContent = `${nameInput.value.length}/${NAME_MAX}`; nameCount.classList.toggle('is-full', nameInput.value.length >= NAME_MAX); };
  nameInput.addEventListener('input', nameSync);
  nameSync();

  // ── avatar preview ──
  const preview = h('span.prof-edit__preview');
  const previewName = h('span.prof-edit__preview-name');
  const paintPreview = () => {
    fill(preview, avatar(chosen.raw, { size: 72 }));
    previewName.textContent = parseAvatar(chosen.raw)?.bearName || 'The BEAR coin';
  };
  paintPreview();

  // ── picker ──
  const tabsSlot = h('div.prof-edit__tabs');
  const grid = h('div.prof-pick');
  const pickMore = h('div.prof-more');
  const pickErr = h('div');
  let groups = null;
  let tab = 'bear';
  let tiles = [];

  const coinTile = () => {
    const t = h('button.prof-nft.prof-nft--coin', { type: 'button', 'aria-pressed': String(!chosen.raw), 'aria-label': 'No NFT: use the BEAR coin', onclick: () => pick(null, t) },
      h('span.prof-nft__art.is-in', h('img', { src: '/BEAR_Coin.png', alt: '' })), h('span.prof-nft__name', 'BEAR coin'));
    return t;
  };

  async function pick(n, tile) {
    fill(pickErr);
    if (!n) {
      chosen = { raw: null, id: null };
    } else {
      const prev = { raw: chosen.raw, id: chosen.id };
      chosen = { raw: chosen.raw, id: n.NFTokenID, pending: true };
      markPressed();
      let meta = tile.meta !== undefined ? tile.meta : await resolveMeta(n, life.signal);
      if (life.signal.aborted || chosen.id !== n.NFTokenID) return;
      if (!meta && quickImage(n)) meta = { image: quickImage(n), name: nameFromUri(n) };
      const raw = avatarJson(n, meta);
      if (!raw) {
        chosen = prev;
        fill(pickErr, errorLine('This NFT’s image couldn’t be found on IPFS. Pick another one.', { small: true }));
      } else {
        chosen = { raw, id: n.NFTokenID };
      }
    }
    markPressed();
    paintPreview();
  }
  function markPressed() {
    for (const t of grid.querySelectorAll('.prof-nft')) {
      t.setAttribute('aria-pressed', String(t.dataset.id ? t.dataset.id === chosen.id : !chosen.id));
    }
  }

  function paintGrid() {
    const list = groups[tab];
    tiles = [];
    const items = [];
    if (tab === 'bear') items.push(coinTile());
    if (!list.length) {
      fill(grid, items);
      fill(pickMore, h('p.prof-edit__none', GROUPS.find((g) => g.id === tab).none, ' ',
        tab !== 'other' ? h('a.prof-link', { href: tab === 'pixel' ? LINKS.xrpcafePixel : LINKS.xrpcafe, target: '_blank', rel: 'noopener' }, 'Find one on xrp.cafe') : null));
      return;
    }
    fill(grid, items);
    let shown = 0;
    const addPage = () => {
      const next = list.slice(shown, shown + PAGE).map((n) => {
        const t = nftTile(n, { signal: life.signal, pressed: n.NFTokenID === chosen.id, onClick: (e, tile) => pick(n, tile) });
        t.dataset.id = n.NFTokenID;
        if (!n.URI) { t.disabled = true; t.title = 'This NFT has no metadata'; }
        return t;
      });
      grid.append(...next);
      tiles.push(...next);
      shown += next.length;
      lazyLoad(next, { root: d.body, signal: life.signal });
      fill(pickMore, shown < list.length
        ? h('button.btn.btn--line.btn--sm', { type: 'button', onclick: () => addPage() }, `Show ${num(Math.min(PAGE, list.length - shown), 0)} more`)
        : null);
      return next;
    };
    leaf(addPage().slice(0, 10), { stagger: 30 });
  }

  function paintTabs() {
    fill(tabsSlot, words(GROUPS.map((g) => ({ id: g.id, label: `${g.label} · ${num(groups[g.id].length, 0)}` })), {
      selected: tab, onChange: (id) => { tab = id; paintGrid(); },
    }));
  }

  function loadNfts() {
    fill(tabsSlot);
    fill(pickMore);
    fill(grid, Array.from({ length: 8 }, (_, i) => h('span.prof-nft.prof-nft--sk', h('span.prof-nft__art', h('span.sk.sk--block', { style: { '--d': `${i * 60}ms` } })))));
    walletNfts(wallet).then((all) => {
      if (life.signal.aborted) return;
      groups = { bear: [], pixel: [], other: [] };
      for (const n of all) groups[kindOf(n)].push(n);
      // The current avatar's group opens first, else the BEARs.
      const own = chosen.id && all.find((n) => n.NFTokenID === chosen.id);
      tab = own ? kindOf(own) : groups.bear.length ? 'bear' : groups.pixel.length ? 'pixel' : 'bear';
      paintTabs();
      paintGrid();
    }).catch((e) => {
      if (life.signal.aborted) return;
      fill(grid);
      fill(pickMore, h('div.stack', { style: { '--gap': '12px' } },
        errorLine(e.message || 'Your NFTs couldn’t be read from the ledger.'),
        h('button.btn.btn--line.btn--sm', { type: 'button', onclick: loadNfts }, icon('refresh'), 'Try again')));
    });
  }

  // ── bio ──
  const bioInput = h('textarea', { rows: 4, maxLength: BIO_MAX, placeholder: 'Tell the park who you are', 'aria-label': 'Bio' });
  bioInput.value = current?.bio || '';
  const bioCount = h('span.field__count');
  const bioSync = () => { bioCount.textContent = `${bioInput.value.length}/${BIO_MAX}`; };
  bioInput.addEventListener('input', bioSync);
  bioSync();

  const errSlot = h('div.prof-edit__err');
  const saveBtn = h('button.btn.btn--gold', { type: 'button', onclick: () => save() }, setup ? 'Save profile' : 'Save');

  const d = dialog({
    eyebrow: 'YOUR PROFILE',
    title: setup ? 'Set up your profile' : 'Edit profile',
    origin,
    size: 'wide',
    onClose: () => life.abort(),
    body: [
      h('div.prof-edit',
        h('div.prof-edit__who', preview,
          h('div.prof-edit__who-main',
            h('label.field-label', { for: 'prof-name' }, 'Display name'),
            h('div.field', Object.assign(nameInput, { id: 'prof-name' }), nameCount),
            h('div.prof-edit__hint', { id: 'prof-name-hint' }, 'Shown on the boards, the wall and in every game.'),
            h('div.prof-edit__hint', 'Avatar: ', previewName))),
        h('div.prof-edit__block',
          h('div.prof-edit__label', h('span.field-label', 'Avatar'), h('span.prof-edit__hint', 'Pick any NFT in your wallet')),
          tabsSlot, grid, pickMore, pickErr),
        h('div.prof-edit__block',
          h('label.field-label', { for: 'prof-bio' }, 'Bio'),
          h('div.field', Object.assign(bioInput, { id: 'prof-bio' }), bioCount)),
        errSlot),
    ],
    foot: [h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Cancel'), saveBtn],
  });
  signal?.addEventListener('abort', () => d.close(), { once: true });
  loadNfts();

  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

  async function save() {
    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    fill(errSlot);
    if (!name) {
      fill(errSlot, errorLine('Pick a display name first.'));
      errSlot.scrollIntoView({ block: 'nearest' });
      nameInput.focus();
      return;
    }
    if (name.length > 50) { fill(errSlot, errorLine('That name is too long.')); return; }
    if (chosen.pending) { fill(errSlot, errorLine('Your avatar is still loading. One moment.', { small: true })); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving';
    try {
      const changed = await saveProfile(wallet, { name, avatarNft: chosen.raw, bio: bioInput.value.trim() }, current);
      await d.close();
      if (changed) {
        toast(setup
          ? { eyebrow: 'WELCOME TO THE PARK', title: name, body: 'Your name and bear now show on the boards, the wall and in every game.' }
          : { eyebrow: 'PROFILE', title: 'Saved', body: 'Your changes are live.' });
      }
    } catch (e) {
      fill(errSlot, errorLine(e.message || 'Your profile didn’t save. Try again.'));
      errSlot.scrollIntoView({ block: 'nearest' });
      saveBtn.disabled = false;
      saveBtn.textContent = setup ? 'Save profile' : 'Save';
    }
  }
  return d;
}

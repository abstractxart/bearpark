// NFTs: the Pixel BEARs in the park's booth, 10,000 honey each. A request
// reserves the NFT for you and spends the honey; the team sends it by hand.
// "Your requests" follows each one from reserved to sent.

import { h, icon, fill } from '../../core/dom.js';
import { dialog, errorLine, statement, toast, pane, skRows, empty } from '../../core/ui.js';
import { leaf } from '../../core/motion.js';
import { post } from '../../core/api.js';
import { points } from '../../core/data.js';
import { nftMeta, ipfsLadder, ladderImg } from '../../core/media.js';
import { num, ago, short, plural, hexToUtf8 } from '../../core/format.js';
import { storeNfts, nftRequests, honeyOf, spent } from './feeds.js';
import { cost, facts, skTiles } from './looks.js';
import { celebrate } from '../../core/fun.js';

const nameOf = (nft) => {
  let file = (nft.uri || '').split('/').pop() || '';
  try { file = decodeURIComponent(file); } catch { /* already plain */ }
  file = file.replace(/\.json$/i, '').trim();
  return /#\d+/.test(file) ? file : nft.name || 'Pixel BEAR';
};

// Core's ladder: a sized copy from the image CDN, then Filebase and the rest.
const ladder = (url) => ipfsLadder(url);
const walk = (img, url, onFail, nftId) => ladderImg(img, url, onFail, { width: 240, nftId });

const META_KEY = 'bp:shopmeta:';
const metas = new Map();
/** { name, image, attributes } from the NFT's own metadata, cached for good (IPFS never changes). */
function metaOf(nft) {
  const hex = nft.rawUri;
  if (!hex) return Promise.resolve(null);
  const tail = hex.slice(-48);
  for (const key of [META_KEY + tail, `bp:nftmeta:${tail}`]) {
    try { const hit = JSON.parse(localStorage.getItem(key) || 'null'); if (hit?.image) return Promise.resolve(hit); } catch { /* fall through */ }
  }
  if (metas.has(hex)) return metas.get(hex);
  const job = (async () => {
    const uri = nft.uri || hexToUtf8(hex);
    for (const url of ladder(uri).slice(0, 3)) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
        if (!r.ok) continue;
        const json = await r.json();
        const meta = { name: json.name || '', image: json.image || json.image_url || '', attributes: Array.isArray(json.attributes) ? json.attributes : [] };
        try { localStorage.setItem(META_KEY + tail, JSON.stringify(meta)); } catch { /* quota */ }
        return meta;
      } catch { /* next gateway */ }
    }
    return nftMeta(hex).catch(() => null);
  })();
  metas.set(hex, job);
  return job;
}

/** The NFT's art from its own metadata; the server's stand-in only if that fails. */
function nftImg(nft, { eager = false } = {}) {
  const img = h('img', { alt: '', loading: eager ? 'eager' : 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
  const fallback = () => { if (nft.imageUrl && img.src !== nft.imageUrl) img.src = nft.imageUrl; };
  metaOf(nft).then((m) => (m?.image ? walk(img, m.image, fallback, nft.nftTokenId) : fallback())).catch(fallback);
  return img;
}

const REQUEST_STATUS = {
  pending: { label: 'Reserved', chip: 'gold' },
  fulfilled: { label: 'Sent', chip: 'green' },
  completed: { label: 'Sent', chip: 'green' },
  rejected: { label: 'Declined', chip: 'red' },
  cancelled: { label: 'Cancelled', chip: 'red' },
  refunded: { label: 'Refunded', chip: 'red' },
};

export function nftsPanel({ wallet, signal }) {
  const grid = h('div.shop-grid.shop-grid--nft', skTiles(4, 'nft'));
  const count = h('span.section__aside', ' ');
  const tiles = new Map();
  let list = null;

  let sig = '';
  storeNfts.subscribe((s) => {
    if (s.value) {
      const next = s.value.nfts.map((n) => n.nftTokenId).join();
      if (list && next === sig) return;
      sig = next; list = s.value.nfts; paint();
    }
    else if (s.error && !list) fill(grid, h('div.shop-span', errorLine(s.error.message || 'The booth could not load. It retries on its own.')));
  }, signal);
  points(wallet).subscribe(() => { for (const t of tiles.values()) t.update(); }, signal);

  function paint() {
    const fresh = !tiles.size;
    count.textContent = list.length ? `${plural(list.length, 'Pixel BEAR')} left` : '';
    tiles.clear();
    if (!list.length) {
      fill(grid, h('div.shop-span', h('div.frost.shop-empty', empty('The booth is empty', 'Every Pixel BEAR has been claimed. New ones land here first.'))));
      return;
    }
    fill(grid, list.map((nft) => { const t = tile(nft); tiles.set(nft.nftTokenId, t); return t.el; }));
    if (fresh) leaf(grid.children, { stagger: 40 });
  }

  function tile(nft) {
    const note = h('span.shop-item__note');
    const btn = h('button.shop-item.shop-item--nft', { type: 'button', onclick: (e) => requestSheet(nft, e.currentTarget) },
      h('span.shop-item__art', nftImg(nft)),
      h('span.shop-item__body', h('span.shop-item__name', nameOf(nft)), h('span.shop-item__meta', h('span.chip.chip--purple', 'Pixel BEAR'), cost(nft.honeyCost)), note));
    function update() {
      const honey = honeyOf(wallet);
      const gap = honey != null ? nft.honeyCost - honey : 0;
      btn.disabled = gap > 0;
      note.textContent = gap > 0 ? `${num(Math.ceil(gap), 0)} honey short` : '';
      btn.setAttribute('aria-label', `${nameOf(nft)}, ${num(nft.honeyCost, 0)} honey${gap > 0 ? `, ${num(Math.ceil(gap), 0)} short` : ''}`);
    }
    update();
    return { el: btn, update };
  }

  function requestSheet(nft, origin) {
    const name = nameOf(nft);
    const balance = honeyOf(wallet);
    const err = h('div.shop-dlg__err');
    const traits = h('div.shop-traits', { 'aria-label': 'Traits' });
    metaOf(nft).then((m) => {
      const list = (m?.attributes || []).filter((t) => t && t.trait_type && t.value != null);
      if (list.length) fill(traits, list.map((t) => h('span.shop-trait', h('small', String(t.trait_type)), String(t.value))));
    }).catch(() => {});
    const label = `Claim · ${num(nft.honeyCost, 0)} HNY`;
    const cancel = h('button.btn.btn--line', { type: 'button', onclick: () => d.close() }, 'Cancel');
    const claim = h('button.btn.btn--gold', { type: 'button', autofocus: true, onclick: () => send() }, label);
    const d = dialog({
      eyebrow: 'THE BOOTH', title: name, origin,
      body: [
        h('div.shop-preview.shop-preview--nft', nftImg(nft, { eager: true })),
        traits,
        facts([
          ['Price', cost(nft.honeyCost, { unit: true })],
          ['Your honey', balance != null ? `${num(balance, 0)} HNY` : '—'],
          balance != null ? ['After', `${num(balance - nft.honeyCost, 0)} HNY`] : null,
          ['NFT', short(nft.nftTokenId, 8, 6)],
        ]),
        statement({ tone: 'info', title: 'Sent by hand', body: 'Claiming reserves this BEAR for you. The team sends it to your wallet, usually within a day — watch it under Your requests.' }),
        err],
      foot: [cancel, claim],
    });
    d.el.classList.add('shop-dlg');

    async function send() {
      claim.disabled = true; cancel.disabled = true; claim.textContent = 'Claiming';
      fill(err);
      try {
        const res = await post('/store/request-nft', { wallet_address: wallet, nft_token_id: nft.nftTokenId }, { timeout: 45_000 });
        const cur = storeNfts.get().value;
        if (cur) storeNfts.set({ ...cur, nfts: cur.nfts.filter((n) => n.nftTokenId !== nft.nftTokenId) });
        storeNfts.refresh();
        nftRequests(wallet).refresh();
        spent(wallet, res.new_balance);
        toast({ eyebrow: 'CLAIMED', title: name, body: 'It’s reserved for you. The team sends it to your wallet.' });
        celebrate({ kind: 'purchase', origin: claim });
        d.close();
      } catch (e) {
        claim.disabled = false; cancel.disabled = false; claim.textContent = label;
        if (e.body?.alreadyPurchased) {
          claim.disabled = true;
          storeNfts.refresh();
          fill(err, errorLine('Someone claimed this one first. Pick another BEAR.'));
        } else {
          fill(err, errorLine(e.message || 'The claim didn’t go through.'));
        }
      }
    }
  }

  // ── your requests ──
  const reqRows = h('div.rows', skRows(2));
  const reqCount = h('span', ' ');
  nftRequests(wallet).subscribe((s) => {
    if (s.value) {
      reqCount.textContent = s.value.length ? plural(s.value.length, 'request') : '';
      fill(reqRows, s.value.length ? s.value.map((r) => {
        const st = REQUEST_STATUS[r.status] || { label: r.status || 'Pending', chip: '' };
        return h('div.row',
          h('span.shop-row__glyph', icon('image')),
          h('div.row__main',
            h('div.row__title', r.nft_name || 'Pixel BEAR NFT'),
            h('div.row__sub', `${r.requested_at ? ago(r.requested_at) : ''}${r.honey_spent ? ` · ${num(r.honey_spent, 0)} HNY` : ''}${r.nft_token_id ? ` · ${short(r.nft_token_id, 6, 4)}` : ''}`)),
          h(`span.chip${st.chip ? `.chip--${st.chip}` : ''}`, st.label),
          r.nft_token_id ? h('a.icon-btn', { href: `https://bithomp.com/en/nft/${r.nft_token_id}`, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'View the NFT on Bithomp' }, icon('external')) : null);
      }) : empty('No requests yet', 'BEARs you claim show up here until they reach your wallet.'));
    } else if (s.error && !reqRows.querySelector('.row')) {
      fill(reqRows, h('div.pane-body', { style: { padding: '14px var(--pane-pad)' } }, errorLine(s.error.message || 'Your requests could not load.')));
    }
  }, signal);

  return h('div.shop-panel',
    h('div.shop-bar', h('div.shop-bar__note', icon('info'), 'Claimed BEARs are sent to your wallet by hand.'), count),
    grid,
    h('div.section', pane({ title: 'Your requests', aside: reqCount, body: [reqRows] })));
}

# BEAR Park — design system and page contract

BEAR Park is BEAR Swap's and BEAR Wallet's sibling. It uses the same Metro +
Material 3 system, ported to plain ES modules and CSS with no build step.
The source of truth for the look is BEAR Swap (`C:\Users\Oz\Desktop\BEAR-SWAP-V2`).
Read this file before you add a page or a component.

## Layout of `park/`

```
css/core.css        tokens, type, surfaces, controls, rows, header, dialogs, motion plumbing
css/signin.css      sign-in sheet + landing
css/pages/*.css     one stylesheet per page (load it from the page module, see below)
js/app.js           boot: decides landing vs park, mounts header/footer, starts the router
js/shell.js         header, phone menu, account + notification sheets, footer
js/core/dom.js      h() element builder, icon(), fill(), scope()
js/core/ui.js       components (see below)
js/core/motion.js   entrances, morphs, reels, error motion, gold flood
js/core/api.js      api()/post()/del()/market() + live() feeds
js/core/data.js     shared BEAR Park feeds (points, profile, raids, boards…)
js/core/market.js   $BEAR market (BEAR Swap feed + inftf candles) and LINKS
js/core/ledger.js   wallet facts via BEAR Swap's XRPL proxy
js/core/chart.js    sparkline() and areaChart()
js/core/media.js    IPFS gateway ladder, avatar parsing, NFT metadata
js/core/format.js   num, compact, usd, price, pct, tone, short, ago, duration, clock
js/core/art.js      ART (brand images) and GAMES
js/core/router.js   hash routes; ROUTES/NAV
js/signin/*         sign-in sheet (BEAR Wallet, BEAR Swap, Xaman)
js/pages/*.js       one module per page
```

## A page module

```js
import { h } from '../core/dom.js';
export const title = 'Play';                       // document title
export default function page({ wallet, params, query, signal, scope, navigate }) {
  loadCss('play');                                 // optional: /park/css/pages/play.css
  return h('main.page', pageHead({ eyebrow: 'BEARCADE', title: 'Play' }), /* … */);
}
```

- Return the page's root synchronously (or a promise). Paint skeletons at once and fill as data
  arrives. **Never block the first paint on the network.**
- `signal` aborts when the page leaves. Pass it to every `feed.subscribe(fn, signal)`, every
  `api(path, { signal })` and every listener (`scope.on(target, type, fn)`), and use
  `scope.add(fn)` for timers.
- Mark the blocks the page arrives and leaves in with `data-e` (the header, then each big block,
  9 at most). Mark lists below the fold with `data-reveal="rows"` (they leaf-turn in as they
  scroll in) or `data-reveal` (they rise in).
- A page that reacts to `?tab=` changes without re-rendering sets `el.onQuery = (query) => …`.
- Page CSS: `loadCss(name)` from `core/ui.js` adds `/park/css/pages/<name>.css` once.

## Rules (the owner's, from BEAR Swap — do not break them)

1. **Metro is the type, not flatness.** Tiny tracked uppercase labels (11–12px, +1–2px tracking),
   huge light titles and figures (weight 200–300, negative tracking), little in between. Every
   page opens with the Zune split (`pageHead`): eyebrow over a 40–52px weight-800 title.
2. **Radius 16 is the house shape.** Never square, never a pill for buttons. Use `--r` and its
   neighbours (12, 20, 24).
3. **Anything over the wallpaper sits on frosted glass** (`.frost`, `.frost--section`, `.tile`).
   Small text over the orbs wears `--halo`. Glass on glass is a slab, not a second blur.
4. **Gold is the one armed action** (`.btn--gold`). Everything else is quiet glass (`.btn`), a line
   (`.btn--line`), or text (`.btn--text`). Destructive actions are quiet (`.btn--danger`), never
   gold or red-filled. Wallet entry is quiet glass with only a gold glyph.
5. **No spinners and no "Loading…", ever.** Use a skeleton in the shape of what's coming
   (`skRows`, `skFigure`, `skLine`, `.sk--block`) or nothing. For a wait on a person (a phone to
   approve), the Metro flying dots (`.dots`) are the only allowed motion.
6. **Never show 0 for data that failed to load.** `bind()` shows `failedFigure()` (a dash +
   "couldn't load · retrying") and keeps the last good value through a later failure. A real
   zero from real data is fine.
7. **One error language:** `errorLine(message)` — a 2px red rule, the ⚠, the words hinging in,
   one shake. Never a tinted box, never an alert(), never a toast for an error you can show in
   place. Titled cases use `statement({ tone, title, body })`. Confirmations use
   `confirmDialog()`, never `confirm()`.
8. **Motion: transform and opacity only.** WAAPI with `fill: 'backwards'` (nothing stays
   transformed). Placement decelerates and lands — no overshoot, no jiggle, no bounce, no glints
   or sheens, no idle looping layers. Use the helpers in `motion.js`; they skip themselves under
   reduced motion and in hidden tabs.
9. **Tabs are labels and one small gold mark** (`pivot()`), never pills or segmented controls.
   Rules under a tab bar run edge to edge of their surface (`.rule`).
10. **Never reveal tappable controls on `:hover` without `@media (hover: hover)`** — on iOS a tap
    that makes clickable content appear is eaten (ContentChangeObserver).
11. **Never build markup from strings.** Everything goes through `h()`; user text is text.
12. Inputs are 16px (iOS doesn't zoom), and every icon-only button has an `aria-label`.

## Components (`core/ui.js`)

| Call | What it is |
|---|---|
| `pageHead({ eyebrow, title, aside, lede })` | The Zune split page header |
| `sectionHead(title, aside)` | A 30–36px light section title row |
| `pane({ title, aside, body })` | A frosted section with an eyebrow title and an edge-to-edge rule; put `.rows` inside |
| `pivot(tabs, { selected, onChange })` | Tabs with the sliding gold mark; `el.select(id)` |
| `words(tabs, { selected, onChange })` | Small word tabs inside a pane or dialog |
| `dialog({ title, eyebrow, body, foot, origin, size, sheet, onClose })` | Morphs out of `origin` (the clicked element); returns `{ el, body, close, setFoot, setTitle }` |
| `confirmDialog({ title, body, confirm, danger, origin })` | Promise<boolean> |
| `toast({ eyebrow, title, body, tone })` | Bottom toast with a gold countdown rule (success/info only) |
| `bind(slot, feed, render, { signal })` | Paint a live feed: skeleton → value → failed state |
| `errorLine(msg)`, `statement({tone,title,body})`, `empty(title, body)` | Failure / notes / empty states |
| `skRows(n)`, `skFigure(w)`, `skLine(w)` | Skeletons |
| `avatar(rawAvatarNft, { size, ring })` | A profile's NFT bear (IPFS ladder; BEAR coin fallback), with its cosmetic ring |
| `displayName(person)`, `profileHref(wallet)` | Name or short address; `#/u/<wallet>` |
| `copyButton(text)`, `external(href, text)` | |
| `rollingFigure(text)` / `motion.roll(el, text)` | Digits reel into place |

CSS building blocks (core.css): `.page`, `.page-head`, `.section`, `.section__head`, `.cols--2`,
`.cols--main`, `.grid` (`--min`), `.tile-wall`, `.tile` (+ `__label __value __sub __art __scrim`),
`.frost`, `.frost--section`, `.frost--pad`, `.stat` (`__label __value __unit __sub`), `.rows`,
`.row` (`__rank __main __title __sub __value`, `.row--you`), `.fact`, `.chip` (`--gold --green
--purple --red`), `.meter > i` (`--v` 0–1), `.btn` (`--gold --line --danger --text --sm --block`),
`.icon-btn`, `.field` (+ `.field-label`), `.choices/.choice`, `.eyebrow`, `.caption`, `.lede`,
`.body`, `.muted`, `.figure`, `.display`, `.headline`, `.section-title`, `.wordmark` (`.bear`
`.park`), `.up/.down/.gold`, `.num`.

## Data

- **BEAR Park API** (`api('/…')`, `post`, `del`): relative `/api/*` → Railway. The session token is
  attached automatically. Every write must name the signed-in wallet (`wallet` from the page
  context) — the server rejects any other with 403. A 401 on a write re-opens sign-in by itself.
- **Shared feeds** (`core/data.js`): `points(w)`, `profile(w)`, `equipped(w)`, `dailyGames(w)`,
  `honey24h(w)`, `followCounts(w)`, `notifications(w)`, `honeyBoard(w)`, `raids`, `role(w)`,
  `equippedFor(wallets)`, `honeyChanged(w)`. Use these instead of fetching the same thing again.
- **$BEAR market** (`core/market.js`): `bearFeed` (price in XRP, priceUsd, change1h/24h/7d,
  marketCap USD, holders, trustlines, tvl XRP, xrpUsd), `bearCandles(range)` ('1D','7D','1M','1Y'),
  `bearHolders`, `BEAR` constants, `LINKS`. These are the numbers BEAR Swap shows.
- **Ledger** (`core/ledger.js`): `holdings(w)` ({bear, xrp}), `bearNfts(w)` ({all, pixel, ultra}),
  `lpPosition(w)`, `accountNfts(w)`.
- Never call DexScreener, CoinGecko, xrpl.to or public XRPL nodes from the browser: everything
  has a source above.

## The games' contract (do not change)

The games read `localStorage.xaman_wallet_address`, `display_name`, `twitter_username`,
`bearpark_wallet`, `bearpark_auth_token` (+ `bearpark_auth_token_wallet`) — `core/session.js`
writes them all. They live at `/flappybear`, `/bear-ninja`, `/bear-jumpventure`, `/bearpong`
(see `GAMES` in `core/art.js`) and dispatch `honeyPointsUpdated` on the parent window.

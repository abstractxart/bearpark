# BEAR Park

The home of $BEAR on the XRP Ledger — games that pay honey, X raids, daily BEARdrops, a shop,
and the community. Live at **www.bearpark.xyz**.

BEAR Park is BEAR Swap's and BEAR Wallet's sibling: the same Metro + Material 3 system (glass,
light display type, decelerating motion, the orbs), carrying BEAR Park's own identity — the
Luckiest Guy titles, the purple / yellow / green tri-stripe, the illustrated park.

## How it's built

```
index.html          the front door (signed out): what BEAR Park is, $BEAR live, sign-in
main.html           the park (signed in): a hash-routed app — #/ #/play #/raids #/earn
                    #/community #/shop #/bear #/u/<wallet>
park/               the site: plain ES modules + CSS, no build step — see park/DESIGN.md
backend/server.js   the API (Express on Railway; /api/* is proxied there by vercel.json)
backend/wallet-sign-in.js   BEAR Wallet / WalletConnect / BEAR Swap / Xaman sign-in
frontend/*, public/pong     the games (built bundles; sources live outside this repo)
flappybear.html, bearpong.html   game launch screens that hand the wallet to the game
privacy / terms / support / data-deletion .html   legal pages (also used by BEAR Wallet)
admin*.html, merch-admin.html   staff tools
```

## Where the data comes from

| Data | Source |
|---|---|
| Honey, raids, games, profiles, board, shop, BEARdrops | BEAR Park API (`/api/*` → Railway) |
| $BEAR price, change, market cap, holders, TVL | BEAR Swap's prewarmed token feed (`/market/leaderboard`) — the numbers BEAR Swap and BEAR Wallet show |
| $BEAR chart | inftf market_data, browser-direct (where BEAR Swap's and xMagnetic's charts read) |
| Top holders | BEAR Swap's holder scanner (`/market/holders/…`) |
| A wallet's $BEAR, XRP, NFTs, LP | BEAR Swap's XRPL proxy with node failover (`/market/xrpl/…`) |

`/market/*` is a GET-only, path-allowlisted rewrite to BEAR Swap's API in `vercel.json` (that API
admits the apex, not `www.`, as a browser origin).

## Sign-in

One server-issued session (`wallet_auth`, 7 days, Bearer or cookie), four ways to prove a wallet:

- **BEAR Wallet** — the phone app signs a `bearwallet://sign/<uuid>` request (QR or deep link).
- **WalletConnect** — any XRPL WalletConnect wallet (BEAR Wallet, Joey…) signs the challenge with
  `xrpl_signMessage`, or signs (never submits) a no-op AccountSet carrying it in a memo.
- **BEAR Swap** — a popup on swap.bearpark.xyz signs BEAR Park's challenge with a vault wallet;
  the server verifies the signature (`/api/auth/challenge` → `/api/auth/verify`).
- **Xaman** — a SignIn payload.

BEAR Swap's popup (`/connect`) ships from BEAR Swap's own repo (branch `feat/bearpark-connect`);
until it is live there, the BEAR Swap option tells people after 15 s to use another way.

Every pending request is bound to the tab that created it and mints one session. Entry needs
10,000 $BEAR or one BEAR NFT: the server reads the ledger at sign-in and on each visit
(`/api/auth/access/:wallet`) and the site holds the door. Every write that names a wallet must be
made by that wallet's session.

## Run it locally

The site is static: serve the repo with vercel.json's routes applied (`/flappybear`,
`/bear-ninja`, …) and forward `/api/*` and `/market/*` the way vercel.json does. On the main dev
machine, `.claude/dev-server.js <port> --proxy` (not in git) does exactly that, forwarding only
read-only requests to production so pages show live data while writes are refused locally.

Backend tests: `node --test backend/*.test.js` (from the repo root).

## Deploy

Pushing `main` deploys the site (Vercel) and the API (Railway). Deploy the API first when a
change needs both: the site calls the new sign-in routes.

### Honey lockdown: the order matters

1. On Railway, make sure `SUPABASE_SERVICE_ROLE_KEY` and a strong `WALLET_AUTH_SECRET` are set.
   (A new `WALLET_AUTH_SECRET` signs everyone out once; they sign back in.)
2. Run `backend/migrations/004-honey-ledger.sql` in the Supabase SQL editor (safe any time).
3. Deploy the API and check its boot log has no "SERVICE_ROLE_KEY is not set" error.
4. Only then run `backend/migrations/005-lock-down-anon-writes.sql`. It removes the public
   (anon) key's ability to write honey, raids, roles and the rest straight to the database.
   Run before step 3 and every write breaks; skip it and that door stays open.

Also run, any time (each is safe to repeat):

- `backend/migrations/006-social-notifications.sql`: lets wall comments and replies notify
  the profile owner (the database refused those notification types until now).
- `backend/migrations/007-honey-activity-numeric.sql`: logs game honey to the cent instead of
  rounding 2.5 up to 3 in the activity log BEARdrops reads.

## Testing

`backend/sandbox/` runs the real API against a real Postgres (PGlite) with seeded people and
the site in front of it, sealed off from production. `node run.js` there, then
`node e2e-social.js` and `node e2e-honey.js`. See `backend/sandbox/README.md`.

Every honey movement is recorded in `honey_ledger` (wallet, delta, balance after, source,
reference, idempotency key); staff can read it at `GET /api/admin/honey-ledger`.

## Speed

- `backend/read-cache.js` answers public reads from memory for a few seconds, folds identical
  requests into one database trip, and drops whatever a successful write changed (a finished
  game clears that wallet's honey and the boards at once).
- Reactions arrive inside the feed, comment and wall responses (one query, not one per item).
- Art and video are right-sized WebP / H.264 in `park/media`, content-hashed and cached for a
  year (the park panorama went from 6.8 MB to 26–90 KB, the NFT videos from 144 MB / 58 MB to
  under 1 MB each).

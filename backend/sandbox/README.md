# BEAR Park backend sandbox

The **real** `backend/server.js` running against a **real Postgres** (PGlite — Postgres
compiled to WebAssembly, in-process), with the real site in front of it. Every write works,
end to end, and none of it can reach production.

```
browser ──► front server :8810 ──► /api/*   ──► sandbox backend :8811 (server.js) ──► PGlite (.data/pgdata)
            (vercel.json routes)    /market/* ──► BEAR Swap API (GET only, vercel.json allowlist)
```

## Start, stop, reset

```bash
cd backend/sandbox
npm install            # once: installs @electric-sql/pglite here only
node run.js            # site on http://localhost:8810, API on 127.0.0.1:8811
node run.js --reset    # throw the database away and rebuild it from the repo's SQL + fixtures
```

Or start **bearpark-sandbox** from `.claude/launch.json`. `--port` / `--api-port` change the ports.
The database lives in `backend/sandbox/.data/pgdata` (git-ignored) and survives restarts.

## Signing in as someone

Open `http://localhost:8810/__sandbox` and pick a persona, or go straight to
`/__sandbox/as/<persona>?to=%23/community`. Use **two origins** for two people at once —
`http://localhost:8810` and `http://127.0.0.1:8810` (and `http://[::1]:8810` for a third) keep
separate localStorage.

| Persona | Address | Notes |
|---|---|---|
| alice | `rszi51CrPCVRutFTbier3MCU1bWpFaWYtk` | real $BEAR holder (public address), 4,809 honey, ring + banner |
| bob | `r91Ziofbsy99ounY15qTarKtXrjizyZh8b` | real holder, X linked (@bob_bears), green ring |
| dana | `rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn` | real NFT holder, **admin** (moderates board and walls) |
| carol | `rEfJKEPgmA4mRCoJuMzuaUJcZdabGgeeoX` | generated, empty: fails the entry rule (the site sends her back to the door; the API still answers her) |
| eve, pete, gwen, kai, paula, sam | generated | fixture people with bears, rings, posts, follows |
| pat | generated | honey but no profile ("anonymous" paths) |

The real holders pass the server's ledger entry check (read-only XRPL queries), so honey-earning
routes behave as in production. Nothing here can sign for those wallets.

`node mint.js <persona|rADDRESS>` prints a session token and a console snippet that installs it
(the keys `park/js/core/session.js` reads). Tokens are signed with the sandbox's own secret
(`sandbox-secret`); production rejects them.

## Tests

```bash
node e2e-social.js              # every social flow, through the front server (needs run.js running)
node e2e-honey.js               # honey: games, raids, spending, exploits, ledger (resets alice/bob/dana/sam/carol's honey)
node e2e-social.js board wall   # some groups: board, profile, wall, follows, notes, misc
node db.js --report             # what the repo's SQL could not do (builds a throwaway copy in memory)
node --test ../*.test.js        # the backend's unit tests (from backend/sandbox)
```

## What is real and what is stubbed

**Real:** `backend/server.js` unchanged (routes, middleware, read cache, honey ledger, locks),
Postgres 18 (PGlite) with the repo's own schema, triggers, views and functions, the site
(`park/`) with vercel.json's routes, XRPL reads (entry rule, NFTs, balances), BEAR Swap's market
API (GET), link previews (YouTube oEmbed / microlink, GET).

**Stubbed / adapted:**
- `@supabase/supabase-js` → `supabase-adapter.js`: the query builder compiled to SQL the way
  PostgREST does it (rows shaped by `json_agg`, bodies through `json_populate_recordset`, so
  types, timestamps and errors match Supabase: `PGRST116`, `PGRST204`, SQLSTATEs). Embedded
  resources resolve through the real foreign keys. RLS is **not** applied (every client acts as
  the table owner); `migrations/005` still runs, so the policies exist.
- `pg` → `pg-adapter.js`: `Pool` / `Client` on the same PGlite connection; a lock keeps a
  `BEGIN … COMMIT` together. Values come back as node-postgres returns them (int8/numeric as
  strings, timestamps as Date).
- Storage (meme uploads) is in memory, served at `/api/__sandbox/storage/…`.
- No Xaman, Twitter, VAPID or wallet secrets: sign-in is minted, X linking/raid verification,
  push, payouts (store tokens, BEARdrops claims, merch conversion) fail closed as they would
  with those keys missing.

**Isolation:** `run.js` starts the backend with an environment built from scratch:
`NODE_ENV=production` (so server.js never loads the repo's `.env`), dummy `SUPABASE_*` /
`DATABASE_URL` (`*.invalid` hosts only the adapters see), `WALLET_AUTH_SECRET=sandbox-secret`,
nothing else (on Windows libuv also copies its required OS variables — PATH, SystemRoot,
USERPROFILE …, no secrets). `boot.js` refuses to start with any other variable, and blocks
`fetch` to Supabase and any non-GET to bearpark.xyz / the production API.

## Schema

Built on first start from, in order: `bootstrap.sql` (roles, `auth.*`, `storage.*`), the repo's
setup SQL and `migrations/002–006` (see `SCHEMA_FILES` in `db.js`; one-off data scripts such as
DELETE-USERS or restore-admin-access are not loaded), `schema-patches.sql` (tables and columns
the code uses that no SQL file creates: `raid_completions`, `merch_orders`,
`nft_purchase_requests`, `store_token_transactions`, `wallet_blacklist`, `game_points`,
`profile_comments.parent_id`, `raids.verification_type`), then `seed.js`. The cosmetics catalog
is production's (`fixtures/cosmetics-catalog.json`, from the public catalog endpoint).

## Known gaps

- RLS and the anon/service-role split are not enforced (see above).
- PostgREST features server.js does not use (`or` on embedded tables, aggregates, CSV, views
  as embed targets) are not implemented.
- Supabase's API timestamps carry microseconds; PGlite's `now()` gives milliseconds.
- In a hidden browser pane animations never finish; tests there override `matchMedia` to
  reduced motion (the site then skips them, as it does for real users who ask).

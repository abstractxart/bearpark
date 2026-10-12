-- =====================================================================
-- 004: honey ledger + case-insensitive "one claim" guards
-- =====================================================================
-- Idempotent; safe to run before or after the backend deploy. The server
-- also creates honey_ledger on its own (same definition) when it can, so
-- running this only makes it explicit and adds the guard indexes.
--
-- honey_ledger: one row per honey credit or debit, written in the same
-- transaction as the balance change. idempotency_key makes a reward that is
-- claimed twice (raid:<id>:<wallet>, game:<session>, meme_winner:<week>:<wallet>,
-- store_refund:<purchase>) apply once. wallet_address is lowercase;
-- stored_wallet is the honey_points row (letter case) that changed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS honey_ledger (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  stored_wallet TEXT,
  delta NUMERIC(14, 2) NOT NULL,
  balance_after NUMERIC(14, 2),
  source TEXT NOT NULL,
  ref_id TEXT,
  idempotency_key TEXT UNIQUE,
  reason TEXT,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_honey_ledger_wallet_created ON honey_ledger (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_honey_ledger_source_ref ON honey_ledger (source, ref_id);

-- Server-only table: RLS on with no policy keeps PostgREST (the public anon
-- key) out entirely. The API reads and writes it as the owner / service role.
ALTER TABLE honey_ledger ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE honey_ledger FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE honey_ledger FROM authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Case-insensitive uniqueness. The existing UNIQUE constraints compare the
-- wallet letter-for-letter, so "rAbC..." and "rabc..." counted as two
-- wallets. The API now checks case-insensitively under a lock; these
-- indexes are the database's own backstop. Each is created only if the
-- current data allows it; otherwise a NOTICE says what to clean up first
-- (those duplicates are past double-claims worth reviewing).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  dupes BIGINT;
BEGIN
  -- one completion per wallet per raid
  IF to_regclass('public.raid_completions') IS NOT NULL THEN
    SELECT count(*) INTO dupes FROM (
      SELECT 1 FROM raid_completions GROUP BY lower(wallet_address), raid_id HAVING count(*) > 1
    ) d;
    IF dupes = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS raid_completions_wallet_ci_raid_key
        ON raid_completions (lower(wallet_address), raid_id);
    ELSE
      RAISE NOTICE 'raid_completions: % raid(s) were completed more than once by one wallet in different letter case; index not created. See: SELECT lower(wallet_address), raid_id, count(*) FROM raid_completions GROUP BY 1, 2 HAVING count(*) > 1;', dupes;
    END IF;
  END IF;

  -- one meme submission reward per wallet per week
  IF to_regclass('public.meme_submission_rewards') IS NOT NULL THEN
    SELECT count(*) INTO dupes FROM (
      SELECT 1 FROM meme_submission_rewards GROUP BY lower(wallet_address), week_id HAVING count(*) > 1
    ) d;
    IF dupes = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS meme_submission_rewards_wallet_ci_week_key
        ON meme_submission_rewards (lower(wallet_address), week_id);
    ELSE
      RAISE NOTICE 'meme_submission_rewards: % wallet/week pairs rewarded more than once; index not created.', dupes;
    END IF;
  END IF;

  -- one copy of each cosmetic per wallet
  IF to_regclass('public.user_cosmetics') IS NOT NULL THEN
    SELECT count(*) INTO dupes FROM (
      SELECT 1 FROM user_cosmetics GROUP BY lower(wallet_address), cosmetic_id HAVING count(*) > 1
    ) d;
    IF dupes = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS user_cosmetics_wallet_ci_cosmetic_key
        ON user_cosmetics (lower(wallet_address), cosmetic_id);
    ELSE
      RAISE NOTICE 'user_cosmetics: % wallet/cosmetic pairs owned twice; index not created.', dupes;
    END IF;
  END IF;

  -- one live buyer per store NFT
  IF to_regclass('public.nft_purchase_requests') IS NOT NULL THEN
    SELECT count(*) INTO dupes FROM (
      SELECT 1 FROM nft_purchase_requests
      WHERE status IN ('pending', 'fulfilled')
      GROUP BY upper(nft_token_id) HAVING count(*) > 1
    ) d;
    IF dupes = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS nft_purchase_requests_live_token_key
        ON nft_purchase_requests (upper(nft_token_id))
        WHERE status IN ('pending', 'fulfilled');
    ELSE
      RAISE NOTICE 'nft_purchase_requests: % NFTs have more than one pending/fulfilled buyer (someone paid for an NFT they cannot get); index not created.', dupes;
    END IF;
  END IF;

  -- one merch order per ledger payment
  IF to_regclass('public.merch_orders') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'merch_orders' AND column_name = 'payment_tx_hash') THEN
    SELECT count(*) INTO dupes FROM (
      SELECT 1 FROM merch_orders WHERE payment_tx_hash IS NOT NULL GROUP BY payment_tx_hash HAVING count(*) > 1
    ) d;
    IF dupes = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS merch_orders_payment_tx_hash_key
        ON merch_orders (payment_tx_hash)
        WHERE payment_tx_hash IS NOT NULL;
    ELSE
      RAISE NOTICE 'merch_orders: % payments marked more than one order paid; index not created.', dupes;
    END IF;
  END IF;
END $$;

-- Useful afterwards:
--   SELECT * FROM honey_ledger WHERE wallet_address = lower('rYourWallet') ORDER BY created_at DESC;
--   SELECT source, count(*), sum(delta) FROM honey_ledger WHERE created_at > now() - interval '1 day' GROUP BY 1;

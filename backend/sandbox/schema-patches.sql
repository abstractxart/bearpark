-- What server.js uses that no SQL file in the repo creates (production made these
-- by hand in the Supabase dashboard). Derived from server.js's reads/writes and
-- from production's public GET responses. Everything is idempotent.
--
-- Deliberately NOT patched (they reproduce production): the notifications.type
-- CHECK list and the absence of a notifications.read column. Those are fixed by
-- migrations/006-social-notifications.sql, which db.js loads like any migration.

-- ---------------------------------------------------------------------------
-- Social

-- Wall replies (production has it: GET /api/comments/:wallet returns parent_id).
ALTER TABLE profile_comments ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES profile_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_profile_comments_parent ON profile_comments(parent_id);

-- ---------------------------------------------------------------------------
-- Raids (raids table itself: backend/supabase-raids-setup.sql)

ALTER TABLE raids ADD COLUMN IF NOT EXISTS verification_type TEXT DEFAULT 'unverified';
ALTER TABLE raids ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE raids ADD COLUMN IF NOT EXISTS tweet_thumbnail TEXT;

CREATE TABLE IF NOT EXISTS raid_completions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  raid_id BIGINT NOT NULL,
  points_awarded NUMERIC DEFAULT 0,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (wallet_address, raid_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_completions_wallet ON raid_completions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_raid_completions_raid_id ON raid_completions(raid_id);

-- ---------------------------------------------------------------------------
-- Games / admin analytics

CREATE TABLE IF NOT EXISTS game_points (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  game_id TEXT,
  minutes_played NUMERIC DEFAULT 0,
  points_awarded NUMERIC DEFAULT 0,
  session_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_blacklist (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Store and merch

CREATE TABLE IF NOT EXISTS store_token_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  token_type TEXT,
  token_amount TEXT,
  honey_spent NUMERIC DEFAULT 0,
  tx_hash TEXT,
  tx_status TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nft_purchase_requests (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  nft_token_id TEXT,
  nft_type TEXT,
  nft_name TEXT,
  honey_spent NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  tx_hash TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS merch_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE,
  wallet_address TEXT,
  product_id TEXT,
  product_name TEXT,
  size TEXT,
  items JSONB,
  items_summary TEXT,
  payment_method TEXT,
  amount_usd NUMERIC,
  payment_amount NUMERIC,
  payment_currency TEXT,
  payment_tx_hash TEXT,
  destination_tag BIGINT,
  shipping_name_encrypted TEXT,
  shipping_street_encrypted TEXT,
  shipping_apt_encrypted TEXT,
  shipping_city_encrypted TEXT,
  shipping_state TEXT,
  shipping_zip_encrypted TEXT,
  shipping_country TEXT,
  status TEXT DEFAULT 'pending',
  tracking_number TEXT,
  conversion_tx_hash TEXT,
  rlusd_received NUMERIC(20, 6),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

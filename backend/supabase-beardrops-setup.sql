-- =====================================================
-- BEAR Park BEARDROPS Airdrop System Setup
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. Daily Airdrop Snapshots Table
-- Records each wallet's holdings at snapshot time (00:00 UTC)
-- =====================================================
CREATE TABLE IF NOT EXISTS airdrop_snapshots (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL,

  -- NFT Holdings
  pixel_bears INTEGER DEFAULT 0,
  ultra_rares INTEGER DEFAULT 0,

  -- LP Token Holdings (stored as string for precision)
  lp_tokens VARCHAR(50) DEFAULT '0',

  -- Calculated Airdrop Amount
  nft_reward DECIMAL(20, 6) DEFAULT 0,      -- pixel_bears * 1 + ultra_rares * 5
  lp_reward DECIMAL(20, 6) DEFAULT 0,       -- lp_tokens / 250000
  total_reward DECIMAL(20, 6) DEFAULT 0,    -- nft_reward + lp_reward

  -- Status
  is_blacklisted BOOLEAN DEFAULT FALSE,     -- True if wallet is LP blacklisted
  is_eligible BOOLEAN DEFAULT FALSE,        -- True if has 30+ honey points in 24h
  honey_points_24h INTEGER DEFAULT 0,       -- Rolling 24h honey points at snapshot

  -- Claim Status
  claim_status VARCHAR(20) DEFAULT 'pending', -- pending, claimed, expired, ineligible
  claimed_at TIMESTAMPTZ,
  claim_tx_hash VARCHAR(255),               -- XRPL transaction hash

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(wallet_address, snapshot_date)
);

-- =====================================================
-- 2. LP Blacklist Table
-- Wallets that have done single-side LP deposits/withdrawals
-- =====================================================
CREATE TABLE IF NOT EXISTS lp_blacklist (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) UNIQUE NOT NULL,
  reason VARCHAR(255) NOT NULL,             -- 'single_side_deposit', 'single_side_withdraw'
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  tx_hash VARCHAR(255),                     -- Transaction that triggered blacklist
  is_active BOOLEAN DEFAULT TRUE,           -- Can be manually overridden
  notes TEXT,                               -- Admin notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. Airdrop Transactions Table
-- Records all $BEAR payments sent
-- =====================================================
CREATE TABLE IF NOT EXISTS airdrop_transactions (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT REFERENCES airdrop_snapshots(id),
  wallet_address VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 6) NOT NULL,

  -- XRPL Transaction Details
  tx_hash VARCHAR(255),
  tx_status VARCHAR(20) DEFAULT 'pending',  -- pending, submitted, validated, failed
  tx_result VARCHAR(50),                    -- tesSUCCESS, etc.
  ledger_index BIGINT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ
);

-- =====================================================
-- 4. Airdrop Config Table
-- System configuration settings
-- =====================================================
CREATE TABLE IF NOT EXISTS airdrop_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config values
INSERT INTO airdrop_config (key, value, description) VALUES
  ('min_honey_points_24h', '30', 'Minimum honey points in rolling 24h to be eligible'),
  ('bear_per_pixel_bear', '1', '$BEAR reward per Pixel Bear NFT'),
  ('bear_per_ultra_rare', '5', '$BEAR reward per Ultra Rare NFT'),
  ('lp_tokens_per_bear', '250000', 'LP tokens required for 1 $BEAR'),
  ('snapshot_time_utc', '00:00', 'Daily snapshot time in UTC'),
  ('airdrop_enabled', 'true', 'Master switch for airdrop system'),
  ('claim_expiry_days', '7', 'Days before unclaimed rewards expire')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 5. Honey Points Activity Log (for 24h rolling calculation)
-- =====================================================
CREATE TABLE IF NOT EXISTS honey_points_activity (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  points INTEGER NOT NULL,
  activity_type VARCHAR(50) NOT NULL,       -- 'game', 'raid', 'bulletin', etc.
  activity_id VARCHAR(255),                 -- Reference to specific activity
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. Create Indexes for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_airdrop_snapshots_wallet ON airdrop_snapshots(wallet_address);
CREATE INDEX IF NOT EXISTS idx_airdrop_snapshots_date ON airdrop_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_airdrop_snapshots_status ON airdrop_snapshots(claim_status);
CREATE INDEX IF NOT EXISTS idx_airdrop_snapshots_wallet_date ON airdrop_snapshots(wallet_address, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_lp_blacklist_wallet ON lp_blacklist(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lp_blacklist_active ON lp_blacklist(is_active);

CREATE INDEX IF NOT EXISTS idx_airdrop_tx_wallet ON airdrop_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_airdrop_tx_status ON airdrop_transactions(tx_status);
CREATE INDEX IF NOT EXISTS idx_airdrop_tx_snapshot ON airdrop_transactions(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_honey_activity_wallet ON honey_points_activity(wallet_address);
CREATE INDEX IF NOT EXISTS idx_honey_activity_created ON honey_points_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_honey_activity_wallet_time ON honey_points_activity(wallet_address, created_at DESC);

-- =====================================================
-- 7. Enable Row Level Security (RLS)
-- =====================================================
ALTER TABLE airdrop_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE airdrop_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE airdrop_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE honey_points_activity ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 8. RLS Policies
-- =====================================================

-- Airdrop Snapshots: Users can only see their own data
CREATE POLICY "Users can view own airdrop snapshots"
  ON airdrop_snapshots
  FOR SELECT
  USING (true); -- We'll filter by wallet in the app

CREATE POLICY "Service role can manage airdrop snapshots"
  ON airdrop_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- LP Blacklist: Public read, service write
CREATE POLICY "Public can view LP blacklist"
  ON lp_blacklist
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage LP blacklist"
  ON lp_blacklist
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Airdrop Transactions: Public read for transparency
CREATE POLICY "Public can view airdrop transactions"
  ON airdrop_transactions
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage airdrop transactions"
  ON airdrop_transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Airdrop Config: Public read
CREATE POLICY "Public can view airdrop config"
  ON airdrop_config
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage airdrop config"
  ON airdrop_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Honey Points Activity: Public read
CREATE POLICY "Public can view honey points activity"
  ON honey_points_activity
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage honey points activity"
  ON honey_points_activity
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 9. Function: Get Rolling 24h Honey Points
-- =====================================================
CREATE OR REPLACE FUNCTION get_honey_points_24h(p_wallet TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_points INTEGER;
BEGIN
  SELECT COALESCE(SUM(points), 0) INTO v_points
  FROM honey_points_activity
  WHERE wallet_address = p_wallet
    AND created_at >= NOW() - INTERVAL '24 hours';

  RETURN v_points;
END;
$$;

GRANT EXECUTE ON FUNCTION get_honey_points_24h TO authenticated, anon, service_role;

-- =====================================================
-- 10. Function: Check Wallet Eligibility
-- Returns eligibility status and details
-- =====================================================
CREATE OR REPLACE FUNCTION check_airdrop_eligibility(p_wallet TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_honey_24h INTEGER;
  v_is_blacklisted BOOLEAN;
  v_min_honey INTEGER;
BEGIN
  -- Get config
  SELECT value::INTEGER INTO v_min_honey
  FROM airdrop_config WHERE key = 'min_honey_points_24h';

  -- Get 24h honey points
  v_honey_24h := get_honey_points_24h(p_wallet);

  -- Check blacklist
  SELECT EXISTS(
    SELECT 1 FROM lp_blacklist
    WHERE wallet_address = p_wallet AND is_active = TRUE
  ) INTO v_is_blacklisted;

  RETURN json_build_object(
    'wallet', p_wallet,
    'honey_points_24h', v_honey_24h,
    'min_required', v_min_honey,
    'is_blacklisted', v_is_blacklisted,
    'is_eligible', (v_honey_24h >= v_min_honey AND NOT v_is_blacklisted)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_airdrop_eligibility TO authenticated, anon, service_role;

-- =====================================================
-- 11. Function: Calculate Airdrop Amount
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_airdrop_amount(
  p_pixel_bears INTEGER,
  p_ultra_rares INTEGER,
  p_lp_tokens DECIMAL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_bear_per_pixel DECIMAL;
  v_bear_per_ultra DECIMAL;
  v_lp_per_bear DECIMAL;
  v_nft_reward DECIMAL;
  v_lp_reward DECIMAL;
  v_total DECIMAL;
BEGIN
  -- Get config values
  SELECT value::DECIMAL INTO v_bear_per_pixel
  FROM airdrop_config WHERE key = 'bear_per_pixel_bear';

  SELECT value::DECIMAL INTO v_bear_per_ultra
  FROM airdrop_config WHERE key = 'bear_per_ultra_rare';

  SELECT value::DECIMAL INTO v_lp_per_bear
  FROM airdrop_config WHERE key = 'lp_tokens_per_bear';

  -- Calculate rewards
  v_nft_reward := (p_pixel_bears * v_bear_per_pixel) + (p_ultra_rares * v_bear_per_ultra);
  v_lp_reward := p_lp_tokens / v_lp_per_bear;
  v_total := v_nft_reward + v_lp_reward;

  RETURN json_build_object(
    'pixel_bears', p_pixel_bears,
    'ultra_rares', p_ultra_rares,
    'lp_tokens', p_lp_tokens,
    'nft_reward', v_nft_reward,
    'lp_reward', ROUND(v_lp_reward, 6),
    'total_reward', ROUND(v_total, 6)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_airdrop_amount TO authenticated, anon, service_role;

-- =====================================================
-- 12. Function: Record Honey Points Activity
-- Call this whenever points are earned
-- =====================================================
CREATE OR REPLACE FUNCTION record_honey_activity(
  p_wallet TEXT,
  p_points INTEGER,
  p_activity_type TEXT,
  p_activity_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO honey_points_activity (wallet_address, points, activity_type, activity_id)
  VALUES (p_wallet, p_points, p_activity_type, p_activity_id);

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION record_honey_activity TO authenticated, anon, service_role;

-- =====================================================
-- 13. View: Pending Claims Summary
-- For admin dashboard
-- =====================================================
CREATE OR REPLACE VIEW pending_claims_summary AS
SELECT
  snapshot_date,
  COUNT(*) as total_wallets,
  COUNT(*) FILTER (WHERE is_eligible AND NOT is_blacklisted) as eligible_wallets,
  COUNT(*) FILTER (WHERE claim_status = 'claimed') as claimed_count,
  COUNT(*) FILTER (WHERE claim_status = 'pending' AND is_eligible) as pending_count,
  SUM(total_reward) FILTER (WHERE is_eligible AND NOT is_blacklisted) as total_bear_to_distribute,
  SUM(total_reward) FILTER (WHERE claim_status = 'claimed') as total_bear_claimed
FROM airdrop_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC;

-- =====================================================
-- 14. View: Wallet Airdrop History
-- =====================================================
CREATE OR REPLACE VIEW wallet_airdrop_history AS
SELECT
  s.wallet_address,
  s.snapshot_date,
  s.pixel_bears,
  s.ultra_rares,
  s.lp_tokens,
  s.nft_reward,
  s.lp_reward,
  s.total_reward,
  s.is_eligible,
  s.is_blacklisted,
  s.honey_points_24h,
  s.claim_status,
  s.claimed_at,
  s.claim_tx_hash,
  p.display_name,
  p.avatar_nft
FROM airdrop_snapshots s
LEFT JOIN profiles p ON s.wallet_address = p.wallet_address
ORDER BY s.snapshot_date DESC, s.total_reward DESC;

-- =====================================================
-- Setup Complete!
-- =====================================================

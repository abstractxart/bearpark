-- Migration: LP Balance Tracking
-- Tracks when wallets add/remove LP tokens to detect single-side deposits

-- =====================================================
-- LP Balance History Table
-- Records LP balance changes over time
-- =====================================================
CREATE TABLE IF NOT EXISTS lp_balance_history (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL,

  -- LP Balance
  lp_balance VARCHAR(50) NOT NULL,           -- Current LP balance
  previous_balance VARCHAR(50) DEFAULT '0',  -- Previous day's balance
  balance_change VARCHAR(50) DEFAULT '0',    -- Difference

  -- Change Type
  change_type VARCHAR(20),                   -- 'increase', 'decrease', 'new', 'unchanged'

  -- Timestamps
  first_seen_at TIMESTAMPTZ,                 -- When this wallet first appeared with LP
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(wallet_address, snapshot_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lp_history_wallet ON lp_balance_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lp_history_date ON lp_balance_history(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_lp_history_change ON lp_balance_history(change_type);
CREATE INDEX IF NOT EXISTS idx_lp_history_first_seen ON lp_balance_history(first_seen_at DESC);

-- RLS
ALTER TABLE lp_balance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view LP history"
  ON lp_balance_history
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage LP history"
  ON lp_balance_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- View: New LP Deposits (last 7 days)
-- Shows wallets that added LP recently for review
-- =====================================================
CREATE OR REPLACE VIEW recent_lp_changes AS
SELECT
  h.wallet_address,
  h.snapshot_date,
  h.lp_balance,
  h.previous_balance,
  h.balance_change,
  h.change_type,
  h.first_seen_at,
  p.display_name,
  b.id as is_blacklisted
FROM lp_balance_history h
LEFT JOIN profiles p ON h.wallet_address = p.wallet_address
LEFT JOIN lp_blacklist b ON h.wallet_address = b.wallet_address AND b.is_active = true
WHERE h.change_type IN ('increase', 'new')
  AND h.snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY h.snapshot_date DESC, CAST(h.balance_change AS DECIMAL) DESC;

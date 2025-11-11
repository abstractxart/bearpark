-- =====================================================
-- BEAR Park Admin Features Database Setup
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create banned_users table
CREATE TABLE IF NOT EXISTS banned_users (
  wallet_address VARCHAR(255) PRIMARY KEY,
  banned_at TIMESTAMPTZ DEFAULT NOW(),
  banned_by VARCHAR(255) NOT NULL,
  reason TEXT,
  is_banned BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_banned_users_status ON banned_users(is_banned);

-- 2. Create admin_activity_logs table
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  admin_wallet VARCHAR(255) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  details JSONB,
  target_wallet VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON admin_activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_admin ON admin_activity_logs(admin_wallet);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON admin_activity_logs(action_type);

-- 3. Create game_settings table
CREATE TABLE IF NOT EXISTS game_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(255)
);

-- Insert default game settings
INSERT INTO game_settings (key, value, updated_by) VALUES
  ('max_daily_minutes', '20', 'system'),
  ('points_per_minute', '1', 'system'),
  ('idle_timeout_seconds', '3', 'system')
ON CONFLICT (key) DO NOTHING;

-- 4. Create point_transactions table
CREATE TABLE IF NOT EXISTS point_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  amount NUMERIC NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'manual_add', 'manual_subtract', 'game', 'raid', 'bulk_award'
  reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  admin_wallet VARCHAR(255),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_wallet ON point_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_point_transactions_timestamp ON point_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON point_transactions(transaction_type);

-- 5. Enable Row Level Security
ALTER TABLE banned_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

-- 6. Create policies for admin access
CREATE POLICY "Allow admin read access to banned_users"
  ON banned_users FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write access to banned_users"
  ON banned_users FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow admin read access to activity_logs"
  ON admin_activity_logs FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write access to activity_logs"
  ON admin_activity_logs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public read access to game_settings"
  ON game_settings FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write access to game_settings"
  ON game_settings FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow admin read access to point_transactions"
  ON point_transactions FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write access to point_transactions"
  ON point_transactions FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- Setup Complete!
-- =====================================================

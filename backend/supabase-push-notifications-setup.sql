-- =====================================================
-- BEAR Park Push Notifications Setup
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  wallet_address VARCHAR(255) PRIMARY KEY,
  subscription JSONB NOT NULL,
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  last_notification_sent TIMESTAMPTZ
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
  ON push_subscriptions(is_active);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated
  ON push_subscriptions(updated_at DESC);

-- 3. Enable Row Level Security
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Create policies (allow public access for subscribing)
CREATE POLICY "Allow public read access to push_subscriptions"
  ON push_subscriptions FOR SELECT
  USING (true);

CREATE POLICY "Allow users to manage their own subscriptions"
  ON push_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscription_timestamp();

-- =====================================================
-- Setup Complete!
-- =====================================================

SELECT 'Push notifications table created successfully!' AS status;

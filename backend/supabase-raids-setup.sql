-- =====================================================
-- BEAR Park Raids Database Setup
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create raids table
CREATE TABLE IF NOT EXISTS raids (
  id BIGSERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  twitter_url TEXT NOT NULL,
  reward INTEGER DEFAULT 20,
  profile_name VARCHAR(255) DEFAULT 'BearXRPL',
  profile_handle VARCHAR(255) DEFAULT '@BearXRPL',
  profile_emoji VARCHAR(10) DEFAULT '🐻',
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_raids_active ON raids(is_active, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_created ON raids(created_at DESC);

-- 3. Enable Row Level Security
ALTER TABLE raids ENABLE ROW LEVEL SECURITY;

-- 4. Allow public read access to active raids
CREATE POLICY "Allow public read access to active raids"
  ON raids FOR SELECT
  USING (is_active = true AND expires_at > NOW());

-- 5. Allow insert/update/delete (for admin)
CREATE POLICY "Allow all operations on raids"
  ON raids FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- Setup Complete!
-- =====================================================

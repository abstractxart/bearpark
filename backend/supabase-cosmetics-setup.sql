-- =====================================================
-- BEAR PARK COSMETICS SYSTEM SETUP
-- Honey Points Store: Profile Rings & Banners
-- =====================================================

-- Create cosmetics_catalog table (items for sale in the store)
CREATE TABLE IF NOT EXISTS cosmetics_catalog (
  id BIGSERIAL PRIMARY KEY,
  cosmetic_type VARCHAR(50) NOT NULL CHECK (cosmetic_type IN ('ring', 'banner')),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url VARCHAR(500),
  honey_cost INTEGER NOT NULL,
  rarity VARCHAR(50) CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  is_animated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_cosmetics table (user's inventory)
CREATE TABLE IF NOT EXISTS user_cosmetics (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  cosmetic_id BIGINT NOT NULL REFERENCES cosmetics_catalog(id),
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(wallet_address, cosmetic_id)
);

-- Create cosmetics_transactions table (purchase history)
CREATE TABLE IF NOT EXISTS cosmetics_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  cosmetic_id BIGINT NOT NULL REFERENCES cosmetics_catalog(id),
  honey_spent INTEGER NOT NULL,
  transaction_type VARCHAR(50) DEFAULT 'purchase',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add equipped cosmetics columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS equipped_ring_id BIGINT REFERENCES cosmetics_catalog(id),
ADD COLUMN IF NOT EXISTS equipped_banner_id BIGINT REFERENCES cosmetics_catalog(id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_wallet
  ON user_cosmetics(wallet_address);

CREATE INDEX IF NOT EXISTS idx_user_cosmetics_cosmetic_id
  ON user_cosmetics(cosmetic_id);

CREATE INDEX IF NOT EXISTS idx_cosmetics_transactions_wallet
  ON cosmetics_transactions(wallet_address);

CREATE INDEX IF NOT EXISTS idx_cosmetics_transactions_created_at
  ON cosmetics_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cosmetics_catalog_type
  ON cosmetics_catalog(cosmetic_type);

-- Enable Row Level Security
ALTER TABLE cosmetics_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetics_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for cosmetics_catalog (everyone can view)
CREATE POLICY "Anyone can view cosmetics catalog"
  ON cosmetics_catalog FOR SELECT
  USING (true);

-- Policies for user_cosmetics
CREATE POLICY "Anyone can view user inventories"
  ON user_cosmetics FOR SELECT
  USING (true);

CREATE POLICY "Users can add to their own inventory"
  ON user_cosmetics FOR INSERT
  WITH CHECK (true);

-- Policies for cosmetics_transactions
CREATE POLICY "Anyone can view transactions"
  ON cosmetics_transactions FOR SELECT
  USING (true);

CREATE POLICY "Can create transactions"
  ON cosmetics_transactions FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON cosmetics_catalog TO anon;
GRANT ALL ON cosmetics_catalog TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE cosmetics_catalog_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE cosmetics_catalog_id_seq TO authenticated;

GRANT ALL ON user_cosmetics TO anon;
GRANT ALL ON user_cosmetics TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE user_cosmetics_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE user_cosmetics_id_seq TO authenticated;

GRANT ALL ON cosmetics_transactions TO anon;
GRANT ALL ON cosmetics_transactions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE cosmetics_transactions_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE cosmetics_transactions_id_seq TO authenticated;

-- Insert initial cosmetic items with new rarity system
-- COMMON (Green) = 150-200 HP | RARE (Blue) = 400 HP | EPIC (Purple) = 500 HP | LEGENDARY (Gold) = 800 HP

-- Profile Rings
INSERT INTO cosmetics_catalog (cosmetic_type, name, description, image_url, honey_cost, rarity, is_animated)
VALUES
  ('ring', 'Purple Ring', 'A solid purple ring around your profile picture', 'purple-ring.svg', 150, 'common', FALSE),
  ('ring', 'Green Ring', 'A solid green ring around your profile picture', 'green-ring.svg', 150, 'common', FALSE),
  ('ring', 'Yellow Ring', 'A solid yellow ring around your profile picture', 'yellow-ring.svg', 150, 'common', FALSE),
  ('ring', 'Tri-Color Ring', 'A gradient ring with all BEARpark colors', 'tricolor-ring.svg', 400, 'rare', FALSE),
  ('ring', 'Animated Tri-Color Ring', 'An epic spinning gradient ring - the ultimate flex!', 'animated-tricolor-ring.svg', 800, 'legendary', TRUE)
ON CONFLICT DO NOTHING;

-- Profile Banners
INSERT INTO cosmetics_catalog (cosmetic_type, name, description, image_url, honey_cost, rarity, is_animated)
VALUES
  ('banner', 'Honeycomb Banner', 'A golden honeycomb pattern banner', 'banner-honeycomb.svg', 200, 'common', FALSE),
  ('banner', 'Forest Banner', 'A lush forest scene banner', 'banner-forest.svg', 200, 'common', FALSE),
  ('banner', 'Abstract Geometric Banner', 'Abstract shapes in BEARpark colors', 'banner-geometric.svg', 200, 'common', FALSE),
  ('banner', 'Starry Night Banner', 'A mystical starry night sky', 'banner-starry.svg', 500, 'epic', FALSE),
  ('banner', 'Golden Honey Banner', 'Premium liquid gold honey flow', 'banner-golden-honey.svg', 500, 'epic', FALSE)
ON CONFLICT DO NOTHING;

-- Add comments
COMMENT ON TABLE cosmetics_catalog IS 'Catalog of all cosmetic items available for purchase';
COMMENT ON TABLE user_cosmetics IS 'User inventory of owned cosmetic items';
COMMENT ON TABLE cosmetics_transactions IS 'History of all cosmetic purchases';
COMMENT ON COLUMN profiles.equipped_ring_id IS 'Currently equipped profile ring cosmetic';
COMMENT ON COLUMN profiles.equipped_banner_id IS 'Currently equipped profile banner cosmetic';

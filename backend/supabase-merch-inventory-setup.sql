-- Merch Inventory Table Setup (Full Version with Images & Description)
-- Run this in your Supabase SQL Editor

-- Create the merch_inventory table
CREATE TABLE IF NOT EXISTS merch_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  low_stock_threshold INTEGER DEFAULT 5,
  stock JSONB NOT NULL DEFAULT '{"S": 0, "M": 0, "L": 0, "XL": 0, "2XL": 0}'::jsonb,
  images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if table already exists (run these if upgrading)
ALTER TABLE merch_inventory ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE merch_inventory ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_merch_inventory_id ON merch_inventory(id);

-- Enable RLS
ALTER TABLE merch_inventory ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow public read access" ON merch_inventory;
DROP POLICY IF EXISTS "Allow service role full access" ON merch_inventory;

-- Allow public read access for store
CREATE POLICY "Allow public read access" ON merch_inventory
  FOR SELECT USING (true);

-- Allow service role full access (for admin operations)
CREATE POLICY "Allow service role full access" ON merch_inventory
  FOR ALL USING (auth.role() = 'service_role');

-- Insert/Update default product (Pocket Jester) with full details
INSERT INTO merch_inventory (id, name, description, price, low_stock_threshold, stock, images)
VALUES (
  'pocket-jester',
  'POCKET JESTER',
  'Premium heavyweight cotton tee featuring the iconic Pocket Jester design. This limited edition shirt showcases the playful and mischievous spirit of the BEAR community. Perfect for those who want to show their $BEAR pride in style!',
  30.00,
  5,
  '{"S": 10, "M": 15, "L": 20, "XL": 15, "2XL": 10}'::jsonb,
  '["https://files.catbox.moe/n3rrso.webp"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  images = EXCLUDED.images;

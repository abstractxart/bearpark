-- Merch Inventory Table Setup
-- Run this in your Supabase SQL Editor

-- Create the merch_inventory table
CREATE TABLE IF NOT EXISTS merch_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  low_stock_threshold INTEGER DEFAULT 5,
  stock JSONB NOT NULL DEFAULT '{"S": 0, "M": 0, "L": 0, "XL": 0, "2XL": 0}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_merch_inventory_id ON merch_inventory(id);

-- Enable RLS
ALTER TABLE merch_inventory ENABLE ROW LEVEL SECURITY;

-- Allow public read access for store
CREATE POLICY "Allow public read access" ON merch_inventory
  FOR SELECT USING (true);

-- Allow service role full access (for admin operations)
CREATE POLICY "Allow service role full access" ON merch_inventory
  FOR ALL USING (auth.role() = 'service_role');

-- Insert default product (Pocket Jester)
INSERT INTO merch_inventory (id, name, price, low_stock_threshold, stock)
VALUES (
  'pocket-jester',
  'POCKET JESTER',
  30.00,
  5,
  '{"S": 10, "M": 15, "L": 20, "XL": 15, "2XL": 10}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Verify the table was created
SELECT * FROM merch_inventory;

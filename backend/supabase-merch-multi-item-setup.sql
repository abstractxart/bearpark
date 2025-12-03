-- Add multi-item support columns to merch_orders table
-- Run this in your Supabase SQL Editor

-- Add column to store all order items as JSON array
ALTER TABLE merch_orders
ADD COLUMN IF NOT EXISTS items JSONB;

-- Add column to store human-readable items summary (e.g., "2x Hoodie (M) | 1x T-Shirt (L)")
ALTER TABLE merch_orders
ADD COLUMN IF NOT EXISTS items_summary TEXT;

-- Add column to store product name (for easier admin display)
ALTER TABLE merch_orders
ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Comment the columns for documentation
COMMENT ON COLUMN merch_orders.items IS 'JSON array of all items in order: [{product_id, name, size, quantity, price, image}]';
COMMENT ON COLUMN merch_orders.items_summary IS 'Human-readable summary of all items: "2x Hoodie (M) | 1x T-Shirt (L)"';
COMMENT ON COLUMN merch_orders.product_name IS 'Name of the primary product (for backward compatibility)';

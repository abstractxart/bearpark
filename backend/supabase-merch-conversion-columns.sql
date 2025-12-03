-- Add conversion tracking columns to merch_orders table
-- Run this in your Supabase SQL Editor

-- Add column to store the XRP → RLUSD conversion transaction hash
ALTER TABLE merch_orders
ADD COLUMN IF NOT EXISTS conversion_tx_hash TEXT;

-- Add column to store the RLUSD amount received from conversion
ALTER TABLE merch_orders
ADD COLUMN IF NOT EXISTS rlusd_received DECIMAL(20,6);

-- Comment the columns for documentation
COMMENT ON COLUMN merch_orders.conversion_tx_hash IS 'TX hash of the XRP to RLUSD DEX conversion (if auto-convert enabled)';
COMMENT ON COLUMN merch_orders.rlusd_received IS 'Amount of RLUSD received from auto-conversion';

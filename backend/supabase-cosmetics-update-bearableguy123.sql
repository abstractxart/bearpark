-- =====================================================
-- UPDATE COSMETICS CATALOG WITH BEARABLEGUY123 TIER
-- Add new ultra-rare items with image-based rings
-- =====================================================

-- First, update the rarity check constraint to include bearableguy123
ALTER TABLE cosmetics_catalog
DROP CONSTRAINT IF EXISTS cosmetics_catalog_rarity_check;

ALTER TABLE cosmetics_catalog
ADD CONSTRAINT cosmetics_catalog_rarity_check
CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'bearableguy123'));

-- Add additional metadata columns for image-based rings
ALTER TABLE cosmetics_catalog
ADD COLUMN IF NOT EXISTS ring_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS css_gradient TEXT;

-- Update existing rings with ring_type
UPDATE cosmetics_catalog SET ring_type = 'purple' WHERE name = 'Purple Ring';
UPDATE cosmetics_catalog SET ring_type = 'green' WHERE name = 'Green Ring';
UPDATE cosmetics_catalog SET ring_type = 'yellow' WHERE name = 'Yellow Ring';
UPDATE cosmetics_catalog SET ring_type = 'tricolor' WHERE name = 'Tri-Color Ring';
UPDATE cosmetics_catalog SET ring_type = 'animated' WHERE name = 'Animated Tri-Color Ring';

-- Update existing banners with gradients
UPDATE cosmetics_catalog SET css_gradient = 'linear-gradient(135deg, #1a1400, #2a2400)' WHERE name = 'Honeycomb Banner';
UPDATE cosmetics_catalog SET css_gradient = 'linear-gradient(180deg, #1a3a1a, #0a1a0a)' WHERE name = 'Forest Banner';
UPDATE cosmetics_catalog SET css_gradient = 'radial-gradient(circle, #1a1a3a, #0a0a1a)' WHERE name = 'Starry Night Banner';
UPDATE cosmetics_catalog SET css_gradient = 'linear-gradient(135deg, #ffae00, #edb723, #d4a017)' WHERE name = 'Golden Honey Banner';

-- Insert new legendary and bearableguy123 rings
INSERT INTO cosmetics_catalog (cosmetic_type, name, description, image_url, honey_cost, rarity, is_animated, ring_type)
VALUES
  -- Legendary Rings (Image-based, static)
  ('ring', 'Waves Ring', 'Flowing waves of energy surrounding your avatar. Legendary serenity.', 'https://files.catbox.moe/6q69or.png', 800, 'legendary', FALSE, 'waves-static'),
  ('ring', 'Castle Walls Ring', 'Ancient fortress walls protecting your profile. Legendary strength and defense.', 'https://files.catbox.moe/8vd6jp.png', 800, 'legendary', FALSE, 'castle-static'),

  -- BEARABLEGUY123 Rings (Ultra-rare, spinning)
  ('ring', 'Spinning Ouroboros Ring', 'The eternal serpent spinning with infinite power. Green energy radiates from the ancient symbol.', 'https://files.catbox.moe/jedwz8.png', 1500, 'bearableguy123', TRUE, 'ouroboros'),
  ('ring', 'Spinning Waves Ring', 'Hypnotic waves spinning with pure white energy. Feel the power flow through you.', 'https://files.catbox.moe/6q69or.png', 1500, 'bearableguy123', TRUE, 'waves'),
  ('ring', 'BEARABLEGUY123 Eclipse Ring', 'Bearableguy123 red mask energy! Pulsing blood moon animation. Only for the legends.', NULL, 2000, 'bearableguy123', TRUE, 'bearableguy123'),
  ('ring', 'Spinning Castle Walls Ring', 'The fortress spins with radiant white power. Ultimate protection and prestige.', 'https://files.catbox.moe/8vd6jp.png', 1500, 'bearableguy123', TRUE, 'castle')
ON CONFLICT DO NOTHING;

-- Add comments
COMMENT ON COLUMN cosmetics_catalog.ring_type IS 'CSS class or type identifier for ring styles';
COMMENT ON COLUMN cosmetics_catalog.css_gradient IS 'CSS gradient for banner backgrounds';

-- Display count
SELECT
  rarity,
  COUNT(*) as item_count
FROM cosmetics_catalog
GROUP BY rarity
ORDER BY
  CASE rarity
    WHEN 'common' THEN 1
    WHEN 'rare' THEN 2
    WHEN 'epic' THEN 3
    WHEN 'legendary' THEN 4
    WHEN 'bearableguy123' THEN 5
  END;

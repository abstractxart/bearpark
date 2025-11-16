// Equip a cosmetic item
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet_address, cosmetic_id } = req.body;

  if (!wallet_address) {
    return res.status(400).json({
      success: false,
      error: 'Wallet address required'
    });
  }

  try {
    // If cosmetic_id is null, unequip
    if (!cosmetic_id) {
      // For unequipping, we need to know which type to unequip
      const { cosmetic_type } = req.body;

      if (!cosmetic_type) {
        return res.status(400).json({
          success: false,
          error: 'Cosmetic type required for unequipping'
        });
      }

      const updateField = cosmetic_type === 'ring' ? 'equipped_ring_id' : 'equipped_banner_id';

      const { error: unequipError } = await supabase
        .from('profiles')
        .update({ [updateField]: null })
        .eq('wallet_address', wallet_address);

      if (unequipError) throw unequipError;

      return res.status(200).json({
        success: true,
        message: `${cosmetic_type} unequipped successfully`
      });
    }

    // Get cosmetic details
    const { data: cosmetic, error: cosmeticError } = await supabase
      .from('cosmetics_catalog')
      .select('*')
      .eq('id', cosmetic_id)
      .single();

    if (cosmeticError || !cosmetic) {
      return res.status(404).json({
        success: false,
        error: 'Cosmetic not found'
      });
    }

    // Check if user owns this cosmetic
    const { data: owned, error: ownedError } = await supabase
      .from('user_cosmetics')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('cosmetic_id', cosmetic_id)
      .single();

    if (ownedError || !owned) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this cosmetic'
      });
    }

    // Determine which field to update based on cosmetic type
    const updateField = cosmetic.cosmetic_type === 'ring' ? 'equipped_ring_id' : 'equipped_banner_id';

    // Equip the cosmetic
    const { error: equipError } = await supabase
      .from('profiles')
      .update({ [updateField]: cosmetic_id })
      .eq('wallet_address', wallet_address);

    if (equipError) throw equipError;

    return res.status(200).json({
      success: true,
      message: 'Cosmetic equipped successfully',
      cosmetic
    });

  } catch (error) {
    console.error('Error equipping cosmetic:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to equip cosmetic',
      details: error.message
    });
  }
}

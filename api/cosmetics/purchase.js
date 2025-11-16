// Purchase a cosmetic item with honey points
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

  if (!wallet_address || !cosmetic_id) {
    return res.status(400).json({
      success: false,
      error: 'Wallet address and cosmetic ID required'
    });
  }

  try {
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

    // Check if user already owns this cosmetic
    const { data: existing, error: existingError } = await supabase
      .from('user_cosmetics')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('cosmetic_id', cosmetic_id)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'You already own this cosmetic'
      });
    }

    // Get user's honey points
    const { data: points, error: pointsError } = await supabase
      .from('honey_points')
      .select('total_points')
      .eq('wallet_address', wallet_address)
      .single();

    if (pointsError && pointsError.code !== 'PGRST116') {
      throw pointsError;
    }

    const currentPoints = points?.total_points || 0;

    // Check if user has enough points
    if (currentPoints < cosmetic.honey_cost) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient honey points',
        required: cosmetic.honey_cost,
        available: currentPoints
      });
    }

    // Deduct points
    const newPoints = currentPoints - cosmetic.honey_cost;
    const { error: updateError } = await supabase
      .from('honey_points')
      .update({ total_points: newPoints })
      .eq('wallet_address', wallet_address);

    if (updateError) throw updateError;

    // Add cosmetic to user's inventory
    const { data: purchase, error: purchaseError } = await supabase
      .from('user_cosmetics')
      .insert({
        wallet_address,
        cosmetic_id
      })
      .select()
      .single();

    if (purchaseError) {
      // Rollback points if purchase fails
      await supabase
        .from('honey_points')
        .update({ total_points: currentPoints })
        .eq('wallet_address', wallet_address);

      throw purchaseError;
    }

    // Record transaction
    await supabase
      .from('cosmetics_transactions')
      .insert({
        wallet_address,
        cosmetic_id,
        honey_spent: cosmetic.honey_cost,
        transaction_type: 'purchase'
      });

    return res.status(200).json({
      success: true,
      message: 'Cosmetic purchased successfully',
      cosmetic,
      new_balance: newPoints,
      purchase
    });

  } catch (error) {
    console.error('Error purchasing cosmetic:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to purchase cosmetic',
      details: error.message
    });
  }
}

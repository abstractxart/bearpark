// Get user's cosmetics inventory
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet } = req.query;

  if (!wallet) {
    return res.status(400).json({ error: 'Wallet address required' });
  }

  try {
    // Get user's owned cosmetics with full item details
    const { data: inventory, error: inventoryError } = await supabase
      .from('user_cosmetics')
      .select(`
        *,
        cosmetic:cosmetics_catalog(*)
      `)
      .eq('wallet_address', wallet)
      .order('purchased_at', { ascending: false });

    if (inventoryError) throw inventoryError;

    // Get user's equipped cosmetics
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('equipped_ring_id, equipped_banner_id')
      .eq('wallet_address', wallet)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    return res.status(200).json({
      success: true,
      inventory: inventory || [],
      equipped: {
        ring_id: profile?.equipped_ring_id || null,
        banner_id: profile?.equipped_banner_id || null
      }
    });

  } catch (error) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory',
      details: error.message
    });
  }
}

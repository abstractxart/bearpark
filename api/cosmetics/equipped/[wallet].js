// Get user's equipped cosmetics with full details
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
    // Get user's profile with equipped cosmetics
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('equipped_ring_id, equipped_banner_id')
      .eq('wallet_address', wallet)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    let equippedRing = null;
    let equippedBanner = null;

    // Get ring details if equipped
    if (profile?.equipped_ring_id) {
      const { data: ring } = await supabase
        .from('cosmetics_catalog')
        .select('*')
        .eq('id', profile.equipped_ring_id)
        .single();

      equippedRing = ring;
    }

    // Get banner details if equipped
    if (profile?.equipped_banner_id) {
      const { data: banner } = await supabase
        .from('cosmetics_catalog')
        .select('*')
        .eq('id', profile.equipped_banner_id)
        .single();

      equippedBanner = banner;
    }

    return res.status(200).json({
      success: true,
      equipped: {
        ring: equippedRing,
        banner: equippedBanner
      }
    });

  } catch (error) {
    console.error('Error fetching equipped cosmetics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch equipped cosmetics',
      details: error.message
    });
  }
}

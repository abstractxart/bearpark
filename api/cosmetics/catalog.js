// Get all cosmetics catalog items
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

  try {
    console.log('📦 Fetching cosmetics catalog...');

    // Fetch all cosmetics from catalog
    const { data: items, error } = await supabase
      .from('cosmetics_catalog')
      .select('*')
      .order('rarity', { ascending: true })
      .order('honey_cost', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log(`✅ Found ${items?.length || 0} cosmetics in catalog`);

    return res.status(200).json({
      success: true,
      items: items || []
    });

  } catch (error) {
    console.error('Error fetching cosmetics catalog:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch cosmetics catalog',
      details: error.message
    });
  }
}

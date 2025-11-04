// Get points and activity for a specific wallet
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
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
    // Get user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', wallet)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      throw userError;
    }

    // If user doesn't exist, return zero points
    if (!user) {
      return res.status(200).json({
        wallet_address: wallet,
        total_points: 0,
        twitter_connected: false,
        recent_activity: []
      });
    }

    // Get recent activity
    const { data: activity, error: activityError } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false })
      .limit(10);

    if (activityError) {
      throw activityError;
    }

    return res.status(200).json({
      wallet_address: wallet,
      total_points: user.total_points || 0,
      twitter_connected: !!user.twitter_username,
      twitter_username: user.twitter_username,
      recent_activity: activity || []
    });

  } catch (error) {
    console.error('Error fetching points:', error);
    return res.status(500).json({
      error: 'Failed to fetch points',
      details: error.message
    });
  }
}

// Game leaderboard API - Get specific user's score (GET)
import { createClient } from '@supabase/supabase-js';

// Use service role key for server-side operations (bypasses RLS)
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
    const { gameId, wallet } = req.query;

    if (!gameId || !wallet) {
      return res.status(400).json({
        error: 'Missing game ID or wallet address'
      });
    }

    // Get user's score for this game with profile data
    const { data, error } = await supabase
      .from('game_leaderboards')
      .select(`
        *,
        profiles:wallet_address (
          display_name,
          twitter_username,
          avatar_nft
        )
      `)
      .eq('game_id', gameId)
      .eq('wallet_address', wallet)
      .single();

    if (error) {
      // If no score found, return null entry
      if (error.code === 'PGRST116') {
        return res.status(200).json({
          success: true,
          entry: null
        });
      }
      throw error;
    }

    const entry = {
      wallet_address: data.wallet_address,
      score: data.score,
      metadata: data.metadata,
      created_at: data.created_at,
      updated_at: data.updated_at,
      display_name: data.profiles?.display_name || null,
      twitter_username: data.profiles?.twitter_username || null,
      avatar_nft: data.profiles?.avatar_nft || null
    };

    return res.status(200).json({
      success: true,
      entry
    });

  } catch (error) {
    console.error('Error fetching user score:', error);
    return res.status(500).json({
      error: 'Failed to fetch user score',
      details: error.message
    });
  }
}

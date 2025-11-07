// Game leaderboard API - Get leaderboard or user score (GET)
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
    const { gameId } = req.query;
    const { limit = 10 } = req.query;

    if (!gameId || Array.isArray(gameId)) {
      return res.status(400).json({
        error: 'Invalid game ID'
      });
    }

    // Get top scores for this game with user profile data
    const { data: scores, error } = await supabase
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
      .order('score', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      throw error;
    }

    // Format leaderboard entries with user data
    const leaderboard = scores.map((entry, index) => ({
      rank: index + 1,
      wallet_address: entry.wallet_address,
      score: entry.score,
      metadata: entry.metadata,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      display_name: entry.profiles?.display_name || null,
      twitter_username: entry.profiles?.twitter_username || null,
      avatar_nft: entry.profiles?.avatar_nft || null
    }));

    return res.status(200).json({
      success: true,
      leaderboard
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({
      error: 'Failed to fetch leaderboard',
      details: error.message
    });
  }
}

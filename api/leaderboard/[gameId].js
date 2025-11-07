// Game leaderboard API - Handle both GET (fetch) and POST (submit)
import { createClient } from '@supabase/supabase-js';

// Use service role key for server-side operations (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Enable CORS for all methods
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { gameId } = req.query;

  if (!gameId || Array.isArray(gameId)) {
    return res.status(400).json({
      error: 'Invalid game ID'
    });
  }

  // Handle GET - Fetch leaderboard
  if (req.method === 'GET') {
    try {
      const { limit = 10 } = req.query;

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

  // Handle POST - Submit score
  if (req.method === 'POST') {
    try {
      const { wallet_address, score, metadata = {} } = req.body;

      if (!wallet_address || score === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: wallet_address, score'
        });
      }

      // Check if user already has a score for this game
      const { data: existingScore, error: fetchError } = await supabase
        .from('game_leaderboards')
        .select('*')
        .eq('wallet_address', wallet_address)
        .eq('game_id', gameId)
        .single();

      let is_high_score = false;
      let result;

      if (existingScore && !fetchError) {
        // Update only if new score is higher
        if (score > existingScore.score) {
          const { data, error } = await supabase
            .from('game_leaderboards')
            .update({
              score: score,
              metadata: metadata,
              updated_at: new Date().toISOString()
            })
            .eq('wallet_address', wallet_address)
            .eq('game_id', gameId)
            .select()
            .single();

          if (error) throw error;
          result = data;
          is_high_score = true;
        } else {
          result = existingScore;
          is_high_score = false;
        }
      } else {
        // Insert new score
        const { data, error } = await supabase
          .from('game_leaderboards')
          .insert({
            wallet_address,
            game_id: gameId,
            score,
            metadata
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
        is_high_score = true;
      }

      return res.status(200).json({
        success: true,
        is_high_score,
        entry: result
      });

    } catch (error) {
      console.error('Error submitting score:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit score',
        details: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

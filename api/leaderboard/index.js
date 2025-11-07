// Game leaderboard API - Submit scores (POST)
import { createClient } from '@supabase/supabase-js';

// Use service role key for server-side operations (bypasses RLS)
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

  try {
    const { wallet_address, game_id, score, metadata = {} } = req.body;

    if (!wallet_address || !game_id || score === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, game_id, score'
      });
    }

    // Check if user already has a score for this game
    const { data: existingScore, error: fetchError } = await supabase
      .from('game_leaderboards')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('game_id', game_id)
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
          .eq('game_id', game_id)
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
          game_id,
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

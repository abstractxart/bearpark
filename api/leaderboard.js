// Get leaderboard with top point earners
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

  const { limit = 100 } = req.query;

  try {
    // Get top users ordered by points
    const { data: users, error } = await supabase
      .from('users')
      .select('wallet_address, twitter_username, total_points')
      .order('total_points', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      throw error;
    }

    // Format leaderboard with rankings
    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      wallet_address: user.wallet_address,
      wallet_display: formatWallet(user.wallet_address),
      twitter_username: user.twitter_username,
      total_points: user.total_points || 0
    }));

    return res.status(200).json({
      success: true,
      leaderboard,
      total_users: users.length
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({
      error: 'Failed to fetch leaderboard',
      details: error.message
    });
  }
}

// Format wallet address: rU2A....3ZQ7Jy
function formatWallet(wallet) {
  if (!wallet || wallet.length < 8) return wallet;
  return `${wallet.substring(0, 4)}....${wallet.substring(wallet.length - 4)}`;
}

// Twitter OAuth 2.0 authentication
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Step 1: Generate OAuth URL (GET request)
  if (req.method === 'GET') {
    const { wallet_address } = req.query;

    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    try {
      // Store wallet in state parameter
      const state = Buffer.from(JSON.stringify({ wallet_address })).toString('base64');

      // Build OAuth URL
      const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('client_id', process.env.TWITTER_CLIENT_ID);
      authUrl.searchParams.append('redirect_uri', 'https://bearpark.xyz/twitter-callback.html');
      authUrl.searchParams.append('scope', 'tweet.read users.read offline.access');
      authUrl.searchParams.append('state', state);
      authUrl.searchParams.append('code_challenge', 'challenge');
      authUrl.searchParams.append('code_challenge_method', 'plain');

      return res.status(200).json({
        success: true,
        auth_url: authUrl.toString()
      });

    } catch (error) {
      console.error('Error generating auth URL:', error);
      return res.status(500).json({
        error: 'Failed to generate auth URL',
        details: error.message
      });
    }
  }

  // Step 2: Handle OAuth callback (POST request)
  if (req.method === 'POST') {
    const { code, state, wallet_address } = req.body;

    if (!code || !wallet_address) {
      return res.status(400).json({ error: 'Missing code or wallet_address' });
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
            `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
          ).toString('base64')
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: 'https://bearpark.xyz/twitter-callback.html',
          code_verifier: 'challenge'
        })
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`Twitter OAuth failed: ${JSON.stringify(errorData)}`);
      }

      const tokens = await tokenResponse.json();

      // Get Twitter user info
      const userResponse = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!userResponse.ok) {
        throw new Error('Failed to get Twitter user info');
      }

      const { data: twitterUser } = await userResponse.json();

      // Check for pending tweets from this Twitter user
      const { data: pendingTweets } = await supabase
        .from('pending_tweets')
        .select('*')
        .eq('twitter_user_id', twitterUser.id)
        .eq('claimed', false);

      // Calculate pending points
      const pendingPoints = pendingTweets
        ? pendingTweets.reduce((sum, tweet) => sum + (tweet.points_pending || 0), 0)
        : 0;

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('wallet_address', wallet_address)
        .single();

      // Calculate new total points
      const currentPoints = existingUser ? existingUser.total_points : 0;
      const newTotalPoints = currentPoints + pendingPoints;

      // Upsert user in database
      const { data: user, error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            wallet_address,
            twitter_username: twitterUser.username,
            twitter_user_id: twitterUser.id,
            twitter_access_token: tokens.access_token,
            twitter_refresh_token: tokens.refresh_token,
            total_points: newTotalPoints
          },
          { onConflict: 'wallet_address' }
        )
        .select()
        .single();

      if (upsertError) {
        throw upsertError;
      }

      // Mark pending tweets as claimed
      if (pendingTweets && pendingTweets.length > 0) {
        await supabase
          .from('pending_tweets')
          .update({ claimed: true, claimed_at: new Date().toISOString() })
          .eq('twitter_user_id', twitterUser.id);

        // Create point transactions for claimed tweets
        const transactions = pendingTweets.map(tweet => ({
          user_id: user.id,
          wallet_address,
          points_change: tweet.points_pending,
          transaction_type: tweet.is_raid ? 'raid' : 'tweet',
          reference_id: tweet.id,
          description: `Claimed: ${tweet.tweet_text?.substring(0, 50)}...`
        }));

        await supabase.from('point_transactions').insert(transactions);
      }

      return res.status(200).json({
        success: true,
        message: 'Twitter connected successfully',
        user: {
          wallet_address,
          twitter_username: twitterUser.username,
          total_points: user.total_points + pendingPoints,
          claimed_points: pendingPoints
        }
      });

    } catch (error) {
      console.error('Error connecting Twitter:', error);
      return res.status(500).json({
        error: 'Failed to connect Twitter',
        details: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

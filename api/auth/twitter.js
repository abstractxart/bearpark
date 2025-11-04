// Twitter OAuth 2.0 authentication
import { createClient } from '@supabase/supabase-js';

// Use service role key for server-side operations (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// Helper to parse body if needed
async function parseBody(req) {
  if (req.body) return req.body;

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
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
    // Parse body manually if needed
    const body = await parseBody(req);
    console.log('Parsed request body:', body);

    const { code, state, wallet_address } = body;

    if (!code || !wallet_address) {
      console.error('Missing parameters:', { hasCode: !!code, hasWallet: !!wallet_address });
      return res.status(400).json({ error: 'Missing code or wallet_address' });
    }

    try {
      console.log('Starting Twitter OAuth process for wallet:', wallet_address);

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

      console.log('Twitter token response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Twitter OAuth token error:', errorData);
        throw new Error(`Twitter OAuth failed: ${JSON.stringify(errorData)}`);
      }

      const tokens = await tokenResponse.json();
      console.log('Successfully received tokens');

      // Get Twitter user info
      const userResponse = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      console.log('Twitter user response status:', userResponse.status);

      if (!userResponse.ok) {
        const errorText = await userResponse.text();
        console.error('Twitter user fetch error:', errorText);
        console.error('Twitter user response headers:', Object.fromEntries(userResponse.headers.entries()));
        throw new Error(`Failed to get Twitter user info: ${userResponse.status} ${errorText}`);
      }

      const userJson = await userResponse.json();
      console.log('Twitter user response JSON:', userJson);

      const { data: twitterUser } = userJson;
      if (!twitterUser) {
        console.error('No user data in response:', userJson);
        throw new Error('Twitter API returned no user data');
      }

      console.log('Successfully fetched Twitter user:', twitterUser.username);

      // Check for pending tweets from this Twitter user
      const { data: pendingTweets, error: pendingError } = await supabase
        .from('pending_tweets')
        .select('*')
        .eq('twitter_user_id', twitterUser.id)
        .eq('claimed', false);

      if (pendingError) {
        console.error('Error fetching pending tweets:', pendingError);
      }

      // Calculate pending points
      const pendingPoints = pendingTweets
        ? pendingTweets.reduce((sum, tweet) => sum + (tweet.points_pending || 0), 0)
        : 0;

      console.log('Found pending points:', pendingPoints);

      // Check if user already exists (don't throw error if not found)
      const { data: existingUser, error: existingUserError } = await supabase
        .from('users')
        .select('*')
        .eq('wallet_address', wallet_address)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when user doesn't exist

      if (existingUserError) {
        console.error('Error fetching existing user:', existingUserError);
      }

      console.log('Existing user:', existingUser ? 'Found' : 'Not found');

      // Calculate new total points
      const currentPoints = existingUser ? (existingUser.total_points || 0) : 0;
      const newTotalPoints = currentPoints + pendingPoints;

      console.log('Updating user points:', { currentPoints, pendingPoints, newTotalPoints });

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
        console.error('Upsert error:', upsertError);
        throw upsertError;
      }

      console.log('User upserted successfully:', user.wallet_address);

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

      console.log('Twitter connection complete!');

      return res.status(200).json({
        success: true,
        message: 'Twitter connected successfully',
        user: {
          wallet_address,
          twitter_username: twitterUser.username,
          total_points: user.total_points, // Already includes pending points
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

  // Step 3: Handle disconnect (DELETE request)
  if (req.method === 'DELETE') {
    const body = await parseBody(req);
    const { wallet_address } = body;

    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    try {
      console.log('Disconnecting Twitter for wallet:', wallet_address);

      // Update user to remove Twitter connection (keep points!)
      const { data: user, error: updateError } = await supabase
        .from('users')
        .update({
          twitter_username: null,
          twitter_user_id: null,
          twitter_access_token: null,
          twitter_refresh_token: null
        })
        .eq('wallet_address', wallet_address)
        .select()
        .single();

      if (updateError) {
        console.error('Error disconnecting Twitter:', updateError);
        throw updateError;
      }

      console.log('Twitter disconnected successfully for:', wallet_address);

      return res.status(200).json({
        success: true,
        message: 'Twitter disconnected successfully. Your points are safely saved!',
        total_points: user.total_points
      });

    } catch (error) {
      console.error('Error disconnecting Twitter:', error);
      return res.status(500).json({
        error: 'Failed to disconnect Twitter',
        details: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

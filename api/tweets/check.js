// Check for new tweets mentioning @bearxrpl
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

  try {
    // Search for tweets mentioning @bearxrpl
    const searchUrl = new URL('https://api.twitter.com/2/tweets/search/recent');
    searchUrl.searchParams.append('query', '@bearxrpl -is:retweet');
    searchUrl.searchParams.append('max_results', '100');
    searchUrl.searchParams.append('tweet.fields', 'created_at,author_id');
    searchUrl.searchParams.append('expansions', 'author_id');
    searchUrl.searchParams.append('user.fields', 'username');

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Twitter API error: ${JSON.stringify(errorData)}`);
    }

    const twitterData = await response.json();

    if (!twitterData.data || twitterData.data.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No new tweets found',
        processed: 0
      });
    }

    const tweets = twitterData.data;
    const users = twitterData.includes?.users || [];

    let processedCount = 0;
    let newPoints = 0;

    for (const tweet of tweets) {
      // Check if tweet already processed
      const { data: existing } = await supabase
        .from('tweets')
        .select('id')
        .eq('tweet_id', tweet.id)
        .single();

      if (existing) {
        continue; // Skip already processed tweets
      }

      // Find tweet author
      const author = users.find(u => u.id === tweet.author_id);
      if (!author) continue;

      // Check if user is registered
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('twitter_user_id', author.id)
        .single();

      const points = 10; // Default points per tweet

      if (user) {
        // User is registered - award points immediately
        await supabase
          .from('tweets')
          .insert({
            tweet_id: tweet.id,
            user_id: user.id,
            wallet_address: user.wallet_address,
            twitter_username: author.username,
            tweet_text: tweet.text,
            tweet_url: `https://twitter.com/${author.username}/status/${tweet.id}`,
            points_awarded: points,
            is_raid: false,
            processed: true
          });

        // Update user's total points
        await supabase
          .from('users')
          .update({ total_points: user.total_points + points })
          .eq('id', user.id);

        // Create transaction record
        await supabase
          .from('point_transactions')
          .insert({
            user_id: user.id,
            wallet_address: user.wallet_address,
            points_change: points,
            transaction_type: 'tweet',
            description: `Tweet: ${tweet.text.substring(0, 50)}...`
          });

        processedCount++;
        newPoints += points;

      } else {
        // User not registered - save to pending_tweets
        await supabase
          .from('pending_tweets')
          .insert({
            tweet_id: tweet.id,
            twitter_username: author.username,
            twitter_user_id: author.id,
            tweet_text: tweet.text,
            tweet_url: `https://twitter.com/${author.username}/status/${tweet.id}`,
            points_pending: points,
            is_raid: false,
            claimed: false
          });

        processedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${processedCount} new tweets`,
      processed: processedCount,
      points_awarded: newPoints
    });

  } catch (error) {
    console.error('Error checking tweets:', error);
    return res.status(500).json({
      error: 'Failed to check tweets',
      details: error.message
    });
  }
}

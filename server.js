require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// XAMAN API Credentials from environment variables
const XAMAN_API_KEY = process.env.XAMAN_API_KEY;
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET;
const XAMAN_API_URL = 'https://xumm.app/api/v1/platform';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Validate required environment variables
if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
  console.error('❌ ERROR: XAMAN_API_KEY and XAMAN_API_SECRET must be set in environment variables');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  WARNING: SUPABASE_URL and SUPABASE_ANON_KEY not set. Profile and leaderboard features will not work.');
}

// Initialize Supabase client
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Middleware
app.use(cors({
  origin: [
    FRONTEND_URL,
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'https://www.bearpark.xyz',
    'https://bearpark.xyz',
    'https://flappy-bear-five.vercel.app',
    'https://bear-jumpventure1.vercel.app',
    'https://bear-jumpventure.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve static files from current directory
app.use(express.static(__dirname));

// Handle preflight OPTIONS requests for all routes
app.options('*', cors());

// Create XAMAN Payload
app.post('/api/xaman/payload', async (req, res) => {
  try {
    const response = await fetch(`${XAMAN_API_URL}/payload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': XAMAN_API_KEY,
        'X-API-Secret': XAMAN_API_SECRET
      },
      body: JSON.stringify({
        txjson: {
          TransactionType: 'SignIn'
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to create payload', details: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating payload:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Get Payload Status
app.get('/api/xaman/payload/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const response = await fetch(`${XAMAN_API_URL}/payload/${uuid}`, {
      headers: {
        'X-API-Key': XAMAN_API_KEY,
        'X-API-Secret': XAMAN_API_SECRET
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to get payload status', details: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error getting payload status:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ============================================
// PROFILE API ENDPOINTS
// ============================================

// Get user profile
app.get('/api/profile/:wallet_address', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address } = req.params;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    if (!data) {
      return res.json({ success: true, profile: null });
    }

    res.json({ success: true, profile: data });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
});

// Create or update user profile
app.post('/api/profile', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address, display_name, avatar_nft } = req.body;

    if (!wallet_address || !display_name) {
      return res.status(400).json({ error: 'wallet_address and display_name are required' });
    }

    // Upsert profile (insert or update if exists)
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        wallet_address,
        display_name,
        avatar_nft
      }, {
        onConflict: 'wallet_address'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ success: true, profile: data });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: 'Failed to save profile', details: error.message });
  }
});

// ============================================
// HONEY POINTS API ENDPOINTS
// ============================================

// Get user's honey points
app.get('/api/points/:wallet_address', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address } = req.params;

    const { data, error } = await supabase
      .from('honey_points')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    if (!data) {
      return res.json({ success: true, total_points: 0, raiding_points: 0, games_points: 0 });
    }

    res.json({
      success: true,
      total_points: data.total_points,
      raiding_points: data.raiding_points,
      games_points: data.games_points,
      updated_at: data.updated_at
    });
  } catch (error) {
    console.error('Error fetching points:', error);
    res.status(500).json({ error: 'Failed to fetch points', details: error.message });
  }
});

// Update/sync user's honey points
app.post('/api/points', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address, total_points, raiding_points, games_points } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Upsert points (insert or update if exists)
    const { data, error } = await supabase
      .from('honey_points')
      .upsert({
        wallet_address,
        total_points: total_points || 0,
        raiding_points: raiding_points || 0,
        games_points: games_points || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ success: true, points: data });
  } catch (error) {
    console.error('Error syncing points:', error);
    res.status(500).json({ error: 'Failed to sync points', details: error.message });
  }
});

// Complete a raid and award points
// SECURITY: Check if user already completed a raid
app.post('/api/raids/check-completion', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address, raid_id } = req.body;

    if (!wallet_address || !raid_id) {
      return res.status(400).json({ error: 'wallet_address and raid_id are required' });
    }

    // Check if already completed
    const { data, error } = await supabase
      .from('raid_completions')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('raid_id', raid_id)
      .maybeSingle();

    if (error) {
      console.error('Error checking raid completion:', error);
      // If table doesn't exist yet, assume not completed
      return res.json({ alreadyCompleted: false });
    }

    res.json({ alreadyCompleted: !!data });
  } catch (error) {
    console.error('Error checking raid completion:', error);
    // On error, be safe and say not completed (better UX than blocking)
    res.json({ alreadyCompleted: false });
  }
});

// SECURITY: Get all completed raids for a wallet
app.get('/api/raids/completed/:wallet_address', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address } = req.params;

    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Get all completed raids
    const { data, error } = await supabase
      .from('raid_completions')
      .select('raid_id, completed_at, points_awarded')
      .eq('wallet_address', wallet_address)
      .order('completed_at', { ascending: false });

    if (error) {
      console.error('Error fetching completed raids:', error);
      // If table doesn't exist yet, return empty array
      return res.json({ success: true, completedRaids: [] });
    }

    res.json({ success: true, completedRaids: data || [] });
  } catch (error) {
    console.error('Error fetching completed raids:', error);
    res.json({ success: true, completedRaids: [] });
  }
});

// SECURITY: Updated raid completion with duplicate protection
app.post('/api/raids/complete', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address, raid_id, points_awarded, completed_at } = req.body;

    if (!wallet_address || !raid_id) {
      return res.status(400).json({ error: 'wallet_address and raid_id are required' });
    }

    // CRITICAL: Check if already completed (prevent exploit)
    const { data: existingCompletion } = await supabase
      .from('raid_completions')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('raid_id', raid_id)
      .maybeSingle();

    if (existingCompletion) {
      console.log(`❌ EXPLOIT BLOCKED: User ${wallet_address} attempted to complete raid ${raid_id} twice!`);
      return res.json({
        success: true,
        alreadyCompleted: true,
        message: 'Raid already completed - no points awarded'
      });
    }

    const pointsToAdd = points_awarded || 20;

    // Record completion in raid_completions table
    const { error: completionError } = await supabase
      .from('raid_completions')
      .insert({
        wallet_address,
        raid_id,
        points_awarded: pointsToAdd,
        completed_at: completed_at || new Date().toISOString()
      });

    if (completionError) {
      // Check if it's a duplicate key error
      if (completionError.code === '23505') { // PostgreSQL unique violation
        console.log(`❌ EXPLOIT BLOCKED: Duplicate raid completion detected for ${wallet_address}, raid ${raid_id}`);
        return res.json({
          success: true,
          alreadyCompleted: true,
          message: 'Raid already completed - no points awarded'
        });
      }
      throw completionError;
    }

    // Get current points
    const { data: currentData } = await supabase
      .from('honey_points')
      .select('*')
      .eq('wallet_address', wallet_address)
      .maybeSingle();

    const currentTotal = currentData?.total_points || 0;
    const currentRaiding = currentData?.raiding_points || 0;

    // Update points
    const { data, error } = await supabase
      .from('honey_points')
      .upsert({
        wallet_address,
        total_points: currentTotal + pointsToAdd,
        raiding_points: currentRaiding + pointsToAdd,
        games_points: currentData?.games_points || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ Raid completed: User ${wallet_address} earned ${pointsToAdd} points for raid ${raid_id}`);

    res.json({
      success: true,
      alreadyCompleted: false,
      points: data,
      points_awarded: pointsToAdd
    });
  } catch (error) {
    console.error('Error completing raid:', error);
    res.status(500).json({ error: 'Failed to complete raid', details: error.message });
  }
});

// Get honey points leaderboard
app.get('/api/leaderboard', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const limit = parseInt(req.query.limit) || 15;
    const walletAddress = req.query.wallet;

    // Get leaderboard
    const { data, error } = await supabase
      .from('honey_points_leaderboard')
      .select('*')
      .limit(limit);

    if (error) {
      throw error;
    }

    // If wallet address provided, calculate their rank
    let userRank = null;
    if (walletAddress) {
      const { data: allData, error: rankError } = await supabase
        .from('honey_points')
        .select('wallet_address, total_points')
        .order('total_points', { ascending: false });

      if (!rankError && allData) {
        const userIndex = allData.findIndex(entry => entry.wallet_address === walletAddress);
        if (userIndex !== -1) {
          userRank = userIndex + 1;
        }
      }
    }

    res.json({ success: true, leaderboard: data || [], userRank });
  } catch (error) {
    console.error('Error fetching honey points leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// ============================================
// GAME LEADERBOARD API ENDPOINTS
// ============================================

// Get leaderboard for a specific game
app.get('/api/leaderboard/:game_id', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { game_id } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const { data, error } = await supabase
      .from('game_leaderboard_with_profiles')
      .select('*')
      .eq('game_id', game_id)
      .order('score', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    res.json({ success: true, leaderboard: data || [] });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// Submit or update score
app.post('/api/leaderboard', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { wallet_address, game_id, score, metadata } = req.body;

    if (!wallet_address || !game_id || score === undefined) {
      return res.status(400).json({ error: 'wallet_address, game_id, and score are required' });
    }

    // Check if existing score is higher
    const { data: existing } = await supabase
      .from('game_leaderboards')
      .select('score')
      .eq('wallet_address', wallet_address)
      .eq('game_id', game_id)
      .single();

    // Only update if new score is higher or no existing score
    if (!existing || score > existing.score) {
      const { data, error } = await supabase
        .from('game_leaderboards')
        .upsert({
          wallet_address,
          game_id,
          score,
          metadata: metadata || {}
        }, {
          onConflict: 'wallet_address,game_id'
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      res.json({ success: true, entry: data, is_high_score: true });
    } else {
      res.json({ success: true, is_high_score: false, message: 'Score not higher than existing' });
    }
  } catch (error) {
    console.error('Error submitting score:', error);
    res.status(500).json({ error: 'Failed to submit score', details: error.message });
  }
});

// Get user's score for a specific game
app.get('/api/leaderboard/:game_id/:wallet_address', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { game_id, wallet_address } = req.params;

    const { data, error } = await supabase
      .from('game_leaderboard_with_profiles')
      .select('*')
      .eq('game_id', game_id)
      .eq('wallet_address', wallet_address)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.json({ success: true, entry: data || null });
  } catch (error) {
    console.error('Error fetching user score:', error);
    res.status(500).json({ error: 'Failed to fetch user score', details: error.message });
  }
});

// ============================================
// RAIDS API ENDPOINTS
// ============================================

// Get current active raids
app.get('/api/raids/current', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { data, error } = await supabase
      .from('raids')
      .select('*')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ success: true, raids: data || [] });
  } catch (error) {
    console.error('Error fetching raids:', error);
    res.status(500).json({ error: 'Failed to fetch raids', details: error.message });
  }
});

// Create new raid
app.post('/api/raids', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { description, twitter_url, reward, profile_name, profile_handle, profile_emoji, expires_at } = req.body;

    if (!description || !twitter_url || !expires_at) {
      return res.status(400).json({ error: 'Missing required fields: description, twitter_url, expires_at' });
    }

    const { data, error } = await supabase
      .from('raids')
      .insert({
        description,
        twitter_url,
        reward: reward || 20,
        profile_name: profile_name || 'BearXRPL',
        profile_handle: profile_handle || '@BearXRPL',
        profile_emoji: profile_emoji || '🐻',
        expires_at,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ Created raid: ${description.substring(0, 50)}...`);
    res.json({ success: true, raid: data });
  } catch (error) {
    console.error('Error creating raid:', error);
    res.status(500).json({ error: 'Failed to create raid', details: error.message });
  }
});

// Delete raid
app.delete('/api/raids/:id', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('raids')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    console.log(`✅ Deleted raid ID: ${id}`);
    res.json({ success: true, message: 'Raid deleted' });
  } catch (error) {
    console.error('Error deleting raid:', error);
    res.status(500).json({ error: 'Failed to delete raid', details: error.message });
  }
});

// Clear all raids (admin only - be careful!)
app.post('/api/raids/clear', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { error } = await supabase
      .from('raids')
      .delete()
      .neq('id', 0); // Delete all rows

    if (error) {
      throw error;
    }

    console.log('⚠️  All raids cleared from database');
    res.json({ success: true, message: 'All raids cleared' });
  } catch (error) {
    console.error('Error clearing raids:', error);
    res.status(500).json({ error: 'Failed to clear raids', details: error.message });
  }
});

// ============================================
// TWITTER EMBED API
// ============================================

// Get Twitter embed data (oEmbed) - converts x.com to twitter.com
app.get('/api/twitter/oembed', async (req, res) => {
  try {
    let { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Convert x.com URLs to twitter.com for oEmbed API compatibility
    url = url.replace('https://x.com/', 'https://twitter.com/');

    // Fetch from Twitter's public oEmbed API
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      throw new Error('Failed to fetch Twitter embed');
    }

    const data = await response.json();
    res.json({ success: true, embed: data });
  } catch (error) {
    console.error('Error fetching Twitter embed:', error);
    res.status(500).json({ error: 'Failed to fetch Twitter embed', details: error.message });
  }
});

// Serve main.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'BEAR Park API server running',
    features: {
      xaman: !!XAMAN_API_KEY,
      database: !!supabase
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 BEAR Park API Server running on http://localhost:${PORT}`);
  console.log(`✅ XAMAN authentication: ${XAMAN_API_KEY ? 'ENABLED' : 'DISABLED'}`);
  console.log(`✅ Database (Supabase): ${supabase ? 'CONNECTED' : 'DISABLED'}`);
  console.log(`\n📍 API Endpoints:`);
  console.log(`   - GET  /health`);
  console.log(`   - POST /api/xaman/payload`);
  console.log(`   - GET  /api/xaman/payload/:uuid`);
  console.log(`   - GET  /api/profile/:wallet_address`);
  console.log(`   - POST /api/profile`);
  console.log(`   - GET  /api/leaderboard/:game_id`);
  console.log(`   - POST /api/leaderboard`);
  console.log(`   - GET  /api/leaderboard/:game_id/:wallet_address\n`);
});

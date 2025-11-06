require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
  origin: [FRONTEND_URL, 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json());

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

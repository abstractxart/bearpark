const path = require('path');
// Load .env only in local development (Vercel injects env vars directly)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { XummSdk } = require('xumm-sdk');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;

// XAMAN API Credentials from environment variables (trim any whitespace)
const XAMAN_API_KEY = process.env.XAMAN_API_KEY?.trim();
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET?.trim();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Debug: Log environment variable status
console.log('🔍 Environment Debug:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  XAMAN_API_KEY exists:', !!XAMAN_API_KEY);
console.log('  XAMAN_API_SECRET exists:', !!XAMAN_API_SECRET);
console.log('  SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
console.log('  DATABASE_URL exists:', !!process.env.DATABASE_URL);

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
console.log('✅ Supabase initialized:', process.env.SUPABASE_URL);

// Initialize Direct PostgreSQL Pool (for reactions to bypass PostgREST cache)
let pgPool;
try {
  if (process.env.DATABASE_URL) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
    console.log('✅ Direct PostgreSQL pool initialized');
  } else {
    console.warn('⚠️ DATABASE_URL not set - PostgreSQL pool not initialized');
  }
} catch (error) {
  console.error('❌ Failed to initialize PostgreSQL pool:', error.message);
}

// Configure web-push with VAPID keys for push notifications
try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@bearpark.xyz',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ Push notifications configured');
  } else {
    console.warn('⚠️ VAPID keys not set - Push notifications not configured');
  }
} catch (error) {
  console.error('❌ Failed to configure push notifications:', error.message);
}

// Initialize XAMAN SDK (with validation)
let xumm;
try {
  if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
    console.error('❌ WARNING: XAMAN_API_KEY and XAMAN_API_SECRET not found in environment');
    // Don't throw or exit - let the server start and handle errors in routes
  } else {
    console.log('Initializing XAMAN SDK...');
    console.log('API Key length:', XAMAN_API_KEY?.length);
    console.log('API Secret length:', XAMAN_API_SECRET?.length);
    console.log('API Key (first 10 chars):', XAMAN_API_KEY?.substring(0, 10));
    console.log('API Secret (first 10 chars):', XAMAN_API_SECRET?.substring(0, 10));
    xumm = new XummSdk(XAMAN_API_KEY, XAMAN_API_SECRET);
    console.log('✅ XAMAN SDK initialized successfully');
  }
} catch (error) {
  console.error('❌ Failed to initialize XAMAN SDK:', error.message);
}

// Middleware
// Enable gzip compression for all responses (80% file size reduction)
app.use(compression());

// Rate limiting to prevent API abuse and brute force attacks
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 300, // 300 requests per minute per IP (5 per second - allows normal use, blocks spam)
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

app.use(cors({
  origin: [FRONTEND_URL, 'https://bearpark.xyz', 'https://www.bearpark.xyz', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json());

// ===== SECURITY HEADERS =====
// Add security headers to ALL responses
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Force HTTPS (1 year)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy (disable unnecessary features)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
});

// ===== SECURITY: INPUT VALIDATION =====
// Validates XRPL wallet address format (prevents injection attacks)
const isValidXRPLWallet = (wallet) => {
  if (!wallet || typeof wallet !== 'string') return false;

  // XRPL wallet addresses:
  // - Start with 'r'
  // - 25-35 characters long
  // - Base58 encoded (alphanumeric excluding 0, O, I, l)
  const xrplRegex = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  return xrplRegex.test(wallet);
};

// Middleware to validate wallet addresses in requests
const validateWallet = (req, res, next) => {
  // Check all possible wallet field names
  const walletFields = [
    'wallet_address',
    'wallet',
    'admin_wallet',
    'profile_wallet',
    'commenter_wallet',
    'follower_wallet',
    'following_wallet'
  ];

  for (const field of walletFields) {
    const wallet = req.body[field] || req.params[field] || req.query[field];

    if (wallet && !isValidXRPLWallet(wallet)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ${field.replace('_', ' ')} format`
      });
    }
  }

  next();
};

// ===== SECURITY: AMOUNT VALIDATION =====
// Validates numeric amounts to prevent overflow, negative values, and economic exploits
const isValidAmount = (amount) => {
  if (amount === null || amount === undefined) return false;

  const num = parseFloat(amount);

  // Check for NaN, Infinity, negative, or zero
  if (isNaN(num) || !isFinite(num) || num < 0) return false;

  // Maximum safe amount: 1 billion (prevents overflow and economic exploits)
  const MAX_AMOUNT = 1000000000;
  if (num > MAX_AMOUNT) return false;

  // Check for excessive decimal places (max 2 decimal places for points/currency)
  const decimalPlaces = (num.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) return false;

  return true;
};

// Middleware to validate amounts in requests
const validateAmount = (req, res, next) => {
  const fieldsToValidate = [
    'amount',
    'points',
    'reward',
    'entry_fee',
    'score',
    'total_points',
    'raiding_points',
    'games_points',
    'points_awarded',
    'minutes_played'
  ];

  for (const field of fieldsToValidate) {
    if (req.body[field] !== undefined && !isValidAmount(req.body[field])) {
      return res.status(400).json({
        success: false,
        error: `Invalid ${field}: Must be a positive number ≤ 1,000,000,000 with max 2 decimal places`
      });
    }
  }

  next();
};

// ===== SECURITY: TEXT LENGTH VALIDATION =====
// Validates text field lengths to prevent DoS attacks via large payloads
const validateTextLengths = (req, res, next) => {
  const validations = [
    { field: 'description', max: 5000, name: 'Description' },
    { field: 'reason', max: 500, name: 'Reason' },
    { field: 'raid_name', max: 100, name: 'Raid name' },
    { field: 'display_name', max: 50, name: 'Display name' },
    { field: 'bio', max: 500, name: 'Bio' },
    { field: 'comment', max: 2000, name: 'Comment' },
    { field: 'comment_text', max: 2000, name: 'Comment' },
    { field: 'message', max: 1000, name: 'Message' }
  ];

  for (const { field, max, name } of validations) {
    const value = req.body[field];
    if (value !== undefined && value !== null) {
      if (typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          error: `${name} must be a string`
        });
      }
      if (value.length > max) {
        return res.status(400).json({
          success: false,
          error: `${name} exceeds maximum length of ${max} characters`
        });
      }
    }
  }

  next();
};

// ===== SECURITY: URL VALIDATION =====
// Validates Twitter/X URLs for raids to prevent SSRF and injection attacks
const isValidTwitterURL = (url) => {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsedUrl = new URL(url);
    const allowedHosts = ['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'];

    // Check hostname
    if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
      return false;
    }

    // Must use HTTPS
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }

    // Basic path validation (should contain /status/ for tweets)
    if (!parsedUrl.pathname.includes('/status/')) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

// Middleware to validate Twitter URLs
const validateTwitterURL = (req, res, next) => {
  const url = req.body.twitter_url;

  if (url && !isValidTwitterURL(url)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Twitter URL: Must be a valid HTTPS URL from twitter.com or x.com containing /status/'
    });
  }

  next();
};

// ===== SECURITY: ADMIN VERIFICATION MIDDLEWARE =====
// Verifies admin status server-side by checking admin_roles table
// NEVER trust client-provided admin_wallet or is_admin flags
const verifyAdmin = async (req, res, next) => {
  try {
    const admin_wallet = req.body.admin_wallet || req.query.admin_wallet || req.headers['x-admin-wallet'];

    if (!admin_wallet) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Admin wallet required'
      });
    }

    // Check database for actual admin role
    const { data: adminRole, error } = await supabase
      .from('admin_roles')
      .select('role, is_active')
      .eq('wallet_address', admin_wallet)
      .eq('is_active', true)
      .single();

    if (error || !adminRole) {
      console.warn(`🚫 Unauthorized admin access attempt by: ${admin_wallet}`);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have admin privileges'
      });
    }

    // Check role level (admin or master)
    if (adminRole.role !== 'admin' && adminRole.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient permissions'
      });
    }

    // Attach verified role to request for downstream use
    req.adminRole = adminRole.role;
    req.adminWallet = admin_wallet;
    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Admin verification failed'
    });
  }
};

// Serve static files from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Serve games
app.use('/bear-ninja', express.static(path.join(__dirname, '..', 'frontend', 'bear-ninja')));
app.use('/flappy-bear', express.static(path.join(__dirname, '..', 'frontend', 'flappy-bear')));
app.use('/bear-jumpventure', express.static(path.join(__dirname, '..', 'frontend', 'bear-jumpventure')));

// ===== XAMAN ENDPOINTS =====

// Create XAMAN Payload
app.post('/api/xaman/payload', async (req, res) => {
  try {
    console.log('Creating XAMAN payload...');
    const transaction = { TransactionType: 'SignIn' };
    const payload = await xumm.payload.create(transaction, true);
    console.log('Payload created:', payload);
    res.json(payload);
  } catch (error) {
    console.error('Error creating payload:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message, stack: error.stack });
  }
});

// Get Payload Status
app.get('/api/xaman/payload/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const payload = await xumm.payload.get(uuid);
    res.json(payload);
  } catch (error) {
    console.error('Error getting payload status:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ===== HONEY POINTS ENDPOINTS =====

// Get Honey Points Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 15;
    const wallet = req.query.wallet;

    // Query the view that joins honey_points with profiles
    const { data, error } = await supabase
      .from('honey_points_leaderboard')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const response = {
      success: true,
      leaderboard: data || []
    };

    // If wallet is provided, calculate their rank
    if (wallet) {
      const { data: allData, error: rankError } = await supabase
        .from('honey_points_leaderboard')
        .select('wallet_address, total_points')
        .order('total_points', { ascending: false });

      if (!rankError && allData) {
        const userIndex = allData.findIndex(entry => entry.wallet_address === wallet);
        if (userIndex !== -1) {
          response.userRank = userIndex + 1;
        }
      }
    }

    res.json(response);
  } catch (error) {
    console.error('Error in leaderboard endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Game Leaderboard by Game ID
app.get('/api/leaderboard/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    // Query the view that joins game_leaderboards with profiles
    // Don't apply limit yet for bear-pong since we need to calculate weighted scores first
    const { data, error } = await supabase
      .from('game_leaderboard_with_profiles')
      .select('*')
      .eq('game_id', gameId)
      .order('score', { ascending: false });

    if (error) {
      console.error(`Error fetching ${gameId} leaderboard:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }

    let leaderboard = data || [];

    // 🎯 BEAR PONG: Use weighted score ranking
    // Formula: (Win% × 1000) + (Total Wins × 5)
    // This balances skill (win rate) with dedication (total wins)
    if (gameId === 'bear-pong') {
      leaderboard = leaderboard.map(entry => {
        const wins = entry.metadata?.wins || entry.score || 0;
        const losses = entry.metadata?.losses || 0;
        const totalGames = wins + losses;
        const winRate = totalGames > 0 ? wins / totalGames : 0;

        // Calculate weighted score: win% is heavily weighted, total wins add bonus points
        const weightedScore = Math.round((winRate * 1000) + (wins * 5));

        return {
          ...entry,
          weighted_score: weightedScore,
          wins: wins,
          losses: losses,
          win_rate: winRate
        };
      });

      // Sort by weighted score (highest first)
      leaderboard.sort((a, b) => b.weighted_score - a.weighted_score);

      // Re-calculate ranks based on weighted score
      leaderboard = leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
    }

    // Apply limit after sorting
    leaderboard = leaderboard.slice(0, limit);

    res.json({
      success: true,
      leaderboard: leaderboard
    });
  } catch (error) {
    console.error(`Error in ${req.params.gameId} leaderboard endpoint:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Individual Player Stats for a Game
app.get('/api/leaderboard/:gameId/:walletAddress', async (req, res) => {
  try {
    const { gameId, walletAddress } = req.params;

    // Fetch player's stats from database
    const { data, error } = await supabase
      .from('game_leaderboard_with_profiles')
      .select('*')
      .eq('game_id', gameId)
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error(`Error fetching stats for ${walletAddress} in ${gameId}:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }

    if (!data) {
      // Player has no stats for this game yet
      return res.json({
        success: true,
        entry: null
      });
    }

    // For bear-pong, add weighted score
    if (gameId === 'bear-pong' && data.metadata) {
      const wins = data.metadata.wins || data.score || 0;
      const losses = data.metadata.losses || 0;
      const totalGames = wins + losses;
      const winRate = totalGames > 0 ? wins / totalGames : 0;
      const weightedScore = Math.round((winRate * 1000) + (wins * 5));

      data.weighted_score = weightedScore;
      data.wins = wins;
      data.losses = losses;
      data.win_rate = winRate;
    }

    res.json({
      success: true,
      entry: data
    });
  } catch (error) {
    console.error(`Error in /api/leaderboard/:gameId/:walletAddress:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit Game Score to Leaderboard
app.post('/api/leaderboard', validateWallet, validateAmount, async (req, res) => {
  try {
    const { wallet_address, game_id, score, metadata } = req.body;

    // Validate required fields
    if (!wallet_address || !game_id || score === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, game_id, score'
      });
    }

    console.log(`📝 Submitting score for ${game_id}: ${score} (wallet: ${wallet_address})`);

    // Check if user already has a score for this game
    const { data: existingScore, error: fetchError } = await supabase
      .from('game_leaderboards')
      .select('score')
      .eq('wallet_address', wallet_address)
      .eq('game_id', game_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching existing score:', fetchError);
      return res.status(500).json({ success: false, error: fetchError.message });
    }

    let is_high_score = false;
    let result;

    if (existingScore) {
      // User has existing score - only update if new score is higher
      if (score > existingScore.score) {
        console.log(`🎉 New high score! Old: ${existingScore.score}, New: ${score}`);
        is_high_score = true;

        const { data, error: updateError } = await supabase
          .from('game_leaderboards')
          .update({
            score: score,
            metadata: metadata || {},
            updated_at: new Date().toISOString()
          })
          .eq('wallet_address', wallet_address)
          .eq('game_id', game_id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating score:', updateError);
          return res.status(500).json({ success: false, error: updateError.message });
        }

        result = data;
      } else {
        console.log(`Score ${score} not higher than existing ${existingScore.score}`);
        result = existingScore;
      }
    } else {
      // No existing score - insert new one
      console.log(`✨ First score submission for this game`);
      is_high_score = true;

      const { data, error: insertError } = await supabase
        .from('game_leaderboards')
        .insert({
          wallet_address: wallet_address,
          game_id: game_id,
          score: score,
          metadata: metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting score:', insertError);
        return res.status(500).json({ success: false, error: insertError.message });
      }

      result = data;
    }

    // Get user's rank
    const { data: leaderboard, error: rankError } = await supabase
      .from('game_leaderboards')
      .select('wallet_address, score')
      .eq('game_id', game_id)
      .order('score', { ascending: false });

    let rank = null;
    if (!rankError && leaderboard) {
      const userIndex = leaderboard.findIndex(entry => entry.wallet_address === wallet_address);
      if (userIndex !== -1) {
        rank = userIndex + 1;
      }
    }

    res.json({
      success: true,
      is_high_score: is_high_score,
      score: score,
      rank: rank,
      entry: result
    });

  } catch (error) {
    console.error('Error in POST /api/leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get User Points
app.get('/api/points/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    const { data, error } = await supabase
      .from('honey_points')
      .select('*')
      .eq('wallet_address', wallet)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching points:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      total_points: data?.total_points || 0,
      raiding_points: data?.raiding_points || 0,
      games_points: data?.games_points || 0
    });
  } catch (error) {
    console.error('Error in points endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update/sync user's honey points (for games to award HONEY)
app.post('/api/points', validateWallet, validateAmount, async (req, res) => {
  try {
    const { wallet_address, total_points, raiding_points, games_points } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ success: false, error: 'wallet_address is required' });
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
    res.status(500).json({ success: false, error: 'Failed to sync points', details: error.message });
  }
});

// Create New Raid
app.post('/api/raids', verifyAdmin, validateTwitterURL, validateAmount, validateTextLengths, async (req, res) => {
  try {
    const { description, twitter_url, reward, profile_name, profile_handle, profile_emoji, expires_at } = req.body;

    console.log('Received raid data:', req.body);

    if (!description || !twitter_url || !reward || !profile_handle || !expires_at) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: description, twitter_url, reward, profile_handle, expires_at'
      });
    }

    const now = new Date();

    // Insert new raid - matching actual database schema
    const { data, error } = await supabase
      .from('raids')
      .insert([{
        description: description,
        twitter_url: twitter_url,
        reward: reward,
        profile_name: profile_name || 'BearXRPL',
        profile_handle: profile_handle,
        profile_emoji: profile_emoji || '🐻',
        expires_at: expires_at,
        is_active: true
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating raid:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ Raid created successfully:', data);
    res.json({ success: true, raid: data });
  } catch (error) {
    console.error('Error in create raid endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Current Active Raids
app.get('/api/raids/current', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('raids')
      .select('*')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching raids:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, raids: data || [] });
  } catch (error) {
    console.error('Error in get raids endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get All Raids (for admin)
app.get('/api/raids/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('raids')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all raids:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, raids: data || [] });
  } catch (error) {
    console.error('Error in get all raids endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Raid (for admin)
app.delete('/api/raids/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('raids')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting raid:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Raid ${id} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in delete raid endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record Raid Completion and Award Points
// SECURITY: Check if user already completed a raid (before starting countdown)
app.post('/api/raids/check-completion', validateWallet, async (req, res) => {
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
app.post('/api/raids/complete', validateWallet, validateAmount, async (req, res) => {
  try {
    const { wallet_address, raid_id, completed_at, points_awarded } = req.body;

    if (!wallet_address || !raid_id || !points_awarded) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, raid_id, points_awarded'
      });
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

    // Record completion in raid_completions table
    const { error: completionError } = await supabase
      .from('raid_completions')
      .insert({
        wallet_address,
        raid_id,
        points_awarded,
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

    // Check if points record exists for this wallet
    const { data: existingPoints } = await supabase
      .from('honey_points')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    if (existingPoints) {
      // Update existing record
      const { error } = await supabase
        .from('honey_points')
        .update({
          total_points: existingPoints.total_points + points_awarded,
          raiding_points: existingPoints.raiding_points + points_awarded,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_address', wallet_address);

      if (error) throw error;
    } else {
      // Create new record
      const { error } = await supabase
        .from('honey_points')
        .insert({
          wallet_address,
          total_points: points_awarded,
          raiding_points: points_awarded,
          games_points: 0
        });

      if (error) throw error;
    }

    console.log(`✅ Raid completed: User ${wallet_address} earned ${points_awarded} points for raid ${raid_id}`);
    res.json({
      success: true,
      alreadyCompleted: false,
      message: 'Points awarded successfully',
      points_awarded
    });

  } catch (error) {
    console.error('Error recording raid completion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Award Game Points with Daily Limit (Time-Based System)
// Uses atomic database function to prevent race condition exploits
app.post('/api/games/complete', validateWallet, async (req, res) => {
  try {
    const { wallet_address, game_id, minutes_played } = req.body;

    if (!wallet_address || !game_id || minutes_played === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, game_id, minutes_played'
      });
    }

    const MAX_DAILY_MINUTES = 20; // 20 minutes per day max
    const MIN_SESSION_SECONDS = 10; // Minimum 10 seconds to count
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Convert to 1 decimal place (0.1 minute precision)
    const minutesPlayedRounded = Math.round(minutes_played * 10) / 10;

    // Reject sessions less than 10 seconds
    if (minutesPlayedRounded < (MIN_SESSION_SECONDS / 60)) {
      return res.json({
        success: false,
        message: 'Session too short (minimum 10 seconds)',
        minutes_today: 0,
        max_minutes: MAX_DAILY_MINUTES,
        points_awarded: 0
      });
    }

    console.log(`🎮 Game session: ${game_id} for ${wallet_address} - ${minutesPlayedRounded} mins`);

    // Call atomic PostgreSQL function to prevent race conditions
    const { data, error } = await supabase.rpc('atomic_time_play', {
      p_wallet: wallet_address,
      p_game: game_id,
      p_date: today,
      p_max_minutes: MAX_DAILY_MINUTES,
      p_minutes_played: minutesPlayedRounded
    });

    if (error) {
      console.error('Database function error:', error);
      throw error;
    }

    const result = data;

    if (result.success) {
      console.log(`✅ Awarded ${result.points_awarded} pts to ${wallet_address} (${result.minutes_today}/${MAX_DAILY_MINUTES} mins today)`);

      res.json({
        success: true,
        message: result.message,
        points_awarded: result.points_awarded,
        minutes_today: result.minutes_today,
        max_minutes: result.max_minutes,
        remaining_minutes: Math.max(0, result.max_minutes - result.minutes_today),
        total_points: result.new_total_points,
        minutes_played: result.minutes_played
      });
    } else {
      console.log(`⛔ Daily limit reached for ${wallet_address}`);

      res.json({
        success: false,
        message: result.message,
        minutes_today: result.minutes_today,
        max_minutes: result.max_minutes,
        points_awarded: 0
      });
    }

  } catch (error) {
    console.error('Error awarding game points:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Daily Game Status (Time-Based)
app.get('/api/games/daily-status/:wallet/:game_id', async (req, res) => {
  try {
    const { wallet, game_id } = req.params;
    const today = new Date().toISOString().split('T')[0];

    // Special case: "all-games" sums up ALL games for this wallet today
    if (game_id === 'all-games') {
      const { data, error } = await supabase
        .from('daily_game_plays')
        .select('*')
        .eq('wallet_address', wallet)
        .eq('play_date', today);

      if (error) {
        console.error('Error fetching all games status:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      const MAX_DAILY_MINUTES = 20;
      const totalMinutes = data?.reduce((sum, record) => sum + (record.minutes_played || 0), 0) || 0;
      const totalPoints = data?.reduce((sum, record) => sum + (record.points_earned || 0), 0) || 0;

      return res.json({
        success: true,
        minutes_today: Math.round(totalMinutes * 10) / 10,
        max_minutes: MAX_DAILY_MINUTES,
        remaining_minutes: Math.max(0, MAX_DAILY_MINUTES - totalMinutes),
        can_earn_points: totalMinutes < MAX_DAILY_MINUTES,
        points_earned_today: Math.round(totalPoints * 10) / 10
      });
    }

    // Single game status
    const { data } = await supabase
      .from('daily_game_plays')
      .select('*')
      .eq('wallet_address', wallet)
      .eq('game_id', game_id)
      .eq('play_date', today)
      .single();

    const MAX_DAILY_MINUTES = 20;
    const minutesToday = data?.minutes_played || 0;

    res.json({
      success: true,
      minutes_today: Math.round(minutesToday * 10) / 10,
      max_minutes: MAX_DAILY_MINUTES,
      remaining_minutes: Math.max(0, MAX_DAILY_MINUTES - minutesToday),
      can_earn_points: minutesToday < MAX_DAILY_MINUTES,
      points_earned_today: Math.round((data?.points_earned || 0) * 10) / 10
    });

  } catch (error) {
    console.error('Error fetching daily game status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset Daily Games (for testing/midnight reset)
app.post('/api/games/reset-daily/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const today = new Date().toISOString().split('T')[0];

    // Delete today's game plays
    const { error } = await supabase
      .from('daily_game_plays')
      .delete()
      .eq('wallet_address', wallet)
      .eq('play_date', today);

    if (error) {
      console.error('Error resetting daily games:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Reset daily games for wallet: ${wallet}`);

    res.json({
      success: true,
      message: 'Daily games reset successfully',
      wallet: wallet,
      date: today
    });

  } catch (error) {
    console.error('Error in reset-daily endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== PROFILE ENDPOINTS =====

// Get User Profile
// Get All Users (for BEAR Search)
app.get('/api/users', async (req, res) => {
  try {
    let users = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          'SELECT wallet_address, display_name, avatar_nft, created_at FROM profiles ORDER BY display_name ASC'
        );
        users = result.rows || [];
        console.log(`✅ [pgPool] Fetched ${users.length} users from profiles table`);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase
      const { data, error } = await supabase
        .from('profiles')
        .select('wallet_address, display_name, avatar_nft, created_at')
        .order('display_name', { ascending: true });

      if (error) {
        console.error('❌ Supabase error:', error);
        throw error;
      }

      users = data || [];
      console.log(`✅ [Supabase] Fetched ${users.length} users from profiles table`);
    }

    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', wallet)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching profile:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // If no profile found, return null
    if (!data) {
      return res.json({ success: true, profile: null });
    }

    // Fetch honey points for this wallet
    const { data: honeyData } = await supabase
      .from('honey_points')
      .select('total_points, raiding_points, games_points')
      .eq('wallet_address', wallet)
      .single();

    // Merge honey data into profile response
    const profileWithHoney = {
      ...data,
      honey: honeyData?.total_points || 0,
      honey_raiding: honeyData?.raiding_points || 0,
      honey_games: honeyData?.games_points || 0
    };

    res.json({
      success: true,
      profile: profileWithHoney
    });
  } catch (error) {
    console.error('Error in profile endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save/Update User Profile
app.post('/api/profile', validateWallet, validateTextLengths, async (req, res) => {
  try {
    const { wallet_address, display_name, avatar_nft } = req.body;

    if (!wallet_address || !display_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, display_name'
      });
    }

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    if (existingProfile) {
      // Update existing profile
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: display_name,
          avatar_nft: avatar_nft,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_address', wallet_address);

      if (error) throw error;
      console.log(`✅ Updated profile for ${wallet_address}: ${display_name}`);
    } else {
      // Create new profile
      const { error } = await supabase
        .from('profiles')
        .insert({
          wallet_address: wallet_address,
          display_name: display_name,
          avatar_nft: avatar_nft
        });

      if (error) throw error;
      console.log(`✅ Created profile for ${wallet_address}: ${display_name}`);
    }

    res.json({
      success: true,
      message: 'Profile saved successfully'
    });

  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Bio
app.post('/api/profile/bio', validateWallet, validateTextLengths, async (req, res) => {
  try {
    const { wallet_address, bio } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ success: false, error: 'wallet_address required' });
    }

    // Check if profile exists, create if not
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    if (existingProfile) {
      // Update bio
      const { error } = await supabase
        .from('profiles')
        .update({ bio: bio, updated_at: new Date().toISOString() })
        .eq('wallet_address', wallet_address);

      if (error) throw error;
    } else {
      // Create profile with bio
      const { error } = await supabase
        .from('profiles')
        .insert({ wallet_address, bio });

      if (error) throw error;
    }

    res.json({ success: true, message: 'Bio updated successfully' });
  } catch (error) {
    console.error('Error updating bio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== COMMENTS ENDPOINTS =====

// Get Comments for a Profile
app.get('/api/comments/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    let comments = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          'SELECT * FROM profile_comments WHERE profile_wallet = $1 ORDER BY created_at DESC',
          [wallet]
        );
        comments = result.rows || [];
        console.log(`✅ [pgPool] Fetched ${comments.length} comments for ${wallet}`);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      const { data, error } = await supabase
        .from('profile_comments')
        .select('*')
        .eq('profile_wallet', wallet)
        .order('created_at', { ascending: false });

      if (error) throw error;
      comments = data || [];
      console.log(`✅ [Supabase] Fetched ${comments.length} comments for ${wallet}`);
    }

    res.json({ success: true, comments: comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Post a Comment
app.post('/api/comments', validateWallet, validateTextLengths, async (req, res) => {
  try {
    const { profile_wallet, commenter_wallet, comment_text, commenter_name, commenter_avatar, parent_id } = req.body;

    if (!profile_wallet || !commenter_wallet || !comment_text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const { data, error } = await supabase
      .from('profile_comments')
      .insert({
        profile_wallet,
        commenter_wallet,
        comment_text,
        commenter_name,
        commenter_avatar,
        parent_id: parent_id || null
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, comment: data });
  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a Comment
app.delete('/api/comments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { wallet_address } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ success: false, error: 'wallet_address required' });
    }

    // Check if user is actually an admin (server-side verification)
    let is_admin = false;
    try {
      const { data: adminRole } = await supabase
        .from('admin_roles')
        .select('role, is_active')
        .eq('wallet_address', wallet_address)
        .eq('is_active', true)
        .single();

      is_admin = adminRole && (adminRole.role === 'admin' || adminRole.role === 'master');
    } catch (adminCheckError) {
      // Not an admin - continue with normal authorization check
      is_admin = false;
    }

    let comment;

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        // Get the comment to check ownership using direct SQL
        const commentResult = await pgPool.query(
          'SELECT * FROM profile_comments WHERE id = $1',
          [id]
        );

        if (commentResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Comment not found' });
        }

        comment = commentResult.rows[0];
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase
      const { data, error } = await supabase
        .from('profile_comments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      comment = data;
    }

    // Check permissions: admin, profile owner, or comment author
    const canDelete = is_admin ||
                     comment.profile_wallet === wallet_address ||
                     comment.commenter_wallet === wallet_address;

    if (!canDelete) {
      return res.status(403).json({ success: false, error: 'Permission denied' });
    }

    // Delete the comment (CASCADE will delete reactions and child comments)
    try {
      if (pgPool) {
        await pgPool.query(
          'DELETE FROM profile_comments WHERE id = $1',
          [id]
        );
        console.log(`✅ [pgPool] Comment ${id} deleted successfully`);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase
      const { error: deleteError } = await supabase
        .from('profile_comments')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      console.log(`✅ [Supabase] Comment ${id} deleted successfully`);
    }

    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== COMMENT REACTIONS ENDPOINTS =====

// Toggle Reaction on a Comment (using direct PostgreSQL to bypass cache)
app.post('/api/comments/:id/react', async (req, res) => {
  try {
    const { id } = req.params;
    const { wallet_address, reaction_type } = req.body;

    if (!wallet_address || !reaction_type) {
      return res.status(400).json({
        success: false,
        error: 'wallet_address and reaction_type required'
      });
    }

    // Validate reaction type
    const validReactions = ['like', 'laugh', 'heart', 'cry', 'thumbs_down', 'troll'];
    if (!validReactions.includes(reaction_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reaction type'
      });
    }

    // Convert id to integer for Supabase
    const commentId = parseInt(id);

    console.log(`🔵 Checking reaction: comment_id=${commentId}, wallet=${wallet_address}, type=${reaction_type}`);

    // Use Supabase instead of pgPool (works better with Railway)
    const { data: existing, error: checkError } = await supabase
      .from('comment_reactions')
      .select('id')
      .eq('comment_id', commentId)
      .eq('wallet_address', wallet_address)
      .eq('reaction_type', reaction_type)
      .maybeSingle();

    console.log(`🔵 Existing reaction found:`, existing);

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existing) {
      // Remove reaction by ID
      console.log(`❌ Removing reaction for comment ${commentId}, reaction ID: ${existing.id}`);

      let deletedCount = 0;

      // Try direct PostgreSQL first (bypasses RLS), fall back to Supabase if it fails
      try {
        if (pgPool) {
          const deleteResult = await pgPool.query(
            'DELETE FROM comment_reactions WHERE id = $1 RETURNING *',
            [existing.id]
          );
          deletedCount = deleteResult.rowCount;
          console.log(`✅ [pgPool] Reaction removed successfully, deleted ${deletedCount} row(s)`);
        } else {
          throw new Error('pgPool not available');
        }
      } catch (pgError) {
        console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

        // Fallback to Supabase with .select() to verify deletion
        const { data: deletedData, error: deleteError } = await supabase
          .from('comment_reactions')
          .delete()
          .eq('id', existing.id)
          .select();

        if (deleteError) {
          console.error(`❌ Supabase delete error:`, deleteError);
          throw deleteError;
        }

        deletedCount = deletedData?.length || 0;
        console.log(`✅ [Supabase] Reaction removed successfully, deleted ${deletedCount} row(s)`);
      }

      if (deletedCount === 0) {
        console.error(`❌ WARNING: Delete returned 0 rows - reaction may not have been deleted!`);
      }

      console.log(`🔍 Fetching updated reactions for comment ${commentId}...`);
      // Fetch updated reactions to return fresh counts
      const { data: updatedReactions, error: fetchError } = await supabase
        .from('comment_reactions')
        .select('*')
        .eq('comment_id', commentId);

      if (fetchError) {
        console.error(`❌ Error fetching updated reactions:`, fetchError);
      } else {
        console.log(`📊 Found ${updatedReactions?.length || 0} reactions after removal`);
      }

      // Group reactions by type with counts
      const reactionCounts = {};
      const userReactions = {};

      (updatedReactions || []).forEach(reaction => {
        const type = reaction.reaction_type;
        if (!reactionCounts[type]) {
          reactionCounts[type] = 0;
        }
        reactionCounts[type]++;

        if (!userReactions[reaction.wallet_address]) {
          userReactions[reaction.wallet_address] = [];
        }
        userReactions[reaction.wallet_address].push(type);
      });

      console.log(`📤 Sending response with counts:`, reactionCounts);
      console.log(`📤 Sending response with userReactions:`, userReactions);

      res.json({
        success: true,
        action: 'removed',
        counts: reactionCounts,
        userReactions: userReactions
      });
    } else {
      // Add reaction
      console.log(`➕ Adding reaction for comment ${commentId}`);
      const { error: insertError } = await supabase
        .from('comment_reactions')
        .insert({
          comment_id: commentId,
          wallet_address,
          reaction_type
        });

      if (insertError) {
        console.error(`❌ Insert error:`, insertError);
        throw insertError;
      }

      console.log(`✅ Reaction added successfully`);

      // Get comment author for notification (non-blocking - don't fail request if this fails)
      try {
        const { data: commentData } = await supabase
          .from('profile_comments')
          .select('commenter_wallet, profile_wallet, comment_text')
          .eq('id', commentId)
          .single();

        if (commentData && commentData.commenter_wallet !== wallet_address) {
          // Get reactor's display name and avatar
          const { data: reactorProfile } = await supabase
            .from('profiles')
            .select('display_name, avatar_nft')
            .eq('wallet_address', wallet_address)
            .maybeSingle();

          const reactorDisplayName = reactorProfile?.display_name || null;
          const reactorAvatar = reactorProfile?.avatar_nft || null;

          // Get all current reactions for notification
          const { data: allReactions } = await supabase
            .from('comment_reactions')
            .select('reaction_type')
            .eq('comment_id', commentId)
            .eq('wallet_address', wallet_address);

          const reactions = (allReactions || []).map(r => {
            const emojiMap = {
              'like': '👍',
              'laugh': '😂',
              'heart': '❤️',
              'cry': '😢',
              'thumbs_down': '👎',
              'troll': '🤡'
            };
            return emojiMap[r.reaction_type] || r.reaction_type;
          });

          // Send notification to comment author
          addNotification(commentData.commenter_wallet, 'reaction', {
            wallet: wallet_address,
            displayName: reactorDisplayName,
            avatarNft: reactorAvatar,
            reactions,
            commentText: commentData.comment_text?.substring(0, 100),
            commentId: commentId.toString(),
            profileWallet: commentData.profile_wallet
          });
        }
      } catch (notifError) {
        console.warn('⚠️ Failed to send notification (non-critical):', notifError.message);
      }

      console.log(`🔍 Fetching updated reactions for comment ${commentId}...`);
      // Fetch updated reactions to return fresh counts
      const { data: updatedReactions, error: fetchError } = await supabase
        .from('comment_reactions')
        .select('*')
        .eq('comment_id', commentId);

      if (fetchError) {
        console.error(`❌ Error fetching updated reactions:`, fetchError);
      } else {
        console.log(`📊 Found ${updatedReactions?.length || 0} reactions after addition`);
      }

      // Group reactions by type with counts
      const reactionCounts = {};
      const userReactions = {};

      (updatedReactions || []).forEach(reaction => {
        const type = reaction.reaction_type;
        if (!reactionCounts[type]) {
          reactionCounts[type] = 0;
        }
        reactionCounts[type]++;

        if (!userReactions[reaction.wallet_address]) {
          userReactions[reaction.wallet_address] = [];
        }
        userReactions[reaction.wallet_address].push(type);
      });

      console.log(`📤 Sending response with counts:`, reactionCounts);
      console.log(`📤 Sending response with userReactions:`, userReactions);

      res.json({
        success: true,
        action: 'added',
        counts: reactionCounts,
        userReactions: userReactions
      });
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Reactions for a Comment (using Supabase)
app.get('/api/comments/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;
    const commentId = parseInt(id);

    const { data, error } = await supabase
      .from('comment_reactions')
      .select('*')
      .eq('comment_id', commentId);

    if (error) throw error;

    // Group reactions by type with counts
    const reactionCounts = {};
    const userReactions = {};

    (data || []).forEach(reaction => {
      const type = reaction.reaction_type;
      if (!reactionCounts[type]) {
        reactionCounts[type] = 0;
      }
      reactionCounts[type]++;

      if (!userReactions[reaction.wallet_address]) {
        userReactions[reaction.wallet_address] = [];
      }
      userReactions[reaction.wallet_address].push(type);
    });

    res.json({
      success: true,
      reactions: data || [],
      counts: reactionCounts,
      userReactions: userReactions
    });
  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// FOLLOW SYSTEM ENDPOINTS
// ============================================

// Toggle Follow/Unfollow
app.post('/api/follow', validateWallet, async (req, res) => {
  try {
    const { follower_wallet, following_wallet } = req.body;

    if (!follower_wallet || !following_wallet) {
      return res.status(400).json({
        success: false,
        error: 'follower_wallet and following_wallet required'
      });
    }

    // Prevent self-follows
    if (follower_wallet === following_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Cannot follow yourself'
      });
    }

    let action;

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        // Check if already following using direct SQL
        const checkResult = await pgPool.query(
          'SELECT id FROM follows WHERE follower_wallet = $1 AND following_wallet = $2',
          [follower_wallet, following_wallet]
        );

        if (checkResult.rows.length > 0) {
          // Unfollow
          console.log(`🔵 [Follow] BEFORE DELETE: Found existing follow row for ${follower_wallet} -> ${following_wallet}`);
          const deleteResult = await pgPool.query(
            'DELETE FROM follows WHERE follower_wallet = $1 AND following_wallet = $2 RETURNING *',
            [follower_wallet, following_wallet]
          );
          console.log(`🔵 [Follow] DELETE EXECUTED: Deleted ${deleteResult.rowCount} row(s)`, deleteResult.rows);

          // VERIFY THE DELETE WORKED - check immediately after
          const verifyResult = await pgPool.query(
            'SELECT * FROM follows WHERE follower_wallet = $1 AND following_wallet = $2',
            [follower_wallet, following_wallet]
          );
          console.log(`🔵 [Follow] VERIFY AFTER DELETE: Found ${verifyResult.rows.length} rows (should be 0)`);
          if (verifyResult.rows.length > 0) {
            console.error(`❌ [Follow] DELETE FAILED! Row still exists:`, verifyResult.rows[0]);
          } else {
            console.log(`✅ [Follow] DELETE CONFIRMED: Row successfully removed`);
          }

          action = 'unfollowed';
        } else {
          // Follow
          await pgPool.query(
            'INSERT INTO follows (follower_wallet, following_wallet) VALUES ($1, $2)',
            [follower_wallet, following_wallet]
          );

          // Get follower's display name and avatar for notification
          const followerProfile = await pgPool.query(
            'SELECT display_name, avatar_nft FROM profiles WHERE wallet_address = $1',
            [follower_wallet]
          );

          const followerDisplayName = followerProfile.rows[0]?.display_name || null;
          const followerAvatar = followerProfile.rows[0]?.avatar_nft || null;

          // Send notification to the person being followed
          addNotification(following_wallet, 'follower', {
            wallet: follower_wallet,
            displayName: followerDisplayName,
            avatarNft: followerAvatar
          });

          action = 'followed';
        }
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase
      const { data: existing, error: checkError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_wallet', follower_wallet)
        .eq('following_wallet', following_wallet)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        // Unfollow
        const { error: deleteError } = await supabase
          .from('follows')
          .delete()
          .eq('follower_wallet', follower_wallet)
          .eq('following_wallet', following_wallet);

        if (deleteError) throw deleteError;
        action = 'unfollowed';
      } else {
        // Follow
        const { error: insertError } = await supabase
          .from('follows')
          .insert({ follower_wallet, following_wallet });

        if (insertError) throw insertError;

        // Get follower's display name and avatar for notification
        const { data: followerProfile } = await supabase
          .from('profiles')
          .select('display_name, avatar_nft')
          .eq('wallet_address', follower_wallet)
          .maybeSingle();

        const followerDisplayName = followerProfile?.display_name || null;
        const followerAvatar = followerProfile?.avatar_nft || null;

        // Send notification to the person being followed
        addNotification(following_wallet, 'follower', {
          wallet: follower_wallet,
          displayName: followerDisplayName,
          avatarNft: followerAvatar
        });

        action = 'followed';
      }
    }

    res.json({ success: true, action });
  } catch (error) {
    console.error('Error toggling follow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Follow Status (is user A following user B?)
app.get('/api/follow/status', async (req, res) => {
  try {
    const { follower_wallet, following_wallet } = req.query;

    if (!follower_wallet || !following_wallet) {
      return res.status(400).json({
        success: false,
        error: 'follower_wallet and following_wallet required'
      });
    }

    let isFollowing = false;

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          'SELECT id FROM follows WHERE follower_wallet = $1 AND following_wallet = $2',
          [follower_wallet, following_wallet]
        );
        isFollowing = result.rows.length > 0;
        console.log(`🔵 [Follow Status] Query for ${follower_wallet} -> ${following_wallet}: Found ${result.rows.length} row(s), isFollowing: ${isFollowing}`);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_wallet', follower_wallet)
        .eq('following_wallet', following_wallet)
        .maybeSingle();

      if (error) throw error;
      isFollowing = !!data;
    }

    res.json({
      success: true,
      isFollowing: isFollowing
    });
  } catch (error) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Follower and Following Counts for a User
app.get('/api/follow/counts/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    let followers = 0;
    let following = 0;

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        // Get follower count (people following this user)
        const followerResult = await pgPool.query(
          'SELECT COUNT(*) as count FROM follows WHERE following_wallet = $1',
          [wallet]
        );

        // Get following count (people this user is following)
        const followingResult = await pgPool.query(
          'SELECT COUNT(*) as count FROM follows WHERE follower_wallet = $1',
          [wallet]
        );

        followers = parseInt(followerResult.rows[0].count);
        following = parseInt(followingResult.rows[0].count);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase - fetch all records and count them
      const { data: followerData, error: followerError } = await supabase
        .from('follows')
        .select('id')
        .eq('following_wallet', wallet);

      const { data: followingData, error: followingError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_wallet', wallet);

      if (followerError || followingError) {
        throw followerError || followingError;
      }

      followers = followerData?.length || 0;
      following = followingData?.length || 0;

      console.log(`✅ [Supabase] Follower counts for ${wallet}: followers=${followers}, following=${following}`);
    }

    res.json({
      success: true,
      followers: followers,
      following: following
    });
  } catch (error) {
    console.error('Error fetching follow counts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Followers List (people following this user)
app.get('/api/follow/followers/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    let followers = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          `SELECT f.follower_wallet, p.display_name, p.avatar_nft, f.created_at
           FROM follows f
           LEFT JOIN profiles p ON f.follower_wallet = p.wallet_address
           WHERE f.following_wallet = $1
           ORDER BY f.created_at DESC`,
          [wallet]
        );
        followers = result.rows;
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase - get follows then fetch profiles separately
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('follower_wallet, created_at')
        .eq('following_wallet', wallet)
        .order('created_at', { ascending: false });

      if (followError) throw followError;

      // Fetch profile data for each follower
      followers = await Promise.all((followData || []).map(async (follow) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_nft')
          .eq('wallet_address', follow.follower_wallet)
          .maybeSingle();

        return {
          follower_wallet: follow.follower_wallet,
          display_name: profile?.display_name || null,
          avatar_nft: profile?.avatar_nft || null,
          created_at: follow.created_at
        };
      }));
    }

    res.json({
      success: true,
      followers: followers
    });
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Following List (people this user is following)
app.get('/api/follow/following/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    let following = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          `SELECT f.following_wallet, p.display_name, p.avatar_nft, f.created_at
           FROM follows f
           LEFT JOIN profiles p ON f.following_wallet = p.wallet_address
           WHERE f.follower_wallet = $1
           ORDER BY f.created_at DESC`,
          [wallet]
        );
        following = result.rows;
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase - get follows then fetch profiles separately
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('following_wallet, created_at')
        .eq('follower_wallet', wallet)
        .order('created_at', { ascending: false });

      if (followError) throw followError;

      // Fetch profile data for each person being followed
      following = await Promise.all((followData || []).map(async (follow) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_nft')
          .eq('wallet_address', follow.following_wallet)
          .maybeSingle();

        return {
          following_wallet: follow.following_wallet,
          display_name: profile?.display_name || null,
          avatar_nft: profile?.avatar_nft || null,
          created_at: follow.created_at
        };
      }));
    }

    res.json({
      success: true,
      following: following
    });
  } catch (error) {
    console.error('Error fetching following:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TWITTER EMBED API
// ============================================

// Get Twitter embed data (oEmbed)
app.get('/api/twitter/oembed', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // SECURITY: Validate that URL is actually from Twitter/X (prevents SSRF attacks)
    try {
      const parsedUrl = new URL(url);
      const allowedHosts = ['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'];

      if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
        return res.status(400).json({
          error: 'Invalid URL: Only Twitter/X URLs are allowed'
        });
      }
    } catch (urlError) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

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

// ===== HEALTH & DEBUG =====

// Serve main.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'main.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'BEAR Park API Server running' });
});

// SECURITY: Debug endpoint removed - exposed sensitive data
// DO NOT re-add this in production

// Update User Display Name (for admin moderation)
app.patch('/api/users/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const { display_name } = req.body;

    if (!display_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: display_name'
      });
    }

    const { error } = await supabase
      .from('honey_points')
      .update({ display_name: display_name })
      .eq('wallet_address', wallet);

    if (error) {
      console.error('Error updating user name:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Updated display name for ${wallet} to: ${display_name}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in update user endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ADMIN FEATURES ENDPOINTS
// ========================================

// Helper function to log admin activity
async function logAdminActivity(adminWallet, actionType, details, targetWallet = null) {
  try {
    await supabase.from('admin_activity_logs').insert({
      admin_wallet: adminWallet,
      action_type: actionType,
      details: details,
      target_wallet: targetWallet
    });
  } catch (error) {
    console.error('Error logging admin activity:', error);
  }
}

// 1. Manual Point Adjustments
app.post('/api/admin/adjust-points', verifyAdmin, validateWallet, validateAmount, validateTextLengths, async (req, res) => {
  try {
    const { wallet_address, amount, reason } = req.body;
    const admin_wallet = req.adminWallet; // From verified middleware

    if (!wallet_address || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, amount'
      });
    }

    const pointsAmount = parseFloat(amount);

    // Get current points
    const { data: existingPoints } = await supabase
      .from('honey_points')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    if (existingPoints) {
      // Update existing record
      const newTotal = existingPoints.total_points + pointsAmount;
      const { error } = await supabase
        .from('honey_points')
        .update({
          total_points: newTotal,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_address', wallet_address);

      if (error) throw error;
    } else {
      // Create new record
      const { error } = await supabase
        .from('honey_points')
        .insert({
          wallet_address,
          total_points: pointsAmount,
          raiding_points: 0,
          games_points: 0
        });

      if (error) throw error;
    }

    // Log transaction
    await supabase.from('point_transactions').insert({
      wallet_address,
      amount: pointsAmount,
      transaction_type: pointsAmount > 0 ? 'manual_add' : 'manual_subtract',
      reason: reason || 'Manual adjustment by admin',
      admin_wallet
    });

    // Log admin activity
    await logAdminActivity(admin_wallet, 'adjust_points', {
      wallet_address,
      amount: pointsAmount,
      reason
    }, wallet_address);

    console.log(`✅ Adjusted points for ${wallet_address}: ${pointsAmount > 0 ? '+' : ''}${pointsAmount}`);
    res.json({ success: true, new_amount: pointsAmount });
  } catch (error) {
    console.error('Error adjusting points:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Ban User
app.post('/api/admin/ban-user', verifyAdmin, validateWallet, validateTextLengths, async (req, res) => {
  try {
    const { wallet_address, reason } = req.body;
    const admin_wallet = req.adminWallet; // From verified middleware

    if (!wallet_address) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: wallet_address'
      });
    }

    const { error } = await supabase
      .from('banned_users')
      .upsert({
        wallet_address,
        banned_by: admin_wallet,
        reason: reason || 'No reason provided',
        is_banned: true,
        banned_at: new Date().toISOString()
      });

    if (error) throw error;

    // Log admin activity
    await logAdminActivity(admin_wallet, 'ban_user', {
      wallet_address,
      reason
    }, wallet_address);

    console.log(`✅ Banned user: ${wallet_address}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Unban User
app.post('/api/admin/unban-user', verifyAdmin, validateWallet, async (req, res) => {
  try {
    const { wallet_address } = req.body;
    const admin_wallet = req.adminWallet; // From verified middleware

    if (!wallet_address || !admin_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, admin_wallet'
      });
    }

    const { error } = await supabase
      .from('banned_users')
      .update({ is_banned: false })
      .eq('wallet_address', wallet_address);

    if (error) throw error;

    // Log admin activity
    await logAdminActivity(admin_wallet, 'unban_user', {
      wallet_address
    }, wallet_address);

    console.log(`✅ Unbanned user: ${wallet_address}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unbanning user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Get Banned Users
app.get('/api/admin/banned-users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('banned_users')
      .select('*')
      .eq('is_banned', true)
      .order('banned_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, banned_users: data || [] });
  } catch (error) {
    console.error('Error fetching banned users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Get Analytics Dashboard Data
app.get('/api/admin/analytics', async (req, res) => {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from('honey_points')
      .select('*', { count: 'exact', head: true });

    // Total points distributed
    const { data: pointsData } = await supabase
      .from('honey_points')
      .select('total_points');

    const totalPoints = pointsData?.reduce((sum, user) => sum + (user.total_points || 0), 0) || 0;

    // Active users (users with activity in last 24h, 7d, 30d)
    const now = new Date();
    const day24Ago = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const day7Ago = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const day30Ago = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { count: active24h } = await supabase
      .from('game_points')
      .select('wallet_address', { count: 'exact', head: true })
      .gte('session_date', day24Ago.split('T')[0]);

    const { count: active7d } = await supabase
      .from('game_points')
      .select('wallet_address', { count: 'exact', head: true })
      .gte('session_date', day7Ago.split('T')[0]);

    const { count: active30d } = await supabase
      .from('game_points')
      .select('wallet_address', { count: 'exact', head: true })
      .gte('session_date', day30Ago.split('T')[0]);

    // Game stats
    const { data: gameStats } = await supabase
      .from('game_points')
      .select('game_id, minutes_played, points_awarded');

    const gameBreakdown = {};
    gameStats?.forEach(session => {
      if (!gameBreakdown[session.game_id]) {
        gameBreakdown[session.game_id] = {
          total_sessions: 0,
          total_minutes: 0,
          total_points: 0
        };
      }
      gameBreakdown[session.game_id].total_sessions++;
      gameBreakdown[session.game_id].total_minutes += session.minutes_played || 0;
      gameBreakdown[session.game_id].total_points += session.points_awarded || 0;
    });

    res.json({
      success: true,
      analytics: {
        total_users: totalUsers || 0,
        total_points_distributed: Math.round(totalPoints),
        active_users: {
          last_24h: active24h || 0,
          last_7d: active7d || 0,
          last_30d: active30d || 0
        },
        game_stats: gameBreakdown
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Get Activity Logs
app.get('/api/admin/activity-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    const { data, error } = await supabase
      .from('admin_activity_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ success: true, logs: data || [] });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Get Game Settings
app.get('/api/admin/game-settings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('game_settings')
      .select('*');

    if (error) throw error;

    // Convert to key-value object
    const settings = {};
    data?.forEach(setting => {
      settings[setting.key] = setting.value;
    });

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching game settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Update Game Settings
app.post('/api/admin/game-settings', verifyAdmin, validateWallet, async (req, res) => {
  try {
    const { settings, admin_wallet } = req.body;

    if (!settings || !admin_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: settings, admin_wallet'
      });
    }

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      await supabase
        .from('game_settings')
        .upsert({
          key,
          value: value.toString(),
          updated_by: admin_wallet,
          updated_at: new Date().toISOString()
        });
    }

    // Log admin activity
    await logAdminActivity(admin_wallet, 'update_game_settings', settings);

    console.log(`✅ Updated game settings:`, settings);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating game settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Get Raid Analytics
app.get('/api/admin/raid-analytics', async (req, res) => {
  try {
    // Get all raids
    const { data: raids } = await supabase
      .from('raids')
      .select('*')
      .order('created_at', { ascending: false });

    res.json({ success: true, raid_analytics: raids || [] });
  } catch (error) {
    console.error('Error fetching raid analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Get Point Transaction History
app.get('/api/admin/point-transactions', async (req, res) => {
  try {
    const wallet = req.query.wallet;
    const limit = parseInt(req.query.limit) || 100;

    let query = supabase
      .from('point_transactions')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (wallet) {
      query = query.eq('wallet_address', wallet);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, transactions: data || [] });
  } catch (error) {
    console.error('Error fetching point transactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Bulk Point Operations
app.post('/api/admin/bulk-points', verifyAdmin, validateAmount, validateTextLengths, async (req, res) => {
  try {
    const { wallets, amount, reason, admin_wallet } = req.body;

    if (!wallets || !Array.isArray(wallets) || !amount || !admin_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallets (array), amount, admin_wallet'
      });
    }

    const pointsAmount = parseFloat(amount);
    const results = [];

    for (const wallet_address of wallets) {
      try {
        // Get current points
        const { data: existingPoints } = await supabase
          .from('honey_points')
          .select('*')
          .eq('wallet_address', wallet_address)
          .single();

        if (existingPoints) {
          const newTotal = existingPoints.total_points + pointsAmount;
          await supabase
            .from('honey_points')
            .update({
              total_points: newTotal,
              updated_at: new Date().toISOString()
            })
            .eq('wallet_address', wallet_address);
        } else {
          await supabase
            .from('honey_points')
            .insert({
              wallet_address,
              total_points: pointsAmount,
              raiding_points: 0,
              games_points: 0
            });
        }

        // Log transaction
        await supabase.from('point_transactions').insert({
          wallet_address,
          amount: pointsAmount,
          transaction_type: 'bulk_award',
          reason: reason || 'Bulk points award by admin',
          admin_wallet
        });

        results.push({ wallet_address, success: true });
      } catch (error) {
        results.push({ wallet_address, success: false, error: error.message });
      }
    }

    // Log admin activity
    await logAdminActivity(admin_wallet, 'bulk_points', {
      wallet_count: wallets.length,
      amount: pointsAmount,
      reason
    });

    console.log(`✅ Bulk awarded ${pointsAmount} points to ${wallets.length} wallets`);
    res.json({ success: true, results });
  } catch (error) {
    console.error('Error in bulk point operation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// ROLE MANAGEMENT ENDPOINTS
// =====================================================

// Get all assigned roles
app.get('/api/admin/roles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admin_roles')
      .select('*')
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, roles: data || [] });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check specific wallet's role and permissions
app.get('/api/admin/check-role/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    const { data, error } = await supabase
      .from('admin_roles')
      .select('*')
      .eq('wallet_address', wallet)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({
      success: true,
      role: data || null,
      has_role: !!data,
      is_master: data?.role === 'master',
      is_admin: data?.role === 'admin' || data?.role === 'master',
      is_moderator: data?.role === 'moderator' || data?.role === 'admin' || data?.role === 'master'
    });
  } catch (error) {
    console.error('Error checking role:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign a role to wallet (master only)
app.post('/api/admin/roles/assign', verifyAdmin, validateWallet, validateTextLengths, async (req, res) => {
  try {
    const { wallet_address, role, notes } = req.body;
    const assigned_by = req.adminWallet; // From verified middleware

    if (!wallet_address || !role || !assigned_by) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, role, assigned_by'
      });
    }

    // Verify the assigner is master
    const { data: assignerRole } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('wallet_address', assigned_by)
      .eq('is_active', true)
      .single();

    if (!assignerRole || assignerRole.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Only MASTER accounts can assign roles'
      });
    }

    // Define permissions based on role
    let permissions = {};
    if (role === 'master') {
      permissions = {
        all: true,
        assign_roles: true,
        delete_roles: true,
        manage_admins: true,
        manage_moderators: true,
        full_access: true
      };
    } else if (role === 'admin') {
      permissions = {
        manage_users: true,
        ban_users: true,
        adjust_points: true,
        manage_raids: true,
        view_analytics: true,
        update_settings: true,
        view_logs: true
      };
    } else if (role === 'moderator') {
      permissions = {
        edit_names: true,
        view_users: true,
        view_analytics_readonly: true
      };
    }

    // Insert or update role
    const { error } = await supabase
      .from('admin_roles')
      .upsert({
        wallet_address,
        role,
        assigned_by,
        permissions,
        notes,
        is_active: true,
        assigned_at: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      });

    if (error) throw error;

    // Log admin activity
    await logAdminActivity(assigned_by, 'assign_role', {
      wallet_address,
      role,
      notes
    }, wallet_address);

    console.log(`✅ Assigned role '${role}' to ${wallet_address} by ${assigned_by}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove role from wallet (master only)
app.delete('/api/admin/roles/:wallet', verifyAdmin, async (req, res) => {
  try {
    const { wallet } = req.params;
    const { removed_by } = req.body;

    if (!removed_by) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: removed_by'
      });
    }

    // Verify the remover is master
    const { data: removerRole } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('wallet_address', removed_by)
      .eq('is_active', true)
      .single();

    if (!removerRole || removerRole.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Only MASTER accounts can remove roles'
      });
    }

    // Prevent removing master account
    if (wallet === 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT') {
      return res.status(403).json({
        success: false,
        error: 'Cannot remove the MASTER account'
      });
    }

    // Get role info before deletion
    const { data: roleInfo } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('wallet_address', wallet)
      .single();

    // Deactivate the role
    const { error } = await supabase
      .from('admin_roles')
      .update({ is_active: false })
      .eq('wallet_address', wallet);

    if (error) throw error;

    // Log admin activity
    await logAdminActivity(removed_by, 'remove_role', {
      wallet_address: wallet,
      previous_role: roleInfo?.role
    }, wallet);

    console.log(`✅ Removed role from ${wallet} by ${removed_by}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing role:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// PUSH NOTIFICATIONS
// ====================================================================

// Get VAPID public key
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
app.post('/api/push/subscribe', async (req, res) => {
  const { wallet_address, subscription, device_info } = req.body;

  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        wallet_address,
        subscription: JSON.stringify(subscription),
        device_info,
        is_active: true,
        updated_at: new Date()
      }, {
        onConflict: 'wallet_address'
      });

    if (error) throw error;

    console.log(`✅ Push subscription saved for ${wallet_address}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe from push notifications
app.post('/api/push/unsubscribe', async (req, res) => {
  const { wallet_address } = req.body;

  try {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('wallet_address', wallet_address);

    console.log(`✅ Push subscription disabled for ${wallet_address}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to send raid notifications
async function sendRaidNotification(raid) {
  try {
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('is_active', true);

    if (!subscriptions || subscriptions.length === 0) {
      console.log('⚠️  No active push subscriptions');
      return;
    }

    const payload = JSON.stringify({
      type: 'raid',
      raid_id: raid.id,
      raid_name: raid.name,
      creator_name: raid.creator_name,
      timestamp: new Date().toISOString()
    });

    const promises = subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          JSON.parse(sub.subscription),
          payload
        );
      } catch (error) {
        console.error(`Failed to send to ${sub.wallet_address}:`, error.message);
        // If subscription is invalid, mark as inactive
        if (error.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('wallet_address', sub.wallet_address);
        }
      }
    });

    await Promise.allSettled(promises);
    console.log(`✅ Sent raid notifications to ${subscriptions.length} users`);

  } catch (error) {
    console.error('Error sending raid notifications:', error);
  }
}

// Test notification endpoint
app.post('/api/push/test', async (req, res) => {
  const { wallet_address } = req.body;

  try {
    const { data: sub } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('is_active', true)
      .single();

    if (!sub) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const payload = JSON.stringify({
      title: '🐻 Test Notification',
      body: 'If you see this, push notifications are working! 🎉',
      type: 'test'
    });

    await webpush.sendNotification(JSON.parse(sub.subscription), payload);

    res.json({ success: true, message: 'Test notification sent!' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== NOTIFICATION SYSTEM =====
// In-memory notification storage (for quick MVP - could be moved to database later)
const notificationStore = new Map(); // wallet => notifications[]

// Get notifications for a user
app.get('/api/notifications/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const notifications = notificationStore.get(wallet) || [];

    // Clean old notifications (older than 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const validNotifications = notifications.filter(n =>
      new Date(n.created_at).getTime() > sevenDaysAgo
    );

    // Update store if we filtered any
    if (validNotifications.length !== notifications.length) {
      notificationStore.set(wallet, validNotifications);
    }

    res.json({ success: true, notifications: validNotifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to add a notification
function addNotification(targetWallet, type, data) {
  try {
    const notifications = notificationStore.get(targetWallet) || [];

    const notification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type,
      data,
      read: false,
      created_at: new Date().toISOString()
    };

    notifications.unshift(notification);

    // Limit to 50 notifications per user
    if (notifications.length > 50) {
      notifications.splice(50);
    }

    notificationStore.set(targetWallet, notifications);

    console.log(`📬 Notification added for ${targetWallet}: ${type}`);
  } catch (error) {
    console.error('Error adding notification:', error);
  }
}

// ===================================================
// COSMETICS SYSTEM API ROUTES
// ===================================================

// Get all cosmetics catalog items
app.get('/api/cosmetics/catalog', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cosmetics_catalog')
      .select('*')
      .order('honey_cost', { ascending: true });

    if (error) throw error;

    res.json({ success: true, items: data });
  } catch (error) {
    console.error('Error fetching cosmetics catalog:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's inventory (owned cosmetics)
app.get('/api/cosmetics/inventory/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    const { data, error } = await supabase
      .from('user_cosmetics')
      .select(`
        *,
        cosmetic:cosmetics_catalog(*)
      `)
      .eq('wallet_address', wallet);

    if (error) throw error;

    res.json({ success: true, items: data });
  } catch (error) {
    console.error('Error fetching user inventory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's equipped cosmetics
app.get('/api/cosmetics/equipped/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        equipped_ring_id,
        equipped_banner_id,
        equipped_ring:cosmetics_catalog!profiles_equipped_ring_id_fkey(*),
        equipped_banner:cosmetics_catalog!profiles_equipped_banner_id_fkey(*)
      `)
      .eq('wallet_address', wallet)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({
      success: true,
      equipped: {
        ring: data?.equipped_ring || null,
        banner: data?.equipped_banner || null
      }
    });
  } catch (error) {
    console.error('Error fetching equipped cosmetics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Purchase a cosmetic item
app.post('/api/cosmetics/purchase', async (req, res) => {
  try {
    const { wallet_address, cosmetic_id } = req.body;

    if (!wallet_address || !cosmetic_id) {
      return res.status(400).json({
        success: false,
        error: 'wallet_address and cosmetic_id are required'
      });
    }

    // Get the cosmetic item details
    const { data: cosmetic, error: cosmeticError } = await supabase
      .from('cosmetics_catalog')
      .select('*')
      .eq('id', cosmetic_id)
      .single();

    if (cosmeticError) throw cosmeticError;
    if (!cosmetic) {
      return res.status(404).json({ success: false, error: 'Cosmetic not found' });
    }

    // Check if user already owns this item
    const { data: existing } = await supabase
      .from('user_cosmetics')
      .select('id')
      .eq('wallet_address', wallet_address)
      .eq('cosmetic_id', cosmetic_id)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'You already own this item'
      });
    }

    // Get user's current honey points
    const { data: pointsData } = await supabase
      .from('honey_points')
      .select('total_points')
      .eq('wallet_address', wallet_address)
      .single();

    const currentPoints = pointsData?.total_points || 0;

    if (currentPoints < cosmetic.honey_cost) {
      return res.status(400).json({
        success: false,
        error: `Not enough Honey Points. Need ${cosmetic.honey_cost}, have ${currentPoints}`
      });
    }

    // Deduct honey points
    const newPoints = currentPoints - cosmetic.honey_cost;
    const { error: pointsError } = await supabase
      .from('honey_points')
      .update({ total_points: newPoints })
      .eq('wallet_address', wallet_address);

    if (pointsError) throw pointsError;

    // Add item to user's inventory
    const { error: inventoryError } = await supabase
      .from('user_cosmetics')
      .insert({
        wallet_address,
        cosmetic_id
      });

    if (inventoryError) throw inventoryError;

    // Record transaction
    await supabase
      .from('cosmetics_transactions')
      .insert({
        wallet_address,
        cosmetic_id,
        honey_spent: cosmetic.honey_cost,
        transaction_type: 'purchase'
      });

    res.json({
      success: true,
      message: 'Purchase successful',
      new_balance: newPoints,
      item: cosmetic
    });
  } catch (error) {
    console.error('Error purchasing cosmetic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Equip a cosmetic item
app.post('/api/cosmetics/equip', async (req, res) => {
  try {
    const { wallet_address, cosmetic_id, cosmetic_type } = req.body;

    if (!wallet_address || !cosmetic_id || !cosmetic_type) {
      return res.status(400).json({
        success: false,
        error: 'wallet_address, cosmetic_id, and cosmetic_type are required'
      });
    }

    // Verify user owns this item
    const { data: owned } = await supabase
      .from('user_cosmetics')
      .select('id')
      .eq('wallet_address', wallet_address)
      .eq('cosmetic_id', cosmetic_id)
      .single();

    if (!owned) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this item'
      });
    }

    // Ensure profile exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('wallet_address', wallet_address)
      .single();

    if (!profile) {
      // Create profile if it doesn't exist
      await supabase
        .from('profiles')
        .insert({ wallet_address });
    }

    // Update equipped cosmetic
    const updateField = cosmetic_type === 'ring' ? 'equipped_ring_id' : 'equipped_banner_id';
    const { error: equipError } = await supabase
      .from('profiles')
      .update({ [updateField]: cosmetic_id })
      .eq('wallet_address', wallet_address);

    if (equipError) throw equipError;

    res.json({
      success: true,
      message: `${cosmetic_type === 'ring' ? 'Ring' : 'Banner'} equipped successfully`
    });
  } catch (error) {
    console.error('Error equipping cosmetic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Unequip a cosmetic item
app.post('/api/cosmetics/unequip', async (req, res) => {
  try {
    const { wallet_address, cosmetic_type } = req.body;

    if (!wallet_address || !cosmetic_type) {
      return res.status(400).json({
        success: false,
        error: 'wallet_address and cosmetic_type are required'
      });
    }

    // Update equipped cosmetic to null
    const updateField = cosmetic_type === 'ring' ? 'equipped_ring_id' : 'equipped_banner_id';
    const { error: unequipError } = await supabase
      .from('profiles')
      .update({ [updateField]: null })
      .eq('wallet_address', wallet_address);

    if (unequipError) throw unequipError;

    res.json({
      success: true,
      message: `${cosmetic_type === 'ring' ? 'Ring' : 'Banner'} unequipped successfully`
    });
  } catch (error) {
    console.error('Error unequipping cosmetic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// BULLETIN BOARD API ROUTES
// =====================================================

// Get all bulletin posts (sorted by newest first)
app.get('/api/bulletin/posts', async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from('bulletin_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Add reaction counts to each post
    const postsWithReactions = await Promise.all((posts || []).map(async (post) => {
      try {
        const { data: reactions } = await supabase
          .from('bulletin_post_reactions')
          .select('id')
          .eq('post_id', post.id);

        return {
          ...post,
          reaction_count: reactions?.length || 0
        };
      } catch (err) {
        console.error(`Error fetching reactions for post ${post.id}:`, err);
        return {
          ...post,
          reaction_count: 0
        };
      }
    }));

    res.json(postsWithReactions);
  } catch (error) {
    console.error('❌ Error fetching bulletin posts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new bulletin post
app.post('/api/bulletin/posts', async (req, res) => {
  try {
    const { wallet_address, content, link_preview } = req.body;

    if (!wallet_address || !content) {
      return res.status(400).json({ error: 'wallet_address and content are required' });
    }

    // Get user profile for author info
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_nft')
      .eq('wallet_address', wallet_address)
      .single();

    // Insert post into Supabase
    const { data: newPost, error } = await supabase
      .from('bulletin_posts')
      .insert({
        wallet_address,
        content,
        link_preview: link_preview || null,
        author_name: profile?.display_name || 'Anonymous',
        author_avatar: profile?.avatar_nft || null,
        comment_count: 0
      })
      .select()
      .single();

    if (error) throw error;

    res.json(newPost);
  } catch (error) {
    console.error('❌ Error creating bulletin post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a bulletin post
app.delete('/api/bulletin/posts/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { wallet_address } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Verify ownership
    const { data: post, error: fetchError } = await supabase
      .from('bulletin_posts')
      .select('wallet_address')
      .eq('id', postId)
      .single();

    if (fetchError) throw fetchError;

    if (post.wallet_address !== wallet_address) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    // Delete the post (cascade will delete all comments and reactions)
    const { error: deleteError } = await supabase
      .from('bulletin_posts')
      .delete()
      .eq('id', postId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting bulletin post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all comments for a bulletin post (with nested structure)
app.get('/api/bulletin/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;

    // Fetch all comments for this post from Supabase
    const { data: comments, error } = await supabase
      .from('bulletin_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json(comments || []);
  } catch (error) {
    console.error('❌ Error fetching bulletin comments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new bulletin comment or reply
app.post('/api/bulletin/comments', async (req, res) => {
  try {
    const { post_id, wallet_address, content, parent_id } = req.body;

    if (!post_id || !wallet_address || !content) {
      return res.status(400).json({ error: 'post_id, wallet_address, and content are required' });
    }

    // Get user profile for author info from database (always fetch fresh data)
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_nft')
      .eq('wallet_address', wallet_address)
      .single();

    // Insert comment into Supabase with fresh profile data
    const { data: newComment, error } = await supabase
      .from('bulletin_comments')
      .insert({
        post_id,
        wallet_address,
        content,
        author_name: profile?.display_name || 'Anonymous',
        author_avatar: profile?.avatar_nft || null,
        parent_id: parent_id || null
      })
      .select()
      .single();

    if (error) throw error;

    res.json(newComment);
  } catch (error) {
    console.error('❌ Error creating bulletin comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a bulletin comment
app.delete('/api/bulletin/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { wallet_address } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Check if user is admin/moderator (server-side verification)
    let is_admin = false;
    try {
      const { data: adminRole } = await supabase
        .from('admin_roles')
        .select('role, is_active')
        .eq('wallet_address', wallet_address)
        .eq('is_active', true)
        .single();

      is_admin = adminRole && (adminRole.role === 'admin' || adminRole.role === 'master' || adminRole.role === 'moderator');

      if (is_admin) {
        console.log(`🛡️ Admin/moderator ${wallet_address} (${adminRole.role}) deleting bulletin comment ${commentId}`);
      }
    } catch (adminCheckError) {
      // Not an admin - continue with normal authorization check
      is_admin = false;
    }

    // Get comment data
    const { data: comment, error: fetchError } = await supabase
      .from('bulletin_comments')
      .select('wallet_address')
      .eq('id', commentId)
      .single();

    if (fetchError) throw fetchError;

    // Check permissions: admin/moderator OR comment author
    const canDelete = is_admin || comment.wallet_address === wallet_address;

    if (!canDelete) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    // Delete the comment (cascade will delete reactions and child comments)
    const { error: deleteError } = await supabase
      .from('bulletin_comments')
      .delete()
      .eq('id', commentId);

    if (deleteError) throw deleteError;

    console.log(`✅ Bulletin comment ${commentId} deleted by ${wallet_address}${is_admin ? ' (admin/moderator)' : ''}`);
    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting bulletin comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get reactions for a bulletin comment
app.get('/api/bulletin/comments/:commentId/reactions', async (req, res) => {
  try {
    const { commentId } = req.params;

    let reactions = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          `SELECT reaction_type, wallet_address
           FROM bulletin_comment_reactions
           WHERE comment_id = $1`,
          [commentId]
        );
        reactions = result.rows;
        console.log(`✅ [pgPool] Fetched ${reactions.length} reactions for bulletin comment ${commentId}`);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase
      const { data, error } = await supabase
        .from('bulletin_comment_reactions')
        .select('reaction_type, wallet_address')
        .eq('comment_id', commentId);

      if (error) throw error;
      reactions = data || [];
    }

    // Aggregate reactions by type
    const counts = {};
    const userReactions = {};

    reactions.forEach(row => {
      counts[row.reaction_type] = (counts[row.reaction_type] || 0) + 1;
      if (!userReactions[row.wallet_address]) {
        userReactions[row.wallet_address] = [];
      }
      userReactions[row.wallet_address].push(row.reaction_type);
    });

    res.json({ counts, userReactions });
  } catch (error) {
    console.error('❌ Error fetching bulletin reactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle reaction on a bulletin comment (add if doesn't exist, remove if exists)
app.post('/api/bulletin/comments/:commentId/react', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { wallet_address, reaction_type } = req.body;

    if (!wallet_address || !reaction_type) {
      return res.status(400).json({ error: 'wallet_address and reaction_type are required' });
    }

    // Check if reaction already exists
    const { data: existing, error: fetchError } = await supabase
      .from('bulletin_comment_reactions')
      .select('id')
      .eq('comment_id', commentId)
      .eq('wallet_address', wallet_address)
      .eq('reaction_type', reaction_type)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let action;
    if (existing) {
      // Remove reaction (toggle off)
      const { error: deleteError } = await supabase
        .from('bulletin_comment_reactions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) throw deleteError;
      action = 'removed';
    } else {
      // Add reaction (toggle on)
      const { error: insertError } = await supabase
        .from('bulletin_comment_reactions')
        .insert({
          comment_id: commentId,
          wallet_address,
          reaction_type
        });

      if (insertError) throw insertError;
      action = 'added';
    }

    // Fetch updated reaction counts
    let reactions = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          `SELECT reaction_type, wallet_address
           FROM bulletin_comment_reactions
           WHERE comment_id = $1`,
          [commentId]
        );
        reactions = result.rows;
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed in reaction toggle, falling back to Supabase...`);

      // Fallback to Supabase
      const { data } = await supabase
        .from('bulletin_comment_reactions')
        .select('reaction_type, wallet_address')
        .eq('comment_id', commentId);

      reactions = data || [];
    }

    // Aggregate reactions
    const counts = {};
    const userReactions = {};

    reactions.forEach(row => {
      counts[row.reaction_type] = (counts[row.reaction_type] || 0) + 1;
      if (!userReactions[row.wallet_address]) {
        userReactions[row.wallet_address] = [];
      }
      userReactions[row.wallet_address].push(row.reaction_type);
    });

    res.json({
      success: true,
      action,
      counts,
      userReactions
    });
  } catch (error) {
    console.error('❌ Error toggling bulletin reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =======================
// BULLETIN POST REACTIONS
// =======================

// Get reactions for a bulletin post
app.get('/api/bulletin/posts/:postId/reactions', async (req, res) => {
  try {
    const { postId } = req.params;

    let reactions = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          `SELECT reaction_type, wallet_address
           FROM bulletin_post_reactions
           WHERE post_id = $1`,
          [postId]
        );
        reactions = result.rows;
        console.log(`✅ [pgPool] Fetched ${reactions.length} reactions for bulletin post ${postId}`);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Fallback to Supabase
      const { data, error } = await supabase
        .from('bulletin_post_reactions')
        .select('reaction_type, wallet_address')
        .eq('post_id', postId);

      if (error) throw error;
      reactions = data || [];
    }

    // Aggregate reactions by type
    const counts = {};
    const userReactions = {};

    reactions.forEach(row => {
      counts[row.reaction_type] = (counts[row.reaction_type] || 0) + 1;
      if (!userReactions[row.wallet_address]) {
        userReactions[row.wallet_address] = [];
      }
      userReactions[row.wallet_address].push(row.reaction_type);
    });

    res.json({ counts, userReactions });
  } catch (error) {
    console.error('❌ Error fetching bulletin post reactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle reaction on a bulletin post (add if doesn't exist, remove if exists)
app.post('/api/bulletin/posts/:postId/react', async (req, res) => {
  try {
    const { postId } = req.params;
    const { wallet_address, reaction_type } = req.body;

    if (!wallet_address || !reaction_type) {
      return res.status(400).json({ error: 'wallet_address and reaction_type are required' });
    }

    // Check if reaction already exists
    const { data: existing, error: fetchError } = await supabase
      .from('bulletin_post_reactions')
      .select('id')
      .eq('post_id', postId)
      .eq('wallet_address', wallet_address)
      .eq('reaction_type', reaction_type)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let action;
    if (existing) {
      // Remove reaction (toggle off)
      const { error: deleteError } = await supabase
        .from('bulletin_post_reactions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) throw deleteError;
      action = 'removed';
    } else {
      // Add reaction (toggle on)
      const { error: insertError } = await supabase
        .from('bulletin_post_reactions')
        .insert({
          post_id: postId,
          wallet_address,
          reaction_type
        });

      if (insertError) throw insertError;
      action = 'added';
    }

    // Fetch updated reaction counts
    let reactions = [];

    // Try direct PostgreSQL first, fall back to Supabase if it fails
    try {
      if (pgPool) {
        const result = await pgPool.query(
          `SELECT reaction_type, wallet_address
           FROM bulletin_post_reactions
           WHERE post_id = $1`,
          [postId]
        );
        reactions = result.rows;
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed in post reaction toggle, falling back to Supabase...`);

      // Fallback to Supabase
      const { data } = await supabase
        .from('bulletin_post_reactions')
        .select('reaction_type, wallet_address')
        .eq('post_id', postId);

      reactions = data || [];
    }

    // Aggregate reactions
    const counts = {};
    const userReactions = {};

    reactions.forEach(row => {
      counts[row.reaction_type] = (counts[row.reaction_type] || 0) + 1;
      if (!userReactions[row.wallet_address]) {
        userReactions[row.wallet_address] = [];
      }
      userReactions[row.wallet_address].push(row.reaction_type);
    });

    res.json({
      success: true,
      action,
      counts,
      userReactions
    });
  } catch (error) {
    console.error('❌ Error toggling bulletin post reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =======================
// LINK PREVIEW ENDPOINT
// =======================

// Fetch link preview metadata (Open Graph tags) for URLs
app.get('/api/link-preview', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    console.log('🔗 Fetching link preview for:', url);

    // Special handling for YouTube URLs
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/;
    const youtubeMatch = url.match(youtubeRegex);

    if (youtubeMatch) {
      const videoId = youtubeMatch[1];
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      console.log('🎥 YouTube video detected:', videoId);

      // Fetch YouTube metadata using oEmbed API
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const oembedResponse = await fetch(oembedUrl);

        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();

          console.log('✅ YouTube metadata fetched:', oembedData.title);

          return res.json({
            url: url,
            title: oembedData.title || 'YouTube Video',
            description: `${oembedData.author_name || 'YouTube'} • Watch on YouTube`,
            image: thumbnailUrl,
            type: 'youtube'
          });
        }
      } catch (oembedError) {
        console.warn('⚠️ YouTube oEmbed failed, using basic preview:', oembedError.message);
      }

      // Fallback if oEmbed fails
      return res.json({
        url: url,
        title: 'YouTube Video',
        description: 'Watch on YouTube',
        image: thumbnailUrl,
        type: 'youtube'
      });
    }

    // For other URLs, use microlink.io API to fetch Open Graph metadata
    const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
    const response = await fetch(microlinkUrl);

    if (!response.ok) {
      throw new Error(`Microlink API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'success' && data.data) {
      const preview = {
        url: url,
        title: data.data.title || data.data.publisher || new URL(url).hostname,
        description: data.data.description || 'Click to open link',
        image: data.data.image?.url || data.data.logo?.url || null,
        type: 'website'
      };

      console.log('✅ Link preview fetched successfully');
      return res.json(preview);
    } else {
      throw new Error('Microlink returned invalid data');
    }
  } catch (error) {
    console.error('❌ Error fetching link preview:', error.message);

    // Return a basic preview on error
    const { url } = req.query;
    const hostname = url ? new URL(url).hostname : 'Link';

    res.json({
      url: url,
      title: hostname,
      description: 'Click to open link',
      image: null,
      type: 'website'
    });
  }
});

// Start server for local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 BEAR Park API Server running on http://localhost:${PORT}`);
    console.log(`✅ Ready to handle XAMAN authentication`);
    console.log(`✅ Ready to handle honey points & leaderboard`);
    console.log(`✅ Ready to handle admin features`);
    console.log(`✅ Ready to handle notifications`);
    console.log(`✅ Ready to handle cosmetics store`);
    console.log(`✅ Ready to handle bulletin board comments\n`);
  });
}

// Export for Vercel serverless
module.exports = app;

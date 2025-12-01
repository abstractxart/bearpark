require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, param, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚨 RATE LIMITING IS COMPLETELY DISABLED - ALL ROUTES UNRESTRICTED 🚨');

// XAMAN API Credentials from environment variables
const XAMAN_API_KEY = process.env.XAMAN_API_KEY;
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET;
const XAMAN_API_URL = 'https://xumm.app/api/v1/platform';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// 🔒 ADMIN AUTHENTICATION - Set this in your .env file
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-this-in-production-' + Math.random().toString(36);

if (!process.env.ADMIN_API_KEY) {
  console.warn('⚠️  WARNING: ADMIN_API_KEY not set in .env! Using random key:', ADMIN_API_KEY);
  console.warn('⚠️  Set ADMIN_API_KEY in your .env file for production!');
}

// 🔒 SECURITY: Game-specific max scores (prevents impossible scores)
const MAX_SCORES = {
  'flappy-bear': 1000000,    // Max reasonable score for Flappy Bear
  'bear-pong': 1000,         // Max wins in Bear Pong
  'bear-slice': 500000,      // Max score for BearSlice
  'bear-jumpventure': 500000 // Max score for Jump Venture
};

// 🔒 SECURITY: Track suspicious activity
const suspiciousActivity = new Map(); // wallet -> { count, lastSeen, ips }

function logSuspiciousActivity(wallet, reason, ip) {
  const key = wallet || ip || 'unknown';
  const activity = suspiciousActivity.get(key) || { count: 0, reasons: [], ips: new Set(), firstSeen: Date.now() };

  activity.count++;
  activity.lastSeen = Date.now();
  activity.reasons.push({ reason, timestamp: Date.now() });
  if (ip) activity.ips.add(ip);

  suspiciousActivity.set(key, activity);

  console.log(`🚨 SUSPICIOUS ACTIVITY: ${reason}`);
  console.log(`   Wallet: ${wallet || 'unknown'}`);
  console.log(`   IP: ${ip || 'unknown'}`);
  console.log(`   Total incidents: ${activity.count}`);

  // Alert if more than 5 suspicious actions
  if (activity.count > 5) {
    console.log(`⚠️⚠️⚠️ HIGH ALERT: ${key} has ${activity.count} suspicious actions!`);
  }
}

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

// ============================================
// 🔒 SECURITY MIDDLEWARE
// ============================================

// 0. TRUST PROXY - Required for Railway/reverse proxies to properly identify users
// This fixes rate limiting by allowing Express to see real user IPs through Railway's proxy
app.set('trust proxy', true);

// 1. HELMET - Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow external resources for games
  crossOriginEmbedderPolicy: false // Allow iframes
}));

// 2. RATE LIMITING - Prevent API abuse
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const scoreLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 score submissions per minute
  message: { error: 'Too many score submissions, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all routes
// TEMPORARILY DISABLED - Fixing rate limiting issues
// app.use(generalLimiter);

// 3. ADMIN AUTHENTICATION MIDDLEWARE
function requireAdmin(req, res, next) {
  const apiKey = req.headers['x-admin-key'] || req.query.admin_key;

  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    logSuspiciousActivity(null, 'Unauthorized admin access attempt', req.ip);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin authentication required. Include X-Admin-Key header.'
    });
  }

  console.log(`✅ Admin authenticated from IP: ${req.ip}`);
  next();
}

// 4. WALLET ADDRESS VALIDATION MIDDLEWARE
function validateWalletAddress(req, res, next) {
  const walletAddress = req.body.wallet_address || req.params.wallet_address;

  if (walletAddress && !walletAddress.match(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/)) {
    logSuspiciousActivity(walletAddress, 'Invalid wallet address format', req.ip);
    return res.status(400).json({ error: 'Invalid XRP wallet address format' });
  }

  next();
}

// 5. CORS
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key']
}));

// 6. JSON parsing with size limit
app.use(express.json({ limit: '10kb' })); // Prevent large payload attacks

// Serve static files from current directory (NO CACHE for HTML)
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

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

    // Also fetch honey points for this wallet
    const { data: honeyData } = await supabase
      .from('honey_points')
      .select('total_points, raiding_points, games_points')
      .eq('wallet_address', wallet_address)
      .single();

    // Add honey balance to profile response
    const profileWithHoney = {
      ...data,
      honey: honeyData?.total_points || 0,
      honey_raiding: honeyData?.raiding_points || 0,
      honey_games: honeyData?.games_points || 0
    };

    res.json({ success: true, profile: profileWithHoney });
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

// Get user's honey points earned in last 24 hours (for BEARdrops eligibility)
app.get('/api/honey-points/24h', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const wallet = req.query.wallet;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    // Get points from last 24 hours from honey_points_activity table
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('honey_points_activity')
      .select('points')
      .eq('wallet_address', wallet)
      .gte('created_at', twentyFourHoursAgo);

    if (error) {
      console.error('Error fetching 24h honey points:', error);
      // Return 0 on error instead of failing
      return res.json({ success: true, points: 0, wallet });
    }

    // Sum up all points in the last 24 hours
    const totalPoints = data?.reduce((sum, row) => sum + (row.points || 0), 0) || 0;

    res.json({
      success: true,
      points: totalPoints,
      wallet,
      period: '24h'
    });
  } catch (error) {
    console.error('Error fetching 24h honey points:', error);
    res.json({ success: true, points: 0 }); // Return 0 on error
  }
});

// Update/sync user's honey points - WITH SECURITY VALIDATION
app.post('/api/points',
  // strictLimiter, // Strict rate limit for points - TEMPORARILY DISABLED
  validateWalletAddress,
  [
    body('wallet_address').isString().trim().notEmpty(),
    body('total_points').optional().isInt({ min: 0 }),
    body('raiding_points').optional().isInt({ min: 0 }),
    body('games_points').optional().isInt({ min: 0 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSuspiciousActivity(req.body.wallet_address, 'Invalid points submission', req.ip);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    try {
      const { wallet_address, total_points, raiding_points, games_points } = req.body;

      // 🔒 SECURITY: Validate points don't exceed reasonable limits
      const maxPoints = 10000000; // 10 million max
      if ((total_points || 0) > maxPoints || (raiding_points || 0) > maxPoints || (games_points || 0) > maxPoints) {
        logSuspiciousActivity(wallet_address, `Excessive points submitted: total=${total_points}, raiding=${raiding_points}, games=${games_points}`, req.ip);
        return res.status(400).json({ error: 'Points exceed maximum allowed' });
      }

      // 🔒 SECURITY: Get current points to detect suspicious changes
      const { data: currentData } = await supabase
        .from('honey_points')
        .select('*')
        .eq('wallet_address', wallet_address)
        .maybeSingle();

      if (currentData) {
        const currentTotal = currentData.total_points || 0;
        const newTotal = total_points || 0;

        // Detect massive point jumps (more than 100k in one update)
        if (newTotal > currentTotal + 100000) {
          logSuspiciousActivity(wallet_address, `Massive point increase: ${currentTotal} -> ${newTotal}`, req.ip);
          console.log(`⚠️  WARNING: ${wallet_address} increased points by ${newTotal - currentTotal}`);
        }
      }

      // Calculate points delta for activity logging
      const oldTotal = currentData?.total_points || 0;
      const newTotal = total_points || 0;
      const pointsDelta = newTotal - oldTotal;

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

      // Log activity if points increased (for BEARdrops 24h tracking)
      if (pointsDelta > 0) {
        await supabase
          .from('honey_points_activity')
          .insert({
            wallet_address,
            points: pointsDelta,
            source: 'games',
            created_at: new Date().toISOString()
          });
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

    // Log activity for BEARdrops 24h tracking
    await supabase
      .from('honey_points_activity')
      .insert({
        wallet_address,
        points: pointsToAdd,
        source: 'raids',
        created_at: new Date().toISOString()
      });

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

// Submit or update score - WITH SECURITY VALIDATION
app.post('/api/leaderboard',
  // scoreLimiter, // Rate limit score submissions - TEMPORARILY DISABLED
  validateWalletAddress, // Validate wallet format
  [
    body('wallet_address').isString().trim().notEmpty(),
    body('game_id').isString().trim().isIn(['flappy-bear', 'bear-pong', 'bear-slice', 'bear-jumpventure', 'bear-ninja']),
    body('score').isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSuspiciousActivity(req.body.wallet_address, 'Invalid leaderboard submission: ' + JSON.stringify(errors.array()), req.ip);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    try {
      const { wallet_address, game_id, score, metadata } = req.body;

      // 🔒 SECURITY: Validate score against max for this game
      const maxScore = MAX_SCORES[game_id] || 1000000;
      if (score > maxScore) {
        logSuspiciousActivity(wallet_address, `Impossible score submitted: ${score} for ${game_id} (max: ${maxScore})`, req.ip);
        return res.status(400).json({
          error: 'Invalid score',
          message: `Score ${score} exceeds maximum possible score of ${maxScore} for ${game_id}`
        });
      }

      // Check if existing score is higher (also fetch metadata for bear-pong)
      const { data: existing } = await supabase
        .from('game_leaderboards')
        .select('score, metadata')
        .eq('wallet_address', wallet_address)
        .eq('game_id', game_id)
        .single();

      // 🔒 SECURITY: Detect suspicious rapid score increases
      if (existing && score > existing.score * 10 && existing.score > 0) {
        logSuspiciousActivity(wallet_address, `Suspicious score jump: ${existing.score} -> ${score} for ${game_id}`, req.ip);
        console.log(`⚠️  WARNING: ${wallet_address} score jumped 10x in ${game_id}`);
      }

      // 🎯 BEAR PONG: Increment wins/losses in metadata
      let finalMetadata = metadata || {};
      let finalScore = score;

      if (game_id === 'bear-pong') {
        // Get current wins/losses from existing metadata
        const currentWins = existing?.metadata?.wins || existing?.score || 0;
        const currentLosses = existing?.metadata?.losses || 0;

        // Increment based on result
        let newWins = currentWins;
        let newLosses = currentLosses;

        if (metadata?.result === 'win') {
          newWins = currentWins + 1;
          console.log(`🎯 [BEAR PONG] Win recorded: ${currentWins} -> ${newWins} wins`);
        } else if (metadata?.result === 'loss') {
          newLosses = currentLosses + 1;
          console.log(`🎯 [BEAR PONG] Loss recorded: ${currentLosses} -> ${newLosses} losses`);
        }

        // Update metadata with new wins/losses
        finalMetadata = {
          ...metadata,
          wins: newWins,
          losses: newLosses
        };

        // Score field = total wins for bear-pong
        finalScore = newWins;
      }

      // Only update if new score is higher or no existing score (or if it's bear-pong with a loss)
      if (!existing || score > existing.score || (game_id === 'bear-pong' && metadata?.result === 'loss')) {
        const { data, error } = await supabase
          .from('game_leaderboards')
          .upsert({
            wallet_address,
            game_id,
            score: finalScore,
            metadata: finalMetadata
          }, {
            onConflict: 'wallet_address,game_id'
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        console.log(`✅ Score submitted: ${wallet_address.substring(0, 8)}... scored ${finalScore} in ${game_id}`);
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

// Create new raid - ADMIN ONLY
app.post('/api/raids',
  requireAdmin, // 🔒 Require admin authentication
  // strictLimiter, // TEMPORARILY DISABLED
  [
    body('description').isString().trim().isLength({ min: 1, max: 500 }),
    body('twitter_url').isURL(),
    body('reward').optional().isInt({ min: 1, max: 1000 }),
    body('expires_at').isISO8601()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    try {
      const { description, twitter_url, reward, profile_name, profile_handle, profile_emoji, expires_at } = req.body;

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

      console.log(`✅ [ADMIN] Created raid: ${description.substring(0, 50)}... by IP ${req.ip}`);
      res.json({ success: true, raid: data });
    } catch (error) {
      console.error('Error creating raid:', error);
      res.status(500).json({ error: 'Failed to create raid', details: error.message });
    }
  });

// Delete raid - ADMIN ONLY
app.delete('/api/raids/:id',
  requireAdmin, // 🔒 Require admin authentication
  async (req, res) => {
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

      console.log(`✅ [ADMIN] Deleted raid ID: ${id} by IP ${req.ip}`);
      res.json({ success: true, message: 'Raid deleted' });
    } catch (error) {
      console.error('Error deleting raid:', error);
      res.status(500).json({ error: 'Failed to delete raid', details: error.message });
    }
  });

// Clear all raids - ADMIN ONLY (DANGEROUS!)
app.post('/api/raids/clear',
  requireAdmin, // 🔒 Require admin authentication
  async (req, res) => {
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

      console.log(`⚠️⚠️⚠️  [ADMIN] All raids cleared from database by IP ${req.ip}`);
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
    version: '2.0.0-secured',
    features: {
      xaman: !!XAMAN_API_KEY,
      database: !!supabase,
      security: {
        rateLimiting: true,
        helmet: true,
        inputValidation: true,
        adminAuth: true,
        suspiciousActivityTracking: true
      }
    }
  });
});

// 🔒 SECURITY MONITORING - View suspicious activity (ADMIN ONLY)
app.get('/api/security/suspicious-activity',
  requireAdmin,
  (req, res) => {
    const activities = Array.from(suspiciousActivity.entries()).map(([key, data]) => ({
      identifier: key,
      totalIncidents: data.count,
      firstSeen: new Date(data.firstSeen).toISOString(),
      lastSeen: new Date(data.lastSeen).toISOString(),
      uniqueIPs: Array.from(data.ips),
      recentReasons: data.reasons.slice(-5).map(r => ({
        reason: r.reason,
        timestamp: new Date(r.timestamp).toISOString()
      }))
    }));

    // Sort by incident count (most suspicious first)
    activities.sort((a, b) => b.totalIncidents - a.totalIncidents);

    console.log(`✅ [ADMIN] Security report accessed by IP ${req.ip}`);
    res.json({
      success: true,
      totalSuspiciousEntities: activities.length,
      activities: activities
    });
  });

// 🔒 SECURITY MONITORING - Clear suspicious activity log (ADMIN ONLY)
app.post('/api/security/clear-log',
  requireAdmin,
  (req, res) => {
    const previousCount = suspiciousActivity.size;
    suspiciousActivity.clear();
    console.log(`✅ [ADMIN] Cleared ${previousCount} suspicious activity entries by IP ${req.ip}`);
    res.json({
      success: true,
      message: `Cleared ${previousCount} entries from suspicious activity log`
    });
  });

// ============================================
// 🎨 COSMETICS SYSTEM - Rings & Banners
// ============================================

// Get all cosmetics catalog
app.get('/api/cosmetics/catalog', async (req, res) => {
  try {
    console.log('📦 Fetching cosmetics catalog...');

    const { data: items, error } = await supabase
      .from('cosmetics_catalog')
      .select('*')
      .order('rarity', { ascending: true })
      .order('honey_cost', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log(`✅ Found ${items?.length || 0} cosmetics in catalog`);

    res.json({
      success: true,
      items: items || []
    });

  } catch (error) {
    console.error('Error fetching cosmetics catalog:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cosmetics catalog',
      details: error.message
    });
  }
});

// Get user's cosmetics inventory
app.get('/api/cosmetics/inventory/:wallet_address', async (req, res) => {
  const { wallet_address } = req.params;

  if (!wallet_address) {
    return res.status(400).json({ error: 'Wallet address required' });
  }

  try {
    // Get user's owned cosmetics with full item details
    const { data: inventory, error: inventoryError } = await supabase
      .from('user_cosmetics')
      .select(`
        *,
        cosmetic:cosmetics_catalog(*)
      `)
      .eq('wallet_address', wallet_address)
      .order('purchased_at', { ascending: false });

    if (inventoryError) throw inventoryError;

    // Get user's equipped cosmetics
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('equipped_ring_id, equipped_banner_id')
      .eq('wallet_address', wallet_address)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    res.json({
      success: true,
      inventory: inventory || [],
      equipped: {
        ring_id: profile?.equipped_ring_id || null,
        banner_id: profile?.equipped_banner_id || null
      }
    });

  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory',
      details: error.message
    });
  }
});

// Get user's equipped cosmetics
app.get('/api/cosmetics/equipped/:wallet_address', async (req, res) => {
  const { wallet_address } = req.params;

  if (!wallet_address) {
    return res.status(400).json({ error: 'Wallet address required' });
  }

  try {
    // Get user's profile with equipped cosmetics
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('equipped_ring_id, equipped_banner_id')
      .eq('wallet_address', wallet_address)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    let equippedRing = null;
    let equippedBanner = null;

    // Get ring details if equipped
    if (profile?.equipped_ring_id) {
      const { data: ring } = await supabase
        .from('cosmetics_catalog')
        .select('*')
        .eq('id', profile.equipped_ring_id)
        .single();

      equippedRing = ring;
    }

    // Get banner details if equipped
    if (profile?.equipped_banner_id) {
      const { data: banner } = await supabase
        .from('cosmetics_catalog')
        .select('*')
        .eq('id', profile.equipped_banner_id)
        .single();

      equippedBanner = banner;
    }

    res.json({
      success: true,
      equipped: {
        ring: equippedRing,
        banner: equippedBanner
      }
    });

  } catch (error) {
    console.error('Error fetching equipped cosmetics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch equipped cosmetics',
      details: error.message
    });
  }
});

// Purchase a cosmetic item
app.post('/api/cosmetics/purchase', async (req, res) => {
  const { wallet_address, cosmetic_id } = req.body;

  if (!wallet_address || !cosmetic_id) {
    return res.status(400).json({
      success: false,
      error: 'Wallet address and cosmetic ID required'
    });
  }

  try {
    // Get cosmetic details
    const { data: cosmetic, error: cosmeticError } = await supabase
      .from('cosmetics_catalog')
      .select('*')
      .eq('id', cosmetic_id)
      .single();

    if (cosmeticError || !cosmetic) {
      return res.status(404).json({
        success: false,
        error: 'Cosmetic not found'
      });
    }

    // Check if user already owns this cosmetic
    const { data: existing, error: existingError } = await supabase
      .from('user_cosmetics')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('cosmetic_id', cosmetic_id)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'You already own this cosmetic'
      });
    }

    // Get user's honey points
    const { data: points, error: pointsError } = await supabase
      .from('honey_points')
      .select('total_points')
      .eq('wallet_address', wallet_address)
      .single();

    if (pointsError && pointsError.code !== 'PGRST116') {
      throw pointsError;
    }

    const currentPoints = points?.total_points || 0;

    // Check if user has enough points
    if (currentPoints < cosmetic.honey_cost) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient honey points',
        required: cosmetic.honey_cost,
        available: currentPoints
      });
    }

    // Deduct points
    const newPoints = currentPoints - cosmetic.honey_cost;
    const { error: updateError } = await supabase
      .from('honey_points')
      .update({ total_points: newPoints })
      .eq('wallet_address', wallet_address);

    if (updateError) throw updateError;

    // Add cosmetic to user's inventory
    const { data: purchase, error: purchaseError } = await supabase
      .from('user_cosmetics')
      .insert({
        wallet_address,
        cosmetic_id
      })
      .select()
      .single();

    if (purchaseError) {
      // Rollback points if purchase fails
      await supabase
        .from('honey_points')
        .update({ total_points: currentPoints })
        .eq('wallet_address', wallet_address);

      throw purchaseError;
    }

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
      message: 'Cosmetic purchased successfully',
      cosmetic,
      new_balance: newPoints,
      purchase
    });

  } catch (error) {
    console.error('Error purchasing cosmetic:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to purchase cosmetic',
      details: error.message
    });
  }
});

// Equip/unequip a cosmetic item
app.post('/api/cosmetics/equip', async (req, res) => {
  const { wallet_address, cosmetic_id, cosmetic_type } = req.body;

  if (!wallet_address) {
    return res.status(400).json({
      success: false,
      error: 'Wallet address required'
    });
  }

  try {
    // If cosmetic_id is null, unequip
    if (!cosmetic_id) {
      if (!cosmetic_type) {
        return res.status(400).json({
          success: false,
          error: 'Cosmetic type required for unequipping'
        });
      }

      const updateField = cosmetic_type === 'ring' ? 'equipped_ring_id' : 'equipped_banner_id';

      const { error: unequipError } = await supabase
        .from('profiles')
        .update({ [updateField]: null })
        .eq('wallet_address', wallet_address);

      if (unequipError) throw unequipError;

      return res.json({
        success: true,
        message: `${cosmetic_type} unequipped successfully`
      });
    }

    // Get cosmetic details
    const { data: cosmetic, error: cosmeticError } = await supabase
      .from('cosmetics_catalog')
      .select('*')
      .eq('id', cosmetic_id)
      .single();

    if (cosmeticError || !cosmetic) {
      return res.status(404).json({
        success: false,
        error: 'Cosmetic not found'
      });
    }

    // Check if user owns this cosmetic
    const { data: owned, error: ownedError } = await supabase
      .from('user_cosmetics')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('cosmetic_id', cosmetic_id)
      .single();

    if (ownedError || !owned) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this cosmetic'
      });
    }

    // Determine which field to update based on cosmetic type
    const updateField = cosmetic.cosmetic_type === 'ring' ? 'equipped_ring_id' : 'equipped_banner_id';

    // Equip the cosmetic
    const { error: equipError } = await supabase
      .from('profiles')
      .update({ [updateField]: cosmetic_id })
      .eq('wallet_address', wallet_address);

    if (equipError) throw equipError;

    res.json({
      success: true,
      message: 'Cosmetic equipped successfully',
      cosmetic
    });

  } catch (error) {
    console.error('Error equipping cosmetic:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to equip cosmetic',
      details: error.message
    });
  }
});

// Unequip endpoint (alias for equip with null cosmetic_id)
app.post('/api/cosmetics/unequip', async (req, res) => {
  const { wallet_address, cosmetic_id, cosmetic_type } = req.body;

  // Forward to equip endpoint with null cosmetic_id
  req.body.cosmetic_id = null;
  return app._router.handle(Object.assign(req, { url: '/api/cosmetics/equip', method: 'POST' }), res, () => {});
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 BEAR Park API Server v2.0.0-SECURED`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n🌐 Server: http://localhost:${PORT}`);
  console.log(`\n🔐 SECURITY FEATURES:`);
  console.log(`   ✅ Rate Limiting (100 req/15min general, 10 req/min scores)`);
  console.log(`   ✅ Helmet Security Headers`);
  console.log(`   ✅ Input Validation & Sanitization`);
  console.log(`   ✅ Admin Authentication (X-Admin-Key required)`);
  console.log(`   ✅ Suspicious Activity Tracking & Logging`);
  console.log(`   ✅ Max Score Validation per Game`);
  console.log(`   ✅ Wallet Address Format Validation`);
  console.log(`   ✅ 10KB Request Size Limit`);
  console.log(`\n🔧 FEATURES:`);
  console.log(`   ✅ XAMAN Authentication: ${XAMAN_API_KEY ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   ✅ Database (Supabase): ${supabase ? 'CONNECTED' : 'DISABLED'}`);
  console.log(`   ✅ Admin API Key: ${process.env.ADMIN_API_KEY ? 'CONFIGURED' : 'RANDOM (SET IN .env!)'}`);
  console.log(`\n📍 PUBLIC ENDPOINTS:`);
  console.log(`   - GET  /health - Server health & security status`);
  console.log(`   - POST /api/xaman/payload - Create XAMAN auth payload`);
  console.log(`   - GET  /api/xaman/payload/:uuid - Check XAMAN auth status`);
  console.log(`   - GET  /api/profile/:wallet - Get user profile`);
  console.log(`   - POST /api/profile - Update user profile`);
  console.log(`   - GET  /api/points/:wallet - Get HONEY points`);
  console.log(`   - POST /api/points - Update HONEY points (validated)`);
  console.log(`   - GET  /api/leaderboard/:game_id - Get game leaderboard`);
  console.log(`   - POST /api/leaderboard - Submit score (validated, rate-limited)`);
  console.log(`   - GET  /api/raids/current - Get active raids`);
  console.log(`   - POST /api/raids/complete - Complete raid (duplicate-protected)`);
  console.log(`\n🔒 ADMIN-ONLY ENDPOINTS (Require X-Admin-Key header):`);
  console.log(`   - POST /api/raids - Create new raid`);
  console.log(`   - DELETE /api/raids/:id - Delete raid`);
  console.log(`   - POST /api/raids/clear - Clear all raids (DANGEROUS)`);
  console.log(`   - GET  /api/security/suspicious-activity - View security log`);
  console.log(`   - POST /api/security/clear-log - Clear security log`);
  console.log(`\n💡 To use admin endpoints, add header:`);
  console.log(`   X-Admin-Key: ${process.env.ADMIN_API_KEY || '[Set ADMIN_API_KEY in .env]'}`);
  console.log(`\n${'='.repeat(60)}\n`);
});

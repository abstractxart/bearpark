const path = require('path');
// BEARpark Backend Server - Raid Leaderboard & Streak System
// VERSION: 2.2.0 - Server-side BEARdrops whitelist verification (SECURITY)
const SERVER_VERSION = '2.2.0';
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
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required for Railway/reverse proxies to properly identify user IPs
app.set('trust proxy', true);

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

// Initialize Supabase (public client - respects RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
console.log('✅ Supabase initialized:', process.env.SUPABASE_URL);

// Initialize Supabase Admin Client (bypasses RLS for admin operations)
let supabaseAdmin = null;
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  console.log('✅ Supabase Admin Client initialized (bypasses RLS)');
} else {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not set - Admin operations may fail');
}

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
    // SECURITY: Don't log API credentials - removed for audit compliance
    xumm = new XummSdk(XAMAN_API_KEY, XAMAN_API_SECRET);
    console.log('✅ XAMAN SDK initialized successfully');
  }
} catch (error) {
  console.error('❌ Failed to initialize XAMAN SDK:', error.message);
}

// Middleware
// IMPORTANT: Trust proxy headers from Vercel/Railway for correct client IP detection
// This ensures rate limiting works per-user, not per-proxy-server
app.set('trust proxy', true);
console.log('✅ Trust proxy enabled for correct IP detection behind Vercel/Railway');

// Enable gzip compression for all responses (80% file size reduction)
app.use(compression());

// Rate limiting to prevent API abuse and brute force attacks
// SECURITY: Enabled for audit compliance
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 300, // 300 requests per minute per IP (5 per second - allows normal use, blocks spam)
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // Use X-Forwarded-For header to get real client IP
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  },
  // Skip rate limiting for admin endpoints - admins need unrestricted access
  skip: (req) => {
    return req.path.startsWith('/api/admin/');
  }
});
app.use('/api/', apiLimiter);
console.log('✅ Rate limiting enabled: 300 requests/minute per real client IP');

// ========== CRITICAL: STRICT RATE LIMITER FOR CLAIM ENDPOINT ==========
// Prevents rapid-fire claim attempts (race condition exploit protection)
const claimRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 3, // Maximum 3 claim attempts per minute per IP
  message: {
    success: false,
    error: 'Too many claim attempts. Please wait 1 minute before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by BOTH IP and wallet address for extra protection
    const wallet = req.body?.wallet_address || 'unknown';
    return `${req.ip}-${wallet}`;
  }
});
console.log('✅ Strict rate limiter enabled for /api/beardrops/claim (3 req/min)');

app.use(cors({
  origin: [FRONTEND_URL, 'https://bearpark.xyz', 'https://www.bearpark.xyz', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json());

// ===== SECURITY: SAFE ERROR HANDLER =====
// AUDIT COMPLIANCE: Never expose internal error details to clients
function safeErrorResponse(res, error, statusCode = 500, publicMessage = 'Internal server error') {
  // Log full error for debugging (server-side only)
  console.error('[ERROR]', error);
  // Return generic message to client (no stack traces or DB details)
  return res.status(statusCode).json({ success: false, error: publicMessage });
}

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

    // Check database for actual admin role (use service role to bypass RLS)
    const adminClient = supabaseAdmin || supabase;
    const { data: adminRole, error } = await adminClient
      .from('admin_roles')
      .select('role, is_active')
      .eq('wallet_address', admin_wallet)
      .eq('is_active', true)
      .single();

    if (error || !adminRole) {
      console.warn(`🚫 Unauthorized admin access attempt by: ${admin_wallet}`);
      console.warn(`   Database error: ${error?.message || 'No error'}`);
      console.warn(`   Admin role found: ${adminRole ? 'yes' : 'no'}`);
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
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
      .select('score, metadata')
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
      // 🎯 BEAR PONG SPECIAL CASE: Always update metadata (wins/losses) even if wins didn't increase
      // For bear-pong, score = wins. When you lose, wins stay same but losses need to increment!
      if (game_id === 'bear-pong') {
        console.log(`🏓 Bear Pong: Updating metadata (wins/losses)`);

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
          console.error('Error updating Bear Pong stats:', updateError);
          return res.status(500).json({ success: false, error: updateError.message });
        }

        // Mark as high score only if wins increased
        is_high_score = score > existingScore.score;
        result = data;
      }
      // User has existing score - only update if new score is higher (for non-bear-pong games)
      else if (score > existingScore.score) {
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
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
    }

    res.json({
      success: true,
      total_points: data?.total_points || 0,
      raiding_points: data?.raiding_points || 0,
      games_points: data?.games_points || 0
    });
  } catch (error) {
    console.error('Error in points endpoint:', error);
    safeErrorResponse(res, error);
  }
});

// Get 24h Rolling Honey Points (for BEARDROPS eligibility)
app.get('/api/honey-points/24h', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }
    // Calculate midnight UTC for daily reset
    const midnightUTC = new Date();
    midnightUTC.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('honey_points_activity')
      .select('points')
      .eq('wallet_address', wallet)
      .gte('created_at', midnightUTC.toISOString());
    if (error) {
      return safeErrorResponse(res, error);
    }
    const points = data?.reduce((sum, row) => sum + parseFloat(row.points || 0), 0) || 0;
    res.json({ success: true, wallet, points });
  } catch (error) {
    safeErrorResponse(res, error);
  }
});

// ❌ DISABLED - CRITICAL SECURITY EXPLOIT!
// This endpoint allowed ANY user to set ANY honey points value by sending fake data
// NEVER TRUST CLIENT-SUBMITTED POINT VALUES!
// Points are now ONLY awarded through:
// - /api/raids/complete (for raiding points)
// - /api/games/complete (for game points)
// - Admin endpoints with verifyAdmin middleware
app.post('/api/points', validateWallet, validateAmount, async (req, res) => {
  // ENDPOINT DISABLED FOR SECURITY
  return res.status(403).json({
    success: false,
    error: 'This endpoint has been disabled for security. Points are awarded automatically through game/raid completion.'
  });
});

// Helper function to fetch tweet thumbnail automatically using Microlink API
async function fetchTweetThumbnail(twitterUrl) {
  try {
    // Use Microlink API - free and reliable for extracting Twitter/X images
    const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(twitterUrl)}`;
    console.log('Fetching thumbnail via Microlink for:', twitterUrl);

    const response = await fetch(microlinkUrl, {
      headers: { 'User-Agent': 'BearPark/1.0' }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === 'success' && data.data) {
        // Try to get image from the response
        if (data.data.image && data.data.image.url) {
          console.log('✅ Found image via Microlink:', data.data.image.url);
          return data.data.image.url;
        }
        // Fallback to logo if no image
        if (data.data.logo && data.data.logo.url) {
          console.log('✅ Found logo via Microlink:', data.data.logo.url);
          return data.data.logo.url;
        }
      }
    }

    console.log('Microlink did not return an image');
    return null;
  } catch (error) {
    console.log('Error fetching tweet thumbnail:', error.message);
    return null;
  }
}

// Create New Raid
app.post('/api/raids', verifyAdmin, validateTwitterURL, validateAmount, validateTextLengths, async (req, res) => {
  try {
    const { description, twitter_url, reward, profile_name, profile_handle, profile_emoji, expires_at, image_url: manualImageUrl } = req.body;

    console.log('Received raid data:', req.body);

    if (!description || !twitter_url || !reward || !profile_handle || !expires_at) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: description, twitter_url, reward, profile_handle, expires_at'
      });
    }

    // Helper to check if image URL is valid (not a Twitter emoji SVG)
    const isValidImageUrl = (url) => {
      if (!url) return false;
      const badPatterns = ['twimg.com/emoji', 'abs-0.twimg.com', '/emoji/v2/', '/svg/'];
      return !badPatterns.some(p => url.includes(p));
    };

    // Use manual image URL if provided, otherwise try auto-fetch
    let thumbnailUrl = null;
    if (manualImageUrl && isValidImageUrl(manualImageUrl)) {
      thumbnailUrl = manualImageUrl;
      console.log('✅ Using manual image URL:', thumbnailUrl);
    } else {
      // Try to automatically fetch tweet thumbnail
      try {
        const autoFetched = await fetchTweetThumbnail(twitter_url);
        if (autoFetched && isValidImageUrl(autoFetched)) {
          thumbnailUrl = autoFetched;
          console.log('✅ Auto-fetched tweet thumbnail:', thumbnailUrl);
        } else if (autoFetched) {
          console.log('⚠️ Auto-fetched URL is invalid (Twitter emoji/icon):', autoFetched);
        }
      } catch (e) {
        console.log('Could not fetch tweet thumbnail:', e.message);
      }
    }

    const now = new Date();

    // Insert new raid - matching actual database schema
    const raidData = {
      description: description,
      twitter_url: twitter_url,
      reward: reward,
      profile_name: profile_name || 'BearXRPL',
      profile_handle: profile_handle,
      profile_emoji: profile_emoji || '🐻',
      expires_at: expires_at,
      is_active: true
    };

    // Add thumbnail if found (either manual or auto-fetched)
    if (thumbnailUrl) {
      raidData.image_url = thumbnailUrl;
    }

    const { data, error } = await supabase
      .from('raids')
      .insert([raidData])
      .select()
      .single();

    if (error) {
      console.error('Error creating raid:', error);
      return safeErrorResponse(res, error);
    }

    console.log('✅ Raid created successfully:', data);
    res.json({ success: true, raid: data });
  } catch (error) {
    console.error('Error in create raid endpoint:', error);
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
    }

    res.json({ success: true, raids: data || [] });
  } catch (error) {
    console.error('Error in get raids endpoint:', error);
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
    }

    res.json({ success: true, raids: data || [] });
  } catch (error) {
    console.error('Error in get all raids endpoint:', error);
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
    }

    console.log(`✅ Raid ${id} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in delete raid endpoint:', error);
    safeErrorResponse(res, error);
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

// Get Raid Leaderboard (top raiders by points)
app.get('/api/raids/leaderboard', async (req, res) => {
  try {
    // Query raid_completions to get total points per user
    const { data, error } = await supabase
      .from('raid_completions')
      .select('wallet_address, points_awarded');

    if (error) {
      console.error('Error fetching raid leaderboard:', error);
      return res.json({ success: true, leaderboard: [] });
    }

    // Aggregate points by wallet
    const userStats = {};
    data.forEach(completion => {
      if (!userStats[completion.wallet_address]) {
        userStats[completion.wallet_address] = {
          wallet_address: completion.wallet_address,
          total_points: 0,
          total_raids: 0
        };
      }
      userStats[completion.wallet_address].total_points += completion.points_awarded || 0;
      userStats[completion.wallet_address].total_raids += 1;
    });

    // Get all unique wallet addresses
    const walletAddresses = Object.keys(userStats);

    // Fetch profile data for all raiders
    if (walletAddresses.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('wallet_address, display_name, avatar_nft')
        .in('wallet_address', walletAddresses);

      if (!profileError && profiles) {
        // Merge profile data with stats
        profiles.forEach(profile => {
          if (userStats[profile.wallet_address]) {
            userStats[profile.wallet_address].display_name = profile.display_name;
            userStats[profile.wallet_address].avatar_nft = profile.avatar_nft;
          }
        });
      }
    }

    // Convert to array and sort by points (descending)
    const leaderboard = Object.values(userStats)
      .sort((a, b) => b.total_points - a.total_points);

    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error('Error in raid leaderboard endpoint:', error);
    res.json({ success: true, leaderboard: [] });
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

    // Log to honey_points_activity for BEARDROPS 24h tracking
    // Use supabaseAdmin to bypass RLS policies
    const activityClient = supabaseAdmin || supabase;
    try {
      const { data, error } = await activityClient.from('honey_points_activity').insert({
        wallet_address,
        points: points_awarded,
        activity_type: 'raid',
        activity_id: raid_id
      }).select();
      if (error) {
        console.error('❌ RAID activity insert failed:', error.message, error.code, error.details);
      } else {
        console.log('✅ RAID activity logged:', wallet_address, points_awarded, 'pts');
      }
    } catch (e) {
      console.error('❌ RAID activity insert exception:', e.message);
    }

    res.json({
      success: true,
      alreadyCompleted: false,
      message: 'Points awarded successfully',
      points_awarded
    });

  } catch (error) {
    console.error('Error recording raid completion:', error);
    safeErrorResponse(res, error);
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

    const MAX_DAILY_MINUTES = 123; // 123 minutes per day max
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

      // Log to honey_points_activity for BEARDROPS 24h tracking
      // Use supabaseAdmin to bypass RLS policies
      if (result.points_awarded > 0) {
        const activityClient = supabaseAdmin || supabase;
        try {
          const { data, error } = await activityClient.from('honey_points_activity').insert({
            wallet_address,
            points: result.points_awarded,
            activity_type: 'game',
            activity_id: game_id
          }).select();
          if (error) {
            console.error('❌ GAME activity insert failed:', error.message, error.code, error.details);
          } else {
            console.log('✅ GAME activity logged:', wallet_address, result.points_awarded, 'pts for', game_id);
          }
        } catch (e) {
          console.error('❌ GAME activity insert exception:', e.message);
        }
      }

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
    safeErrorResponse(res, error);
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
        return safeErrorResponse(res, error);
      }

      const MAX_DAILY_MINUTES = 123;
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

    const MAX_DAILY_MINUTES = 123;
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
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
  }
});

// ===== PONG BETTING ENDPOINT (SECURE) =====
// Process Pong betting transaction - ALL calculations done SERVER-SIDE
// Client sends ONLY: win/loss result and bet amount
// Server calculates and updates points - NEVER trusts client values
app.post('/api/pong/betting', validateWallet, async (req, res) => {
  try {
    const { wallet_address, did_win, bet_amount } = req.body;

    console.log(`🎮 [PONG BETTING] Processing - wallet: ${wallet_address}, win: ${did_win}, bet: ${bet_amount}`);

    // Validation
    if (!wallet_address || did_win === undefined || bet_amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, did_win, bet_amount'
      });
    }

    if (bet_amount < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bet amount - must be non-negative'
      });
    }

    // If bet is 0, no transaction needed
    if (bet_amount === 0) {
      console.log(`💰 [PONG BETTING] Bet is 0 - no transaction needed`);
      return res.json({
        success: true,
        message: 'No bet - no transaction',
        new_total: 0,
        new_games_points: 0
      });
    }

    // 🔒 STEP 1: Fetch current points from DATABASE (single source of truth)
    const { data: currentPoints, error: fetchError } = await supabase
      .from('honey_points')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('❌ [PONG BETTING] Error fetching points:', fetchError);
      return res.status(500).json({ success: false, error: 'Failed to fetch current points' });
    }

    const currentRaidingPoints = currentPoints?.raiding_points || 0;
    const currentGamesPoints = currentPoints?.games_points || 0;
    const currentTotalPoints = currentPoints?.total_points || 0;

    console.log(`💰 [PONG BETTING] Current: Raiding=${currentRaidingPoints}, Games=${currentGamesPoints}, Total=${currentTotalPoints}`);

    // 🔒 STEP 2: Calculate new points SERVER-SIDE (NEVER trust client!)
    let newGamesPoints;

    if (did_win) {
      // Winner: Add bet amount to games_points
      newGamesPoints = currentGamesPoints + bet_amount;
      console.log(`💰 [PONG BETTING] WIN: ${currentGamesPoints} + ${bet_amount} = ${newGamesPoints}`);
    } else {
      // Loser: Subtract bet amount from games_points (can't go below 0)
      newGamesPoints = Math.max(0, currentGamesPoints - bet_amount);
      console.log(`💰 [PONG BETTING] LOSS: ${currentGamesPoints} - ${bet_amount} = ${newGamesPoints}`);
    }

    // Calculate new total = raiding + games
    const newTotalPoints = currentRaidingPoints + newGamesPoints;

    console.log(`💰 [PONG BETTING] New total: ${currentRaidingPoints} (raiding) + ${newGamesPoints} (games) = ${newTotalPoints}`);

    // 🔒 STEP 3: Update database with SERVER-CALCULATED values
    const { data: updatedPoints, error: updateError } = await supabase
      .from('honey_points')
      .upsert({
        wallet_address,
        total_points: newTotalPoints,
        raiding_points: currentRaidingPoints, // Preserve raiding points
        games_points: newGamesPoints,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      })
      .select()
      .single();

    if (updateError) {
      console.error('❌ [PONG BETTING] Error updating points:', updateError);
      return res.status(500).json({ success: false, error: 'Failed to update points' });
    }

    console.log(`✅ [PONG BETTING] Transaction complete! New total: ${newTotalPoints} HONEY`);

    res.json({
      success: true,
      message: did_win ? 'Bet won! Points added.' : 'Bet lost. Points deducted.',
      new_total: newTotalPoints,
      new_games_points: newGamesPoints,
      new_raiding_points: currentRaidingPoints,
      change: did_win ? `+${bet_amount}` : `-${bet_amount}`
    });

  } catch (error) {
    console.error('❌ [PONG BETTING] Error:', error);
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
      return safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
          `SELECT
            pc.*,
            COALESCE(p.display_name, pc.commenter_name, 'Anonymous') as commenter_name,
            COALESCE(p.avatar_nft, pc.commenter_avatar) as commenter_avatar
          FROM profile_comments pc
          LEFT JOIN profiles p ON pc.commenter_wallet = p.wallet_address
          WHERE pc.profile_wallet = $1
          ORDER BY pc.created_at DESC`,
          [wallet]
        );
        comments = result.rows || [];
        console.log(`✅ [pgPool] Fetched ${comments.length} comments for ${wallet}`);
      } else {
        throw new Error('pgPool not available');
      }
    } catch (pgError) {
      console.warn(`⚠️ pgPool failed (${pgError.message}), falling back to Supabase...`);

      // Supabase doesn't support LEFT JOIN in the same way, so we'll fetch and enrich manually
      const { data: commentsData, error: commentsError } = await supabase
        .from('profile_comments')
        .select('*')
        .eq('profile_wallet', wallet)
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;

      // Enrich comments with current profile data
      comments = await Promise.all((commentsData || []).map(async (comment) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_nft')
          .eq('wallet_address', comment.commenter_wallet)
          .single();

        return {
          ...comment,
          commenter_name: profile?.display_name || comment.commenter_name || 'Anonymous',
          commenter_avatar: profile?.avatar_nft || comment.commenter_avatar
        };
      }));

      console.log(`✅ [Supabase] Fetched ${comments.length} comments for ${wallet}`);
    }

    res.json({ success: true, comments: comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    safeErrorResponse(res, error);
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

    // Send notification to profile owner or parent comment author
    try {
      if (parent_id) {
        // This is a reply to another comment
        // Get the parent comment to find the author
        const { data: parentComment, error: parentError } = await supabase
          .from('profile_comments')
          .select('commenter_wallet, commenter_name, commenter_avatar')
          .eq('id', parent_id)
          .single();

        if (!parentError && parentComment && parentComment.commenter_wallet !== commenter_wallet) {
          // Send notification to parent comment author (don't notify yourself)
          await supabase
            .from('notifications')
            .insert({
              wallet_address: parentComment.commenter_wallet,
              type: 'profile_reply',
              data: {
                profileWallet: profile_wallet,
                commentId: data.id,
                commentText: comment_text.substring(0, 100),
                displayName: commenter_name || 'Anonymous',
                wallet: commenter_wallet,
                avatarNft: commenter_avatar
              },
              read: false
            });
          console.log(`✅ Sent profile_reply notification to ${parentComment.commenter_wallet}`);
        }
      } else {
        // This is a top-level comment on the profile
        if (profile_wallet !== commenter_wallet) {
          // Send notification to profile owner (don't notify yourself)
          await supabase
            .from('notifications')
            .insert({
              wallet_address: profile_wallet,
              type: 'profile_comment',
              data: {
                profileWallet: profile_wallet,
                commentId: data.id,
                commentText: comment_text.substring(0, 100),
                displayName: commenter_name || 'Anonymous',
                wallet: commenter_wallet,
                avatarNft: commenter_avatar
              },
              read: false
            });
          console.log(`✅ Sent profile_comment notification to ${profile_wallet}`);
        }
      }
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
      // Don't fail the request if notification fails
    }

    res.json({ success: true, comment: data });
  } catch (error) {
    console.error('Error posting comment:', error);
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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

// ===== BEARDROPS WHITELIST (SERVER-SIDE) =====
// SECURITY: Whitelist is stored server-side only - cannot be manipulated via browser console
const BEARDROPS_WHITELIST = [
  'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT'.toLowerCase(),
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub'.toLowerCase(),
  'rGRuuisahMW6pcWMLVFP1Qtb7YieN5oVR6'.toLowerCase(),
  'rG4NCL8TmAx59euPf2GQjuqQVVfDFtWfTR'.toLowerCase(),
  'rnf92YvLeFTcMwqpcMzqM5Xh4qgKxYyRJv'.toLowerCase()
];

// Verify if wallet is eligible for BEARdrops (server-side check)
app.get('/api/beardrops/eligible', async (req, res) => {
  try {
    const wallet = req.query.wallet;
    if (!wallet) {
      return res.status(400).json({ eligible: false, error: 'Wallet address required' });
    }

    // Server-side whitelist check - cannot be bypassed
    const isWhitelisted = BEARDROPS_WHITELIST.includes(wallet.toLowerCase());

    if (!isWhitelisted) {
      return res.json({ eligible: false, reason: 'not_whitelisted' });
    }

    // Whitelist is sufficient - no additional checks needed
    return res.json({ eligible: true, wallet: wallet });
  } catch (error) {
    console.error('Error checking BEARdrops eligibility:', error);
    return res.status(500).json({ eligible: false, error: 'Server error' });
  }
});

// ===== MERCH STORE API =====
const crypto = require('crypto');

// Encryption for sensitive shipping data
const MERCH_ENCRYPTION_KEY = process.env.MERCH_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function encryptData(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MERCH_ENCRYPTION_KEY.slice(0, 32), 'utf8'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(text) {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(MERCH_ENCRYPTION_KEY.slice(0, 32), 'utf8'), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null;
  }
}

// Merch products (in-memory for now, can move to DB later)
const MERCH_PRODUCTS = {
  'pocket-jester': {
    id: 'pocket-jester',
    name: 'POCKET JESTER',
    price_usd: 30,
    sizes: { S: 10, M: 15, L: 20, XL: 15, XXL: 10 }
  }
};

// Get all merch products
app.get('/api/merch/products', async (req, res) => {
  try {
    // Fetch directly from database for accurate inventory
    const { data, error } = await supabaseAdmin
      .from('merch_inventory')
      .select('*');

    if (error) {
      console.error('Error fetching products from DB:', error);
      // Fallback to in-memory if DB fails
      return res.json({
        success: true,
        products: Object.values(MERCH_PRODUCTS)
      });
    }

    // Transform DB data to match expected format
    const products = data.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      price_usd: parseFloat(item.price),
      sizes: item.stock || { S: 0, M: 0, L: 0, XL: 0, '2XL': 0 },
      images: item.images || []
    }));

    // Also sync in-memory cache
    products.forEach(p => {
      MERCH_PRODUCTS[p.id] = p;
    });

    res.json({
      success: true,
      products
    });
  } catch (err) {
    console.error('Error in /api/merch/products:', err);
    res.json({
      success: true,
      products: Object.values(MERCH_PRODUCTS)
    });
  }
});

// Create merch order (supports multiple items)
app.post('/api/merch/orders', async (req, res) => {
  try {
    const { wallet_address, items, items_summary, total_amount, product_id, size, payment_method, shipping } = req.body;

    if (!wallet_address || !shipping) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Handle multi-item or single item order
    let orderItems = [];
    let orderTotal = 0;
    let primaryProductId = product_id;
    let primarySize = size;

    if (items && items.length > 0) {
      // Multi-item order
      orderItems = items;
      orderTotal = total_amount || items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      primaryProductId = items[0].product_id;
      primarySize = items[0].size;

      // Validate all items exist and have stock
      for (const item of items) {
        const product = MERCH_PRODUCTS[item.product_id];
        if (!product) {
          return res.status(404).json({ success: false, error: `Product not found: ${item.product_id}` });
        }
        if (!product.sizes[item.size] || product.sizes[item.size] < item.quantity) {
          return res.status(400).json({ success: false, error: `Insufficient stock for ${item.name} size ${item.size}` });
        }
      }
    } else {
      // Legacy single item order
      if (!product_id || !size) {
        return res.status(400).json({ success: false, error: 'Missing product_id or size' });
      }

      const product = MERCH_PRODUCTS[product_id];
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      if (!product.sizes[size] || product.sizes[size] <= 0) {
        return res.status(400).json({ success: false, error: 'Size not available' });
      }

      orderItems = [{
        product_id,
        name: product.name,
        size,
        quantity: 1,
        price: product.price_usd,
        image: product.images?.[0] || ''
      }];
      orderTotal = product.price_usd;
    }

    // Generate order number
    const orderNumber = `BEAR-${Date.now().toString(36).toUpperCase()}`;
    const orderId = crypto.randomUUID();

    // Generate items summary if not provided
    const finalItemsSummary = items_summary || orderItems.map(item =>
      `${item.quantity}x ${item.name} (${item.size})`
    ).join(' | ');

    // Encrypt shipping data
    const encryptedShipping = {
      name: encryptData(shipping.name),
      street: encryptData(shipping.street),
      apt: shipping.apt ? encryptData(shipping.apt) : null,
      city: encryptData(shipping.city),
      state: shipping.state,
      zip: encryptData(shipping.zip),
      country: shipping.country
    };

    // Store order in Supabase
    const orderData = {
      id: orderId,
      order_number: orderNumber,
      wallet_address,
      product_id: primaryProductId,
      product_name: orderItems[0].name,
      size: primarySize,
      items: JSON.stringify(orderItems),
      items_summary: finalItemsSummary,
      payment_method: payment_method || 'RLUSD',
      amount_usd: orderTotal,
      shipping_name_encrypted: encryptedShipping.name,
      shipping_street_encrypted: encryptedShipping.street,
      shipping_apt_encrypted: encryptedShipping.apt,
      shipping_city_encrypted: encryptedShipping.city,
      shipping_state: encryptedShipping.state,
      shipping_zip_encrypted: encryptedShipping.zip,
      shipping_country: encryptedShipping.country,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const { error: insertError } = await supabaseAdmin.from('merch_orders').insert(orderData);

    if (insertError) {
      console.error('Error creating merch order:', insertError);
      return res.status(500).json({ success: false, error: 'Failed to create order' });
    }

    // Reserve stock for all items
    for (const item of orderItems) {
      // Update in-memory stock
      if (MERCH_PRODUCTS[item.product_id]) {
        MERCH_PRODUCTS[item.product_id].sizes[item.size] -= item.quantity;
      }

      // Update database inventory
      try {
        const dbSize = item.size === 'XXL' ? '2XL' : item.size;

        const { data: invData, error: invError } = await supabaseAdmin
          .from('merch_inventory')
          .select('stock')
          .eq('id', item.product_id)
          .single();

        if (!invError && invData && invData.stock) {
          const currentStock = invData.stock;
          if (currentStock[dbSize] !== undefined && currentStock[dbSize] >= item.quantity) {
            currentStock[dbSize] -= item.quantity;

            await supabaseAdmin
              .from('merch_inventory')
              .update({ stock: currentStock, updated_at: new Date().toISOString() })
              .eq('id', item.product_id);

            console.log(`📦 Inventory updated: ${item.product_id} size ${dbSize} now has ${currentStock[dbSize]} stock`);
          }
        }
      } catch (invUpdateError) {
        console.error('Warning: Failed to update inventory for', item.product_id, invUpdateError);
      }
    }

    console.log(`🛒 Order created: ${orderNumber} with ${orderItems.length} item(s), total: $${orderTotal} for ${wallet_address}`);

    res.json({
      success: true,
      order_id: orderId,
      order_number: orderNumber,
      items_count: orderItems.length,
      total: orderTotal,
      items_summary: finalItemsSummary,
      message: 'Order created, awaiting payment'
    });

  } catch (error) {
    console.error('Error creating merch order:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Request payment for merch order - uses destination tag approach (no XUMM SDK needed)
app.post('/api/merch/request-payment', async (req, res) => {
  try {
    const { order_id, payment_method, amount_usd, xrp_price } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, error: 'Order ID required' });
    }

    // Get order from DB
    const { data: order, error: orderError } = await supabaseAdmin
      .from('merch_orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // RLUSD issuer on mainnet
    const RLUSD_ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
    const MERCH_WALLET = process.env.MERCH_WALLET || 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9';

    // Generate destination tag from order number (numeric part only)
    // Order numbers are like "BEAR-001234" - extract the numeric part
    const orderNumMatch = order.order_number.match(/(\d+)/);
    const destinationTag = orderNumMatch ? parseInt(orderNumMatch[1]) : Math.floor(Date.now() / 1000);

    let paymentAmount;
    let paymentCurrency;
    let xrpAmount = null;

    if (payment_method === 'RLUSD') {
      paymentAmount = parseFloat(amount_usd).toFixed(2);
      paymentCurrency = 'RLUSD';
    } else {
      // XRP payment
      xrpAmount = (amount_usd / xrp_price).toFixed(6);
      paymentAmount = xrpAmount;
      paymentCurrency = 'XRP';
    }

    // Update order with destination tag and payment details
    await supabaseAdmin
      .from('merch_orders')
      .update({
        destination_tag: destinationTag,
        payment_currency: paymentCurrency,
        payment_amount: paymentAmount,
        xrp_price_at_order: xrp_price
      })
      .eq('id', order_id);

    console.log(`✅ Payment request for order ${order.order_number}: ${paymentAmount} ${paymentCurrency} to ${MERCH_WALLET} with tag ${destinationTag}`);

    // Try to create XUMM payload for seamless payment (both XRP and RLUSD)
    let xummPayload = null;
    if (xumm) {
      try {
        let txAmount;

        if (payment_method === 'RLUSD') {
          // RLUSD is a token - use hex format (tested and working)
          // RLUSD in hex: R=52, L=4C, U=55, S=53, D=44, padded to 40 chars
          const RLUSD_HEX = '524C555344000000000000000000000000000000';
          txAmount = {
            currency: RLUSD_HEX,
            value: paymentAmount,
            issuer: RLUSD_ISSUER
          };
        } else {
          // XRP - amount in drops (1 XRP = 1,000,000 drops)
          txAmount = Math.round(parseFloat(paymentAmount) * 1000000).toString();
        }

        const payload = await xumm.payload.create({
          txjson: {
            TransactionType: 'Payment',
            Destination: MERCH_WALLET,
            Amount: txAmount,
            DestinationTag: destinationTag
          },
          options: {
            expire: 30, // 30 minutes
            return_url: {
              web: `https://www.bearpark.xyz/?merch_order=${order.order_number}`
            }
          },
          custom_meta: {
            identifier: `merch-${order.order_number}`,
            instruction: `Pay ${paymentAmount} ${paymentCurrency} for BEAR Park merch order ${order.order_number}`
          }
        });

        if (payload && payload.uuid) {
          xummPayload = {
            uuid: payload.uuid,
            qr_png: payload.refs?.qr_png,
            next_url: payload.next?.always,
            websocket_url: payload.refs?.websocket_status
          };
          console.log(`✅ XUMM payload created for ${paymentCurrency}: ${payload.uuid}`);
        }
      } catch (xummError) {
        console.error(`⚠️ XUMM payload creation failed for ${paymentCurrency}, falling back to manual:`, xummError.message);
      }
    }

    // Return payment instructions to frontend
    res.json({
      success: true,
      payment_method: xummPayload ? 'xumm' : 'direct',
      xumm_payload: xummPayload,
      destination_address: MERCH_WALLET,
      destination_tag: destinationTag,
      amount: paymentAmount,
      currency: paymentCurrency,
      issuer: payment_method === 'RLUSD' ? RLUSD_ISSUER : null,
      order_number: order.order_number,
      instructions: `Send ${paymentAmount} ${paymentCurrency} to ${MERCH_WALLET} with destination tag ${destinationTag}`
    });

  } catch (error) {
    console.error('❌ Error creating payment request:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment request',
      details: error.message
    });
  }
});

// Get order status
app.get('/api/merch/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order, error } = await supabaseAdmin
      .from('merch_orders')
      .select('status, order_number, payment_tx_hash')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({
      success: true,
      status: order.status,
      order_number: order.order_number,
      tx_hash: order.payment_tx_hash
    });

  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get user's merch orders
app.get('/api/merch/orders/wallet/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    const { data: orders, error } = await supabaseAdmin
      .from('merch_orders')
      .select('id, order_number, product_id, size, amount_usd, status, created_at, tracking_number')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Add product names and images from inventory
    const ordersWithDetails = (orders || []).map(order => {
      const product = MERCH_PRODUCTS[order.product_id];
      return {
        ...order,
        product_name: product?.name || order.product_id || 'Merch Item',
        product_image: product?.images?.[0] || null
      };
    });

    res.json({
      success: true,
      orders: ordersWithDetails
    });

  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Alternative endpoint for my-orders (query param)
app.get('/api/merch/orders/my-orders', async (req, res) => {
  try {
    const wallet = req.query.wallet;
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('merch_orders')
      .select('id, order_number, product_id, size, amount_usd, status, created_at, tracking_number')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Add product names and images from inventory
    const ordersWithDetails = (orders || []).map(order => {
      const product = MERCH_PRODUCTS[order.product_id];
      return {
        ...order,
        product_name: product?.name || order.product_id || 'Merch Item',
        product_image: product?.images?.[0] || null
      };
    });

    res.json({
      success: true,
      orders: ordersWithDetails
    });

  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin: Update order status (for fulfillment)
app.patch('/api/merch/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, tracking_number } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (tracking_number) {
      updateData.tracking_number = tracking_number;
      updateData.shipped_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from('merch_orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) {
      throw error;
    }

    res.json({ success: true, message: 'Order updated' });

  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Merch admin wallet whitelist
const MERCH_ADMIN_WALLETS = [
  'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT'.toLowerCase() // MUKT wallet
];

// Admin session storage (in-memory, expires after 30 min)
const adminSessions = new Map();
const ADMIN_SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

// Clean expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions) {
    if (now > session.expires) {
      adminSessions.delete(token);
    }
  }
}, 60000); // Check every minute

// ============================================
// MERCH PAYMENT MONITOR - Watch for incoming payments
// ============================================
const MERCH_WALLET = process.env.MERCH_WALLET || 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9';
const MERCH_WALLET_SECRET = process.env.MERCH_WALLET_SECRET; // Required for auto-conversion
const RLUSD_ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const AUTO_CONVERT_XRP = process.env.AUTO_CONVERT_XRP === 'true'; // Enable XRP → RLUSD auto-conversion

// ============================================
// XRP TO RLUSD AUTO-CONVERSION (XRPL DEX)
// ============================================
async function convertXrpToRlusd(xrpAmount, orderNumber) {
  if (!MERCH_WALLET_SECRET) {
    console.log('⚠️ MERCH_WALLET_SECRET not set - skipping auto-conversion');
    return { success: false, reason: 'no_secret' };
  }

  if (!AUTO_CONVERT_XRP) {
    console.log('⚠️ AUTO_CONVERT_XRP disabled - skipping conversion');
    return { success: false, reason: 'disabled' };
  }

  const xrpl = require('xrpl');
  const client = new xrpl.Client('wss://xrplcluster.com');

  try {
    await client.connect();
    console.log(`💱 Converting ${xrpAmount} XRP to RLUSD for order ${orderNumber}...`);

    // Create wallet from secret
    const wallet = xrpl.Wallet.fromSecret(MERCH_WALLET_SECRET);

    // Get current XRP/RLUSD rate from order book
    const orderBook = await client.request({
      command: 'book_offers',
      taker_gets: { currency: 'RLUSD', issuer: RLUSD_ISSUER },
      taker_pays: { currency: 'XRP' },
      limit: 10
    });

    // Calculate expected RLUSD based on best offer (with 2% slippage tolerance)
    let expectedRlusd = 0;
    if (orderBook.result.offers && orderBook.result.offers.length > 0) {
      const bestOffer = orderBook.result.offers[0];
      const xrpPerRlusd = parseInt(bestOffer.TakerPays) / 1000000 / parseFloat(bestOffer.TakerGets.value);
      expectedRlusd = (xrpAmount / xrpPerRlusd) * 0.98; // 2% slippage buffer
      console.log(`📊 Market rate: ~${(1/xrpPerRlusd).toFixed(4)} RLUSD per XRP, expecting ~${expectedRlusd.toFixed(2)} RLUSD`);
    } else {
      // Fallback: estimate based on typical rate
      expectedRlusd = xrpAmount * 0.40 * 0.98; // Rough estimate with buffer
      console.log(`📊 Using fallback rate, expecting ~${expectedRlusd.toFixed(2)} RLUSD`);
    }

    // Create OfferCreate to sell XRP for RLUSD
    // Using tfSell flag to sell exact XRP amount
    // Using tfImmediateOrCancel to fill immediately or cancel
    const xrpDrops = Math.floor(xrpAmount * 1000000);

    const offerTx = {
      TransactionType: 'OfferCreate',
      Account: wallet.address,
      TakerGets: {
        currency: 'RLUSD',
        issuer: RLUSD_ISSUER,
        value: expectedRlusd.toFixed(6)
      },
      TakerPays: xrpDrops.toString(), // XRP in drops
      Flags: 0x00020000 | 0x00080000 // tfSell | tfImmediateOrCancel
    };

    // Prepare, sign, and submit
    const prepared = await client.autofill(offerTx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult === 'tesSUCCESS') {
      // Calculate actual RLUSD received from the trade
      const affectedNodes = result.result.meta.AffectedNodes || [];
      let rlusdReceived = 0;

      for (const node of affectedNodes) {
        const modified = node.ModifiedNode || node.CreatedNode;
        if (modified && modified.LedgerEntryType === 'RippleState') {
          const finalFields = modified.FinalFields || modified.NewFields;
          if (finalFields && finalFields.Balance &&
              (finalFields.HighLimit?.issuer === RLUSD_ISSUER || finalFields.LowLimit?.issuer === RLUSD_ISSUER)) {
            // This is the RLUSD trust line
            const prevBalance = parseFloat(modified.PreviousFields?.Balance?.value || '0');
            const newBalance = parseFloat(finalFields.Balance.value || '0');
            rlusdReceived = Math.abs(newBalance - prevBalance);
          }
        }
      }

      console.log(`✅ Auto-conversion SUCCESS for order ${orderNumber}`);
      console.log(`   💰 Sold: ${xrpAmount} XRP`);
      console.log(`   💵 Received: ~${rlusdReceived.toFixed(2)} RLUSD`);
      console.log(`   📝 TX Hash: ${result.result.hash}`);

      return {
        success: true,
        xrpSold: xrpAmount,
        rlusdReceived: rlusdReceived,
        txHash: result.result.hash
      };
    } else {
      console.error(`❌ Conversion failed: ${result.result.meta.TransactionResult}`);
      return { success: false, reason: result.result.meta.TransactionResult };
    }

  } catch (error) {
    console.error(`❌ Error converting XRP to RLUSD for order ${orderNumber}:`, error.message);
    return { success: false, reason: error.message };
  } finally {
    await client.disconnect();
  }
}

async function checkMerchPayments() {
  try {
    // Get all pending orders with destination tags
    const { data: pendingOrders, error: ordersError } = await supabaseAdmin
      .from('merch_orders')
      .select('*')
      .eq('status', 'pending')
      .not('destination_tag', 'is', null);

    if (ordersError || !pendingOrders || pendingOrders.length === 0) {
      return; // No pending orders to check
    }

    console.log(`🔍 Checking payments for ${pendingOrders.length} pending merch orders...`);

    // Query XRPL for recent transactions to merch wallet
    const xrplClient = new (require('xrpl')).Client('wss://xrplcluster.com');
    await xrplClient.connect();

    try {
      const response = await xrplClient.request({
        command: 'account_tx',
        account: MERCH_WALLET,
        limit: 50,
        forward: false // Most recent first
      });

      const transactions = response.result?.transactions || [];

      for (const order of pendingOrders) {
        // Look for a matching transaction
        for (const txData of transactions) {
          // Handle both tx and tx_json formats
          const tx = txData.tx || txData.tx_json || {};
          const meta = txData.meta || {};

          // Skip if not a successful payment to us
          if (tx.TransactionType !== 'Payment') continue;
          if (tx.Destination !== MERCH_WALLET) continue;
          if (meta.TransactionResult !== 'tesSUCCESS') continue;

          // Check destination tag matches (convert both to numbers for comparison)
          const txTag = parseInt(tx.DestinationTag);
          const orderTag = parseInt(order.destination_tag);
          if (isNaN(txTag) || isNaN(orderTag) || txTag !== orderTag) continue;

          // Get amount (could be Amount or DeliverMax in different XRPL versions)
          const txAmount = tx.DeliverMax || tx.Amount;

          // Check amount (with some tolerance for XRP)
          let amountMatches = false;
          const expectedAmount = parseFloat(order.payment_amount);

          let receivedXRP = 0; // Track XRP amount for potential conversion
          let isXrpPayment = false;

          if (order.payment_currency === 'RLUSD') {
            // RLUSD payment
            if (typeof txAmount === 'object' && (txAmount.currency === 'RLUSD' || txAmount.currency?.includes('524C555344'))) {
              const receivedAmount = parseFloat(txAmount.value);
              amountMatches = Math.abs(receivedAmount - expectedAmount) < 0.01;
              console.log(`💵 RLUSD check: received ${receivedAmount}, expected ${expectedAmount}, matches: ${amountMatches}`);
            }
          } else {
            // XRP payment (amount in drops)
            if (typeof txAmount === 'string' || typeof txAmount === 'number') {
              receivedXRP = parseInt(txAmount) / 1000000;
              isXrpPayment = true;
              // Allow 10% tolerance for XRP price fluctuation
              amountMatches = receivedXRP >= expectedAmount * 0.90;
              console.log(`💰 XRP check: received ${receivedXRP} XRP, expected ${expectedAmount} XRP, matches: ${amountMatches}`);
            }
          }

          if (amountMatches) {
            // Found matching payment! Update order
            // Hash can be at txData.hash or tx.hash depending on XRPL response format
            const txHash = txData.hash || tx.hash;
            console.log(`✅ Found payment for order ${order.order_number}: ${txHash}`);

            // Auto-convert XRP to RLUSD if enabled
            let conversionResult = null;
            if (isXrpPayment && AUTO_CONVERT_XRP) {
              console.log(`💱 Triggering XRP → RLUSD auto-conversion for order ${order.order_number}...`);
              conversionResult = await convertXrpToRlusd(receivedXRP, order.order_number);
            }

            await supabaseAdmin
              .from('merch_orders')
              .update({
                status: 'paid',
                payment_tx_hash: txHash,
                paid_at: new Date().toISOString(),
                conversion_tx_hash: conversionResult?.txHash || null,
                rlusd_received: conversionResult?.rlusdReceived || null
              })
              .eq('id', order.id);

            break; // Move to next order
          }
        }
      }
    } finally {
      await xrplClient.disconnect();
    }

  } catch (error) {
    console.error('Error checking merch payments:', error.message);
  }
}

// Check for payments every 30 seconds
setInterval(checkMerchPayments, 30000);
// Also run once on startup after 5 seconds
setTimeout(checkMerchPayments, 5000);

// Debug endpoint - check XUMM SDK status - SECURITY: Added auth + reduced info exposure
app.get('/api/merch/admin/debug', verifyAdminSession, (req, res) => {
  res.json({
    xumm_initialized: !!xumm,
    xumm_payload_exists: !!(xumm && xumm.payload),
    // SECURITY: Don't expose environment variable status
    admin_wallets_configured: MERCH_ADMIN_WALLETS.length > 0
  });
});

// Manual payment check endpoint - SECURITY: Added auth middleware
app.get('/api/merch/check-payments', verifyAdminSession, async (req, res) => {
  try {
    // Get pending orders
    const { data: pendingOrders, error: ordersError } = await supabaseAdmin
      .from('merch_orders')
      .select('*')
      .eq('status', 'pending')
      .not('destination_tag', 'is', null);

    if (ordersError) {
      return res.json({ error: 'DB error', details: ordersError.message });
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      return res.json({ message: 'No pending orders with destination tags', pending_count: 0 });
    }

    // Get recent transactions
    const xrplClient = new (require('xrpl')).Client('wss://xrplcluster.com');
    await xrplClient.connect();

    const response = await xrplClient.request({
      command: 'account_tx',
      account: MERCH_WALLET,
      limit: 20,
      forward: false
    });

    await xrplClient.disconnect();

    const transactions = response.result?.transactions || [];
    const recentPayments = transactions
      .filter(t => {
        const tx = t.tx || t.tx_json || {};
        return tx.TransactionType === 'Payment' && tx.Destination === MERCH_WALLET;
      })
      .map(t => {
        const tx = t.tx || t.tx_json || {};
        const meta = t.meta || {};
        return {
          hash: tx.hash,
          from: tx.Account,
          amount: tx.DeliverMax || tx.Amount,
          destination_tag: tx.DestinationTag,
          result: meta.TransactionResult
        };
      });

    res.json({
      merch_wallet: MERCH_WALLET,
      pending_orders: pendingOrders.map(o => ({
        id: o.id,
        order_number: o.order_number,
        destination_tag: o.destination_tag,
        payment_amount: o.payment_amount,
        payment_currency: o.payment_currency,
        status: o.status
      })),
      recent_payments: recentPayments
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Debug endpoint - show ALL recent orders - SECURITY: Added auth middleware
app.get('/api/merch/debug-orders', verifyAdminSession, async (req, res) => {
  try {
    const { data: allOrders, error } = await supabaseAdmin
      .from('merch_orders')
      .select('id, order_number, status, destination_tag, payment_amount, payment_currency, payment_tx_hash, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return res.json({ error: error.message });

    // Also get recent transactions
    const xrplClient = new (require('xrpl')).Client('wss://xrplcluster.com');
    await xrplClient.connect();
    const response = await xrplClient.request({
      command: 'account_tx',
      account: MERCH_WALLET,
      limit: 10,
      forward: false
    });
    await xrplClient.disconnect();

    const transactions = response.result?.transactions || [];
    const recentTx = transactions.map(t => {
      const tx = t.tx || t.tx_json || {};
      return {
        hash: tx.hash?.substring(0, 16) + '...',
        type: tx.TransactionType,
        from: tx.Account,
        dest_tag: tx.DestinationTag,
        amount: tx.DeliverMax || tx.Amount
      };
    });

    res.json({ orders: allOrders, recent_transactions: recentTx });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// TEST endpoint - try WITH and WITHOUT txjson wrapper - SECURITY: Added auth middleware
app.get('/api/merch/test-payment', verifyAdminSession, async (req, res) => {
  try {
    const apiKey = process.env.XAMAN_API_KEY;
    const apiSecret = process.env.XAMAN_API_SECRET;
    const results = {};

    // Test 1: SignIn WITH txjson wrapper
    try {
      const r1 = await fetch('https://xumm.app/api/v1/platform/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
        body: JSON.stringify({ txjson: { TransactionType: 'SignIn' } })
      });
      results.signin_with_txjson = { status: r1.status, data: await r1.json() };
    } catch (e) { results.signin_with_txjson = { error: e.message }; }

    // Test 2: SignIn WITHOUT txjson wrapper (direct)
    try {
      const r2 = await fetch('https://xumm.app/api/v1/platform/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
        body: JSON.stringify({ TransactionType: 'SignIn' })
      });
      results.signin_direct = { status: r2.status, data: await r2.json() };
    } catch (e) { results.signin_direct = { error: e.message }; }

    // Test 3: Payment WITH txjson wrapper
    try {
      const r3 = await fetch('https://xumm.app/api/v1/platform/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
        body: JSON.stringify({ txjson: { TransactionType: 'Payment', Destination: 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9', Amount: '1000000' } })
      });
      results.payment_with_txjson = { status: r3.status, data: await r3.json() };
    } catch (e) { results.payment_with_txjson = { error: e.message }; }

    // Test 4: Payment WITHOUT txjson wrapper (direct)
    try {
      const r4 = await fetch('https://xumm.app/api/v1/platform/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
        body: JSON.stringify({ TransactionType: 'Payment', Destination: 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9', Amount: '1000000' })
      });
      results.payment_direct = { status: r4.status, data: await r4.json() };
    } catch (e) { results.payment_direct = { error: e.message }; }

    res.json(results);
  } catch (e) {
    res.json({ outer_error: e.message });
  }
});

// TEST endpoint - try Payment via SDK (not direct fetch) - SECURITY: Added auth middleware
app.get('/api/merch/test-sdk-payment', verifyAdminSession, async (req, res) => {
  try {
    if (!xumm) {
      return res.json({ error: 'XUMM SDK not initialized' });
    }

    const results = {};

    // Test 1: SignIn via SDK (this should work)
    try {
      const signinPayload = await xumm.payload.create({
        txjson: { TransactionType: 'SignIn' }
      }, true);
      results.sdk_signin = { success: true, uuid: signinPayload?.uuid, next: signinPayload?.next?.always };
    } catch (e) {
      results.sdk_signin = { error: e.message, details: e.toString() };
    }

    // Test 2: Payment via SDK for XRP (drops format)
    try {
      const xrpPayload = await xumm.payload.create({
        txjson: {
          TransactionType: 'Payment',
          Destination: 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9',
          Amount: '1000000', // 1 XRP in drops
          DestinationTag: 12345
        }
      }, true);
      results.sdk_payment_xrp = { success: true, uuid: xrpPayload?.uuid, next: xrpPayload?.next?.always };
    } catch (e) {
      results.sdk_payment_xrp = { error: e.message, details: e.toString() };
    }

    // Test 3: Payment via SDK for RLUSD (IOU format - hex currency code)
    // RLUSD in hex: R=52, L=4C, U=55, S=53, D=44, padded to 40 chars
    const RLUSD_HEX = '524C555344000000000000000000000000000000';
    try {
      const rlusdPayload = await xumm.payload.create({
        txjson: {
          TransactionType: 'Payment',
          Destination: 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9',
          Amount: {
            currency: RLUSD_HEX,
            issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
            value: '30'
          },
          DestinationTag: 12345
        }
      }, true);
      results.sdk_payment_rlusd = { success: true, uuid: rlusdPayload?.uuid, next: rlusdPayload?.next?.always };
    } catch (e) {
      results.sdk_payment_rlusd = { error: e.message, details: e.toString() };
    }

    res.json(results);
  } catch (e) {
    res.json({ outer_error: e.message });
  }
});

// Simple admin login - verify wallet is admin and create session
// The wallet was already verified via XAMAN SignIn on the main site
app.post('/api/merch/admin/login', (req, res) => {
  try {
    const { wallet } = req.body;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    // Validate wallet format
    if (!wallet.startsWith('r') || wallet.length < 25 || wallet.length > 35) {
      return res.status(400).json({ success: false, error: 'Invalid wallet format' });
    }

    // Check if admin wallet
    if (!MERCH_ADMIN_WALLETS.includes(wallet.toLowerCase())) {
      console.log(`🚫 Admin login denied for wallet: ${wallet}`);
      return res.status(403).json({ success: false, error: 'Access denied. Not an admin wallet.' });
    }

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + ADMIN_SESSION_EXPIRY;

    adminSessions.set(sessionToken, {
      wallet: wallet.toLowerCase(),
      expires,
      created: Date.now()
    });

    console.log(`✅ Admin session created for wallet: ${wallet}`);

    res.json({
      success: true,
      session_token: sessionToken,
      wallet,
      expires_in: ADMIN_SESSION_EXPIRY / 1000 // seconds
    });

  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Generate admin auth challenge (Step 1)
app.post('/api/merch/admin/auth/challenge', async (req, res) => {
  try {
    // Check if XUMM SDK is initialized
    if (!xumm) {
      console.error('❌ XUMM SDK not initialized - missing XAMAN_API_KEY/XAMAN_API_SECRET');
      return res.status(500).json({
        success: false,
        error: 'XAMAN SDK not configured on server'
      });
    }

    // Create XAMAN SignIn payload for wallet verification
    // Use txjson format like merch payment endpoint
    const payload = await xumm.payload.create({
      txjson: {
        TransactionType: 'SignIn'
      }
    });

    if (!payload) {
      throw new Error('Failed to create XAMAN payload');
    }

    console.log(`🔐 Admin auth challenge created: ${payload.uuid}`);

    res.json({
      success: true,
      uuid: payload.uuid,
      qr_png: payload.refs?.qr_png,
      next: payload.next,
      refs: payload.refs
    });

  } catch (error) {
    console.error('❌ Error creating admin challenge:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ success: false, error: 'Failed to create auth challenge', details: error.message });
  }
});

// Verify admin auth (Step 2 - after XAMAN sign)
app.post('/api/merch/admin/auth/verify', async (req, res) => {
  try {
    const { payload_uuid } = req.body;

    if (!payload_uuid) {
      return res.status(400).json({ success: false, error: 'Payload UUID required' });
    }

    // Check if XUMM SDK is initialized
    if (!xumm) {
      console.error('❌ XUMM SDK not initialized for verify');
      return res.status(500).json({
        success: false,
        error: 'XAMAN SDK not configured on server'
      });
    }

    // Get payload result from XAMAN
    const result = await xumm.payload.get(payload_uuid);

    if (!result) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    // Check if signed
    if (!result.meta?.signed) {
      return res.status(401).json({ success: false, error: 'Payload not signed' });
    }

    // Get the wallet that signed
    const wallet = result.response?.account;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Could not determine wallet' });
    }

    // Check if admin wallet
    if (!MERCH_ADMIN_WALLETS.includes(wallet.toLowerCase())) {
      console.log(`🚫 Admin auth denied for wallet: ${wallet}`);
      return res.status(403).json({ success: false, error: 'Access denied. Not an admin wallet.' });
    }

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + ADMIN_SESSION_EXPIRY;

    adminSessions.set(sessionToken, {
      wallet: wallet.toLowerCase(),
      expires,
      created: Date.now()
    });

    console.log(`✅ Admin session created for wallet: ${wallet}`);

    res.json({
      success: true,
      session_token: sessionToken,
      wallet,
      expires_in: ADMIN_SESSION_EXPIRY / 1000 // seconds
    });

  } catch (error) {
    console.error('Error verifying admin auth:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// Middleware to verify admin session
function verifyAdminSession(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Admin token required' });
  }

  const session = adminSessions.get(token);

  if (!session) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }

  if (Date.now() > session.expires) {
    adminSessions.delete(token);
    return res.status(401).json({ success: false, error: 'Session expired' });
  }

  // Attach wallet to request
  req.adminWallet = session.wallet;
  next();
}

// Admin: Get all orders (for admin panel) - SESSION PROTECTED
app.get('/api/merch/admin/orders', verifyAdminSession, async (req, res) => {
  try {
    console.log(`✅ Merch admin access granted for wallet: ${req.adminWallet}`);

    const { data: orders, error } = await supabaseAdmin
      .from('merch_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get unique wallet addresses to fetch usernames
    const walletAddresses = [...new Set(orders.map(o => o.wallet_address).filter(Boolean))];

    // Fetch display names from profiles
    let profilesMap = {};
    if (walletAddresses.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('wallet_address, display_name')
        .in('wallet_address', walletAddresses);

      if (profiles) {
        profiles.forEach(p => {
          profilesMap[p.wallet_address] = p.display_name;
        });
      }
    }

    // Decrypt shipping info for admin view and add username
    const decryptedOrders = orders.map(order => ({
      ...order,
      username: profilesMap[order.wallet_address] || null,
      shipping: {
        name: order.shipping_name_encrypted ? decryptData(order.shipping_name_encrypted) : null,
        street: order.shipping_street_encrypted ? decryptData(order.shipping_street_encrypted) : null,
        apt: order.shipping_apt_encrypted ? decryptData(order.shipping_apt_encrypted) : null,
        city: order.shipping_city_encrypted ? decryptData(order.shipping_city_encrypted) : null,
        state: order.shipping_state,
        zip: order.shipping_zip_encrypted ? decryptData(order.shipping_zip_encrypted) : null,
        country: order.shipping_country
      }
    }));

    res.json({ success: true, orders: decryptedOrders });

  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin: Delete order - SESSION PROTECTED
app.delete('/api/merch/admin/orders/:orderId', verifyAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log(`🗑️ Admin ${req.adminWallet} deleting order: ${orderId}`);

    const { error } = await supabaseAdmin
      .from('merch_orders')
      .delete()
      .eq('id', orderId);

    if (error) throw error;

    res.json({ success: true, message: 'Order deleted' });

  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin: Update order status (shipped, tracking, etc) - SESSION PROTECTED
app.patch('/api/merch/admin/orders/:orderId', verifyAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, tracking_number, notes } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (tracking_number) updateData.tracking_number = tracking_number;
    if (notes !== undefined) updateData.notes = notes;
    if (status === 'shipped') updateData.shipped_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('merch_orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) throw error;

    console.log(`📦 Merch order ${orderId} updated by admin ${req.adminWallet}: ${JSON.stringify(updateData)}`);
    res.json({ success: true, message: 'Order updated' });

  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ===== INVENTORY MANAGEMENT API =====

// Get all inventory - SESSION PROTECTED
app.get('/api/merch/admin/inventory', verifyAdminSession, async (req, res) => {
  try {
    console.log(`📦 Admin ${req.adminWallet} fetching inventory`);

    // Try to get from database first
    const { data: inventory, error } = await supabaseAdmin
      .from('merch_inventory')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching inventory from DB:', error);
      // Fall back to in-memory if DB fails
      const inMemoryInventory = Object.values(MERCH_PRODUCTS).map(p => ({
        id: p.id,
        name: p.name,
        price: p.price_usd,
        low_stock_threshold: 5,
        stock: p.sizes,
        created_at: new Date().toISOString()
      }));
      return res.json({ success: true, inventory: inMemoryInventory, source: 'memory' });
    }

    // Sync in-memory MERCH_PRODUCTS with DB data
    if (inventory && inventory.length > 0) {
      inventory.forEach(item => {
        MERCH_PRODUCTS[item.id] = {
          id: item.id,
          name: item.name,
          price_usd: item.price,
          sizes: item.stock || { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }
        };
      });
    }

    res.json({ success: true, inventory: inventory || [], source: 'database' });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get public inventory (for store) - NO AUTH REQUIRED
app.get('/api/merch/inventory', async (req, res) => {
  try {
    const { data: inventory, error } = await supabaseAdmin
      .from('merch_inventory')
      .select('id, name, description, price, stock, images')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching public inventory:', error);
      // Fall back to in-memory
      const inMemoryInventory = Object.values(MERCH_PRODUCTS).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: p.price_usd,
        stock: p.sizes,
        images: p.images || []
      }));
      return res.json({ success: true, inventory: inMemoryInventory });
    }

    res.json({ success: true, inventory: inventory || [] });
  } catch (error) {
    console.error('Error fetching public inventory:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Add new product to inventory - SESSION PROTECTED
app.post('/api/merch/admin/inventory', verifyAdminSession, async (req, res) => {
  try {
    const { id, name, description, price, low_stock_threshold, stock, images } = req.body;

    if (!id || !name || price === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields: id, name, price' });
    }

    const productId = id.toLowerCase().replace(/\s+/g, '-');
    const productData = {
      id: productId,
      name: name.toUpperCase(),
      description: description || '',
      price: parseFloat(price),
      low_stock_threshold: low_stock_threshold || 5,
      stock: stock || { S: 0, M: 0, L: 0, XL: 0, '2XL': 0 },
      images: images || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin
      .from('merch_inventory')
      .upsert(productData, { onConflict: 'id' });

    if (error) {
      console.error('Error adding product:', error);
      return res.status(500).json({ success: false, error: 'Failed to add product' });
    }

    // Update in-memory
    MERCH_PRODUCTS[productId] = {
      id: productId,
      name: productData.name,
      description: productData.description,
      price_usd: productData.price,
      sizes: productData.stock,
      images: productData.images
    };

    console.log(`📦 Admin ${req.adminWallet} added product: ${productData.name}`);
    res.json({ success: true, product: productData });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Update product inventory - SESSION PROTECTED
app.put('/api/merch/admin/inventory/:productId', verifyAdminSession, async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, description, price, low_stock_threshold, stock, images } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (name) updateData.name = name.toUpperCase();
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (low_stock_threshold !== undefined) updateData.low_stock_threshold = low_stock_threshold;
    if (stock) updateData.stock = stock;
    if (images !== undefined) updateData.images = images;

    const { error } = await supabaseAdmin
      .from('merch_inventory')
      .update(updateData)
      .eq('id', productId);

    if (error) {
      console.error('Error updating product:', error);
      return res.status(500).json({ success: false, error: 'Failed to update product' });
    }

    // Update in-memory
    if (MERCH_PRODUCTS[productId]) {
      if (name) MERCH_PRODUCTS[productId].name = updateData.name;
      if (description !== undefined) MERCH_PRODUCTS[productId].description = description;
      if (price !== undefined) MERCH_PRODUCTS[productId].price_usd = updateData.price;
      if (stock) MERCH_PRODUCTS[productId].sizes = stock;
      if (images !== undefined) MERCH_PRODUCTS[productId].images = images;
    }

    console.log(`📦 Admin ${req.adminWallet} updated product: ${productId}`);
    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Delete product from inventory - SESSION PROTECTED
app.delete('/api/merch/admin/inventory/:productId', verifyAdminSession, async (req, res) => {
  try {
    const { productId } = req.params;

    const { error } = await supabaseAdmin
      .from('merch_inventory')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error('Error deleting product:', error);
      return res.status(500).json({ success: false, error: 'Failed to delete product' });
    }

    // Remove from in-memory
    delete MERCH_PRODUCTS[productId];

    console.log(`🗑️ Admin ${req.adminWallet} deleted product: ${productId}`);
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Initialize inventory from database on startup
async function initializeInventoryFromDB() {
  try {
    const { data: inventory, error } = await supabaseAdmin
      .from('merch_inventory')
      .select('*');

    if (error) {
      console.log('⚠️ Could not load inventory from DB, using defaults:', error.message);
      return;
    }

    if (inventory && inventory.length > 0) {
      // Clear existing and load from DB
      Object.keys(MERCH_PRODUCTS).forEach(key => delete MERCH_PRODUCTS[key]);
      inventory.forEach(item => {
        MERCH_PRODUCTS[item.id] = {
          id: item.id,
          name: item.name,
          price_usd: item.price,
          sizes: item.stock || { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }
        };
      });
      console.log(`📦 Loaded ${inventory.length} products from database`);
    } else {
      // Seed database with default product if empty
      const defaultProduct = {
        id: 'pocket-jester',
        name: 'POCKET JESTER',
        price: 30,
        low_stock_threshold: 5,
        stock: { S: 10, M: 15, L: 20, XL: 15, '2XL': 10 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await supabaseAdmin.from('merch_inventory').upsert(defaultProduct, { onConflict: 'id' });
      console.log('📦 Seeded default inventory to database');
    }
  } catch (error) {
    console.error('Error initializing inventory:', error);
  }
}

// Call initialization after a short delay to ensure DB is ready
setTimeout(initializeInventoryFromDB, 3000);

// ===== END MERCH STORE API =====

// ===== HEALTH & DEBUG =====

// Serve main.html at root (with cache-busting headers to prevent old cached exploits)
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '..', 'main.html'));
});

// Version endpoint for deployment verification
app.get('/api/version', (req, res) => {
  res.json({
    version: SERVER_VERSION,
    deployed: new Date().toISOString(),
    supabaseAdmin: !!supabaseAdmin
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'BEAR Park API Server running',
    version: SERVER_VERSION
  });
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
      return safeErrorResponse(res, error);
    }

    console.log(`✅ Updated display name for ${wallet} to: ${display_name}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in update user endpoint:', error);
    safeErrorResponse(res, error);
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

// 1. Manual Point Adjustments (allows negative values for subtracting points)
app.post('/api/admin/adjust-points', verifyAdmin, validateWallet, validateTextLengths, async (req, res) => {
  try {
    const { wallet_address, amount, reason } = req.body;
    const admin_wallet = req.adminWallet; // From verified middleware

    if (!wallet_address || amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, amount'
      });
    }

    const pointsAmount = parseFloat(amount);

    // Validate amount (allow negative for subtracting, but limit range)
    if (isNaN(pointsAmount) || !isFinite(pointsAmount)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount: Must be a valid number'
      });
    }

    const MAX_ADJUSTMENT = 1000000000;
    if (Math.abs(pointsAmount) > MAX_ADJUSTMENT) {
      return res.status(400).json({
        success: false,
        error: `Invalid amount: Must be between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}`
      });
    }

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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
  }
});

// 4. Get Banned Users - SECURITY: Added auth middleware
app.get('/api/admin/banned-users', verifyAdmin, async (req, res) => {
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
    safeErrorResponse(res, error);
  }
});

// 5. Get Analytics Dashboard Data - SECURITY: Added auth middleware
app.get('/api/admin/analytics', verifyAdmin, async (req, res) => {
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
    safeErrorResponse(res, error);
  }
});

// 6. Get Activity Logs - SECURITY: Added auth middleware
app.get('/api/admin/activity-logs', verifyAdmin, async (req, res) => {
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
    safeErrorResponse(res, error);
  }
});

// 7. Get Game Settings - SECURITY: Added auth middleware
app.get('/api/admin/game-settings', verifyAdmin, async (req, res) => {
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
  }
});

// 9. Get Raid Analytics - SECURITY: Added auth middleware
app.get('/api/admin/raid-analytics', verifyAdmin, async (req, res) => {
  try {
    // Get all raids
    const { data: raids } = await supabase
      .from('raids')
      .select('*')
      .order('created_at', { ascending: false });

    res.json({ success: true, raid_analytics: raids || [] });
  } catch (error) {
    console.error('Error fetching raid analytics:', error);
    safeErrorResponse(res, error);
  }
});

// 10. Get Point Transaction History - SECURITY: Added auth middleware
app.get('/api/admin/point-transactions', verifyAdmin, async (req, res) => {
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
  }
});

// =====================================================
// ROLE MANAGEMENT ENDPOINTS
// =====================================================

// Get all assigned roles - SECURITY: Added auth middleware
app.get('/api/admin/roles', verifyAdmin, async (req, res) => {
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
    safeErrorResponse(res, error);
  }
});

// Check specific wallet's role and permissions - PUBLIC endpoint (users check their own role)
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
  }
});

// Reset all user points and inventories (master only)
app.post('/api/admin/reset-economy', verifyAdmin, async (req, res) => {
  try {
    const { admin_wallet, reset_amount } = req.body;

    if (!admin_wallet) {
      return res.status(401).json({
        success: false,
        error: 'Admin wallet required'
      });
    }

    // Verify the admin is master
    const { data: adminRole } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('wallet_address', admin_wallet)
      .eq('is_active', true)
      .single();

    if (!adminRole || adminRole.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Only MASTER accounts can reset the economy'
      });
    }

    const resetPoints = reset_amount || 5000;

    // Ensure admin client is available
    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Admin client not initialized - SUPABASE_SERVICE_ROLE_KEY missing'
      });
    }

    console.log(`🔄 ECONOMY RESET initiated by MASTER: ${admin_wallet}`);
    console.log(`   Resetting all users to ${resetPoints} honey points`);
    console.log(`   Clearing all cosmetic inventories`);
    console.log(`   Using ADMIN CLIENT (bypasses RLS)`);

    // 1. Reset all honey points to specified amount (default 5000) - USE ADMIN CLIENT
    const { error: pointsError } = await supabaseAdmin
      .from('honey_points')
      .update({
        total_points: resetPoints,
        raiding_points: 0,
        games_points: 0
      })
      .neq('wallet_address', 'dummy'); // Update all rows

    if (pointsError) {
      console.error('Error resetting honey points:', pointsError);
      throw pointsError;
    }

    // 2. Clear all cosmetic inventories (user_cosmetics table) - USE ADMIN CLIENT
    const { error: inventoryError } = await supabaseAdmin
      .from('user_cosmetics')
      .delete()
      .gte('id', 0); // Delete all rows (id >= 0 matches everything)

    if (inventoryError) {
      console.error('Error clearing inventories:', inventoryError);
      throw inventoryError;
    }

    // 3. Clear all equipped cosmetics (stored in profiles table) - USE ADMIN CLIENT
    const { error: equippedError } = await supabaseAdmin
      .from('profiles')
      .update({
        equipped_ring_id: null,
        equipped_banner_id: null
      })
      .gte('id', 0); // Update all rows (id >= 0 matches everything)

    if (equippedError) {
      console.error('Error clearing equipped cosmetics:', equippedError);
      throw equippedError;
    }

    // Log admin activity
    await logAdminActivity(admin_wallet, 'reset_economy', {
      reset_amount: resetPoints,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ ECONOMY RESET COMPLETE!`);
    console.log(`   All users reset to ${resetPoints} honey points`);
    console.log(`   All inventories cleared`);
    console.log(`   All equipped cosmetics cleared`);

    res.json({
      success: true,
      message: `Economy reset successful - all users now have ${resetPoints} HP with empty inventories`
    });
  } catch (error) {
    console.error('Error in economy reset:', error);
    safeErrorResponse(res, error);
  }
});

// Set a specific user's honey points (master only)
app.post('/api/admin/set-user-points', verifyAdmin, async (req, res) => {
  try {
    const { admin_wallet, target_wallet, points } = req.body;

    if (!admin_wallet || !target_wallet || points === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Admin wallet, target wallet, and points are required'
      });
    }

    // Verify the admin is master
    const { data: adminRole } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('wallet_address', admin_wallet)
      .eq('is_active', true)
      .single();

    if (!adminRole || adminRole.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Only MASTER accounts can set user points'
      });
    }

    // Ensure admin client is available
    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Admin client not initialized - SUPABASE_SERVICE_ROLE_KEY missing'
      });
    }

    console.log(`🔧 SET USER POINTS initiated by MASTER: ${admin_wallet}`);
    console.log(`   Target: ${target_wallet}`);
    console.log(`   New points: ${points}`);

    // Update the user's honey points
    const { error: updateError } = await supabaseAdmin
      .from('honey_points')
      .update({
        total_points: points,
        games_points: points, // Assume all points are from games
        raiding_points: 0
      })
      .eq('wallet_address', target_wallet);

    if (updateError) {
      console.error('Error updating user points:', updateError);
      throw updateError;
    }

    // Log admin activity
    await logAdminActivity(admin_wallet, 'set_user_points', {
      target_wallet,
      points,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ USER POINTS UPDATED!`);
    console.log(`   ${target_wallet} now has ${points} HP`);

    res.json({
      success: true,
      message: `Successfully set ${target_wallet} to ${points} HP`
    });
  } catch (error) {
    console.error('Error setting user points:', error);
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
  }
});

// ===== NOTIFICATION SYSTEM =====
// Persistent notification storage in Supabase

// Get notifications for a user
app.get('/api/notifications/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    // Fetch from database (newest first, limit to 50)
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Transform database format to match frontend expectations
    const transformedNotifications = (notifications || []).map(n => ({
      id: n.id.toString(),
      type: n.type,
      data: n.data,
      read: n.is_read,
      created_at: n.created_at
    }));

    res.json({ success: true, notifications: transformedNotifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    safeErrorResponse(res, error);
  }
});

// Mark notification as read
app.post('/api/notifications/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    safeErrorResponse(res, error);
  }
});

// Helper function to add a notification (now uses database)
async function addNotification(targetWallet, type, data) {
  try {
    // Don't send notification to yourself
    if (data.wallet && data.wallet === targetWallet) {
      return;
    }

    const { error } = await supabase
      .from('notifications')
      .insert({
        wallet_address: targetWallet,
        type,
        data,
        is_read: false
      });

    if (error) throw error;

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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
  }
});

// Get cosmetics purchase history (admin)
app.get('/api/cosmetics/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const { data: transactions, error } = await supabase
      .from('cosmetics_transactions')
      .select(`
        *,
        cosmetic:cosmetics_catalog(name, cosmetic_type, rarity, honey_cost, image_url)
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    // Get display names for wallets
    const walletAddresses = [...new Set(transactions.map(t => t.wallet_address))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('wallet_address, display_name')
      .in('wallet_address', walletAddresses);

    const profileMap = {};
    if (profiles) {
      profiles.forEach(p => {
        profileMap[p.wallet_address] = p.display_name;
      });
    }

    // Add display names to transactions
    const enrichedTransactions = transactions.map(t => ({
      ...t,
      display_name: profileMap[t.wallet_address] || t.wallet_address.substring(0, 8) + '...'
    }));

    res.json({
      success: true,
      transactions: enrichedTransactions,
      total: enrichedTransactions.length
    });
  } catch (error) {
    console.error('Error fetching cosmetics history:', error);
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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

    // Send notifications
    try {
      if (parent_id) {
        // This is a reply - notify the parent comment author
        const { data: parentComment } = await supabase
          .from('bulletin_comments')
          .select('wallet_address')
          .eq('id', parent_id)
          .single();

        if (parentComment && parentComment.wallet_address !== wallet_address) {
          await addNotification(parentComment.wallet_address, 'bulletin_reply', {
            wallet: wallet_address,
            displayName: profile?.display_name || 'Anonymous',
            avatarNft: profile?.avatar_nft || null,
            commentText: content.substring(0, 100),
            commentId: newComment.id.toString(),
            postId: post_id.toString()
          });
          console.log(`📬 Reply notification sent to ${parentComment.wallet_address}`);
        }
      } else {
        // This is a top-level comment - notify the post author
        const { data: post } = await supabase
          .from('bulletin_posts')
          .select('wallet_address')
          .eq('id', post_id)
          .single();

        if (post && post.wallet_address !== wallet_address) {
          await addNotification(post.wallet_address, 'bulletin_comment', {
            wallet: wallet_address,
            displayName: profile?.display_name || 'Anonymous',
            avatarNft: profile?.avatar_nft || null,
            commentText: content.substring(0, 100),
            commentId: newComment.id.toString(),
            postId: post_id.toString()
          });
          console.log(`📬 Comment notification sent to ${post.wallet_address}`);
        }
      }
    } catch (notifError) {
      console.error('⚠️ Failed to send notification:', notifError);
      // Don't fail the request if notification fails
    }

    res.json(newComment);
  } catch (error) {
    console.error('❌ Error creating bulletin comment:', error);
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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

      // Send notification to comment author
      try {
        const { data: comment } = await supabase
          .from('bulletin_comments')
          .select('wallet_address, content, post_id')
          .eq('id', commentId)
          .single();

        if (comment && comment.wallet_address !== wallet_address) {
          // Get reactor's profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_nft')
            .eq('wallet_address', wallet_address)
            .single();

          const reactionEmojis = { like: '👍', laugh: '😂', heart: '❤️', cry: '😢', thumbs_down: '👎', troll: '🤡' };

          await addNotification(comment.wallet_address, 'bulletin_comment_reaction', {
            wallet: wallet_address,
            displayName: profile?.display_name || 'Anonymous',
            avatarNft: profile?.avatar_nft || null,
            reactions: [reactionEmojis[reaction_type]],
            commentText: comment.content?.substring(0, 100),
            commentId: commentId.toString(),
            postId: comment.post_id.toString()
          });
          console.log(`📬 Comment reaction notification sent to ${comment.wallet_address}`);
        }
      } catch (notifError) {
        console.error('⚠️ Failed to send notification:', notifError);
        // Don't fail the request if notification fails
      }
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
    safeErrorResponse(res, error);
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
    safeErrorResponse(res, error);
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

      // Send notification to post author
      try {
        const { data: post } = await supabase
          .from('bulletin_posts')
          .select('wallet_address')
          .eq('id', postId)
          .single();

        if (post && post.wallet_address !== wallet_address) {
          // Get reactor's profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_nft')
            .eq('wallet_address', wallet_address)
            .single();

          const reactionEmojis = { like: '👍', laugh: '😂', heart: '❤️', cry: '😢', thumbs_down: '👎', troll: '🤡' };

          await addNotification(post.wallet_address, 'bulletin_post_reaction', {
            wallet: wallet_address,
            displayName: profile?.display_name || 'Anonymous',
            avatarNft: profile?.avatar_nft || null,
            reactions: [reactionEmojis[reaction_type]],
            postId: postId.toString()
          });
          console.log(`📬 Post reaction notification sent to ${post.wallet_address}`);
        }
      } catch (notifError) {
        console.error('⚠️ Failed to send notification:', notifError);
        // Don't fail the request if notification fails
      }
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
    safeErrorResponse(res, error);
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

// ============================================
// 🎭 MEME OF THE WEEK API ENDPOINTS
// ============================================

// 📅 Get current week timer
app.get('/api/memes/timer', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('meme_weeks')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    const now = new Date();
    const weekEnd = new Date(data.week_end);
    const nextWeekStart = new Date(weekEnd.getTime() + 1);

    res.json({
      success: true,
      current_week_id: data.id,
      week_start: data.week_start,
      week_end: data.week_end,
      next_week_start: nextWeekStart.toISOString(),
      time_remaining_ms: Math.max(0, weekEnd - now)
    });
  } catch (error) {
    console.error('❌ Timer error:', error);
    safeErrorResponse(res, error);
  }
});

// 📥 Get current week's memes
app.get('/api/memes/current-week', async (req, res) => {
  try {
    // Get current week
    const { data: weekData, error: weekError } = await supabase
      .from('meme_weeks')
      .select('id')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (weekError) throw weekError;

    // Get memes for current week with vote counts
    const { data: memes, error: memesError } = await supabase
      .from('memes')
      .select('id, image_url, caption, vote_count, created_at, wallet_address')
      .eq('week_id', weekData.id)
      .order('created_at', { ascending: true });

    if (memesError) throw memesError;

    // Fetch profile and cosmetics for each meme
    const formattedMemes = await Promise.all(memes.map(async (meme) => {
      // Get user profile with equipped cosmetics
      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          display_name,
          avatar_nft,
          equipped_ring:cosmetics_catalog!profiles_equipped_ring_id_fkey(*)
        `)
        .eq('wallet_address', meme.wallet_address)
        .maybeSingle();

      return {
        id: meme.id,
        image_url: meme.image_url,
        caption: meme.caption,
        vote_count: meme.vote_count || 0,
        created_at: meme.created_at,
        wallet_address: meme.wallet_address,
        username: profile?.display_name || (meme.wallet_address.substring(0, 8) + '...'),
        avatar_nft: profile?.avatar_nft || null,
        equipped_ring: profile?.equipped_ring || null
      };
    }));

    res.json({
      success: true,
      week_id: weekData.id,
      memes: formattedMemes
    });
  } catch (error) {
    console.error('❌ Load memes error:', error);
    safeErrorResponse(res, error);
  }
});

// 📊 Get leaderboard for current week
app.get('/api/memes/leaderboard', async (req, res) => {
  try {
    // Get current week
    const { data: weekData, error: weekError } = await supabase
      .from('meme_weeks')
      .select('id')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (weekError) throw weekError;

    // Get top memes
    const { data: memes, error: memesError} = await supabase
      .from('memes')
      .select('id, image_url, vote_count, wallet_address')
      .eq('week_id', weekData.id)
      .order('vote_count', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);

    if (memesError) throw memesError;

    // Fetch profile and cosmetics for each meme
    const leaderboard = await Promise.all(memes.map(async (meme) => {
      // Get user profile with equipped cosmetics
      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          display_name,
          avatar_nft,
          equipped_ring:cosmetics_catalog!profiles_equipped_ring_id_fkey(*)
        `)
        .eq('wallet_address', meme.wallet_address)
        .maybeSingle();

      return {
        id: meme.id,
        image_url: meme.image_url,
        vote_count: meme.vote_count || 0,
        wallet_address: meme.wallet_address,
        username: profile?.display_name || (meme.wallet_address.substring(0, 8) + '...'),
        avatar_nft: profile?.avatar_nft || null,
        equipped_ring: profile?.equipped_ring || null
      };
    }));

    res.json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error('❌ Leaderboard error:', error);
    safeErrorResponse(res, error);
  }
});

// 🗳️ Get user's votes
app.get('/api/memes/user-votes/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    // Get current week
    const { data: weekData, error: weekError } = await supabase
      .from('meme_weeks')
      .select('id')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (weekError) throw weekError;

    // Get user's votes for current week
    const { data: votes, error: votesError } = await supabase
      .from('meme_votes')
      .select('meme_id')
      .eq('wallet_address', wallet)
      .eq('week_id', weekData.id);

    if (votesError) throw votesError;

    res.json({
      success: true,
      votes: votes || []
    });
  } catch (error) {
    console.error('❌ User votes error:', error);
    safeErrorResponse(res, error);
  }
});

// 📤 Submit a meme
app.post('/api/memes/submit', upload.single('file'), async (req, res) => {
  try {
    const { wallet_address, file_name } = req.body;
    const file = req.file;

    if (!wallet_address || !file) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Validate file type
    const validTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'
    ];
    if (!validTypes.includes(file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Invalid file type' });
    }

    // Get current week
    const { data: weekData, error: weekError } = await supabase
      .from('meme_weeks')
      .select('id')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (weekError) throw weekError;

    // Check if user already submitted this week
    const { data: existingMeme, error: checkError } = await supabase
      .from('memes')
      .select('id')
      .eq('wallet_address', wallet_address)
      .eq('week_id', weekData.id)
      .single();

    if (existingMeme) {
      return res.status(400).json({
        success: false,
        error: 'You have already submitted a meme this week!'
      });
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bearpark-memes')
      .upload(file_name, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('bearpark-memes')
      .getPublicUrl(file_name);

    // Insert meme record
    const { data: memeData, error: memeError } = await supabase
      .from('memes')
      .insert({
        week_id: weekData.id,
        wallet_address: wallet_address,
        image_url: urlData.publicUrl,
        vote_count: 0
      })
      .select()
      .single();

    if (memeError) throw memeError;

    // Check if user already received submission reward this week
    const { data: existingReward } = await supabase
      .from('meme_submission_rewards')
      .select('id')
      .eq('wallet_address', wallet_address)
      .eq('week_id', weekData.id)
      .single();

    let pointsAwarded = 0;

    if (!existingReward) {
      // Award 50 honey points for first submission this week
      const { error: pointsError } = await supabase.rpc('add_honey_points', {
        p_wallet_address: wallet_address,
        p_amount: 50,
        p_source: 'meme_submission',
        p_game_id: null
      });

      if (pointsError) {
        console.warn('⚠️ Failed to award honey points:', pointsError);
      } else {
        // Record that user received submission reward
        await supabase
          .from('meme_submission_rewards')
          .insert({
            wallet_address: wallet_address,
            week_id: weekData.id
          });

        pointsAwarded = 50;
      }
    }

    res.json({
      success: true,
      meme: memeData,
      points_awarded: pointsAwarded
    });
  } catch (error) {
    console.error('❌ Submit meme error:', error);
    safeErrorResponse(res, error);
  }
});

// 🗳️ Vote for a meme
app.post('/api/memes/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { wallet_address } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    // Get meme and verify it exists
    const { data: meme, error: memeError } = await supabase
      .from('memes')
      .select('wallet_address, week_id')
      .eq('id', id)
      .single();

    if (memeError || !meme) {
      return res.status(404).json({ success: false, error: 'Meme not found' });
    }

    // Prevent voting for own meme
    if (meme.wallet_address.toLowerCase() === wallet_address.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'You cannot vote for your own meme!'
      });
    }

    console.log('🗳️ Vote request for meme', id, 'from wallet', wallet_address);

    // Check if user has ANY vote this week (for vote switching)
    const { data: previousVote, error: prevCheckError } = await supabase
      .from('meme_votes')
      .select('id, meme_id')
      .eq('wallet_address', wallet_address)
      .eq('week_id', meme.week_id)
      .maybeSingle();

    console.log('🔍 Previous vote found:', previousVote);

    let switched = false;
    let oldMemeId = null;

    // If user already voted for THIS same meme, do nothing (already voted)
    if (previousVote && previousVote.meme_id === parseInt(id)) {
      console.log('⚠️ User already voted for this meme, no action needed');
      return res.json({
        success: true,
        message: 'Already voted for this meme',
        switched: false,
        alreadyVoted: true,
        memeId: parseInt(id)
      });
    }

    // If user has a previous vote for a DIFFERENT meme, remove it (vote switching)
    if (previousVote && previousVote.meme_id !== parseInt(id)) {
      oldMemeId = previousVote.meme_id;
      switched = true;

      console.log('🔄 Switching vote from meme', oldMemeId, 'to meme', id);

      // Delete old vote
      const { error: deleteError } = await supabase
        .from('meme_votes')
        .delete()
        .eq('id', previousVote.id);

      if (deleteError) {
        console.error('❌ Failed to delete old vote:', deleteError);
        throw deleteError;
      }

      // Decrement old meme's vote count
      const { data: oldMeme } = await supabase
        .from('memes')
        .select('vote_count')
        .eq('id', oldMemeId)
        .single();

      if (oldMeme) {
        await supabase
          .from('memes')
          .update({ vote_count: Math.max(0, oldMeme.vote_count - 1) })
          .eq('id', oldMemeId);
      }
    }

    console.log('➕ Inserting new vote for meme', id);

    // Insert new vote
    const { error: voteError } = await supabase
      .from('meme_votes')
      .insert({
        meme_id: id,
        wallet_address: wallet_address,
        week_id: meme.week_id
      });

    if (voteError) {
      console.error('❌ Failed to insert vote:', voteError);
      throw voteError;
    }

    // Increment new meme's vote count
    const { error: updateError } = await supabase.rpc('increment_meme_votes', {
      meme_id: id
    });

    if (updateError) {
      console.error('❌ Failed to increment vote count:', updateError);
      throw updateError;
    }

    console.log('✅ Vote recorded successfully');

    res.json({
      success: true,
      message: switched ? 'Vote switched successfully' : 'Vote recorded successfully',
      switched: switched,
      oldMemeId: oldMemeId,
      newMemeId: parseInt(id)
    });
  } catch (error) {
    console.error('❌ Vote error:', error);
    safeErrorResponse(res, error);
  }
});

// 🗳️ Unvote (remove vote from a meme)
app.delete('/api/memes/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const wallet_address = req.query.wallet_address || req.body.wallet_address;

    console.log('🗑️ Unvote request:', { meme_id: id, wallet_address });

    if (!wallet_address) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    // Check if user has voted for this meme
    const { data: existingVote, error: checkError } = await supabase
      .from('meme_votes')
      .select('id, week_id')
      .eq('meme_id', id)
      .eq('wallet_address', wallet_address)
      .maybeSingle();

    console.log('🔍 Found existing vote:', existingVote);

    if (!existingVote) {
      console.log('⚠️ No vote found to delete');
      return res.status(400).json({
        success: false,
        error: 'You have not voted for this meme!'
      });
    }

    // Delete the vote directly by meme_id and wallet_address
    const { error: deleteError, count } = await supabase
      .from('meme_votes')
      .delete()
      .eq('meme_id', id)
      .eq('wallet_address', wallet_address);

    if (deleteError) {
      console.error('❌ Delete error:', deleteError);
      throw deleteError;
    }

    console.log('✅ Vote deleted from database');

    // Decrement meme's vote count
    const { data: meme } = await supabase
      .from('memes')
      .select('vote_count')
      .eq('id', id)
      .single();

    if (meme) {
      const newCount = Math.max(0, meme.vote_count - 1);
      await supabase
        .from('memes')
        .update({ vote_count: newCount })
        .eq('id', id);

      console.log(`📉 Vote count updated: ${meme.vote_count} -> ${newCount}`);
    }

    res.json({
      success: true,
      message: 'Vote removed successfully',
      memeId: parseInt(id)
    });
  } catch (error) {
    console.error('❌ Unvote error:', error);
    safeErrorResponse(res, error);
  }
});

// 🗑️ Delete a meme
app.delete('/api/memes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { wallet_address } = req.body;

    console.log('🗑️ Delete meme request:', { meme_id: id, wallet_address });

    if (!wallet_address) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    // Get the meme to verify ownership
    const { data: meme, error: fetchError } = await supabase
      .from('memes')
      .select('wallet_address, image_url')
      .eq('id', id)
      .single();

    if (fetchError || !meme) {
      return res.status(404).json({ success: false, error: 'Meme not found' });
    }

    // Verify ownership
    if (meme.wallet_address.toLowerCase() !== wallet_address.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'You can only delete your own memes' });
    }

    // Delete from database (cascades to votes)
    const { error: deleteError } = await supabase
      .from('memes')
      .delete()
      .eq('id', id)
      .eq('wallet_address', wallet_address);

    if (deleteError) {
      console.error('❌ Delete error:', deleteError);
      throw deleteError;
    }

    console.log('✅ Meme deleted successfully');

    res.json({
      success: true,
      message: 'Meme deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete meme error:', error);
    safeErrorResponse(res, error);
  }
});

// 🔄 WEEK RESET: Award winners and create new week
app.post('/api/memes/reset-week', async (req, res) => {
  try {
    console.log('🔄 Week reset triggered...');

    // Get current week
    const { data: currentWeek, error: weekError } = await supabase
      .from('meme_weeks')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (weekError) throw weekError;

    const now = new Date();
    const weekEnd = new Date(currentWeek.week_end);

    console.log(`📅 Current week: ${currentWeek.week_start} to ${currentWeek.week_end}`);
    console.log(`⏰ Now: ${now.toISOString()}`);
    console.log(`🔚 Week ends: ${weekEnd.toISOString()}`);

    // Check if week has ended
    if (now < weekEnd) {
      return res.json({
        success: false,
        message: 'Current week has not ended yet',
        week_end: currentWeek.week_end,
        time_remaining_ms: weekEnd - now
      });
    }

    console.log('✅ Week has ended, processing winners...');

    // Get ALL memes from the ended week, sorted by votes
    const { data: allMemes, error: memesError } = await supabase
      .from('memes')
      .select('id, wallet_address, vote_count, caption')
      .eq('week_id', currentWeek.id)
      .order('vote_count', { ascending: false })
      .order('id', { ascending: true }); // Secondary sort for consistent ordering

    if (memesError) throw memesError;

    const rewards = [50, 35, 20];
    const medals = ['🥇', '🥈', '🥉'];
    const winners = [];

    // Handle ties: All memes with same vote count get same rank and reward
    if (allMemes && allMemes.length > 0) {
      let position = 1; // Position in sorted list (1st, 2nd, 3rd...)
      let currentRank = 1; // Actual rank (considering ties)
      let previousVoteCount = null;

      for (const meme of allMemes) {
        // If vote count changed, update rank to current position
        if (previousVoteCount !== null && meme.vote_count < previousVoteCount) {
          currentRank = position;
        }

        // Stop if we're past 3rd place
        if (currentRank > 3) break;

        const reward = rewards[currentRank - 1];
        const medal = medals[currentRank - 1];

        console.log(`${medal} Awarding ${reward} honey to ${meme.wallet_address} (${meme.vote_count} votes, rank ${currentRank}, position ${position})`);

        const { error: pointsError } = await supabase.rpc('add_honey_points', {
          p_wallet_address: meme.wallet_address,
          p_amount: reward,
          p_source: 'meme_winner',
          p_game_id: null
        });

        if (pointsError) {
          console.error(`❌ Failed to award points to ${meme.wallet_address}:`, pointsError);
        } else {
          winners.push({
            rank: currentRank,
            medal,
            wallet_address: meme.wallet_address,
            vote_count: meme.vote_count,
            reward,
            caption: meme.caption
          });
        }

        previousVoteCount = meme.vote_count;
        position++;
      }
    }

    console.log('🗑️ Deleting old memes and files...');

    // Get ALL memes from the ended week (to delete their files)
    const { data: allOldMemes, error: fetchOldMemesError } = await supabase
      .from('memes')
      .select('id, image_url')
      .eq('week_id', currentWeek.id);

    let memesDeletedCount = 0;

    if (fetchOldMemesError) {
      console.error('⚠️ Failed to fetch old memes for deletion:', fetchOldMemesError);
    } else if (allOldMemes && allOldMemes.length > 0) {
      memesDeletedCount = allOldMemes.length;
      console.log(`Found ${allOldMemes.length} old memes to delete`);

      // Delete files from storage
      for (const meme of allOldMemes) {
        try {
          // Extract file path from URL
          // Format: https://[project].supabase.co/storage/v1/object/public/bearpark-memes/[filepath]
          const urlParts = meme.image_url.split('/bearpark-memes/');
          if (urlParts.length === 2) {
            const filePath = urlParts[1];
            console.log(`Deleting file: ${filePath}`);

            const { error: deleteFileError } = await supabase.storage
              .from('bearpark-memes')
              .remove([filePath]);

            if (deleteFileError) {
              console.error(`⚠️ Failed to delete file ${filePath}:`, deleteFileError);
            } else {
              console.log(`✅ Deleted file: ${filePath}`);
            }
          }
        } catch (err) {
          console.error('⚠️ Error parsing/deleting file:', err);
        }
      }

      // Delete memes from database (CASCADE will delete votes too)
      const { error: deleteMemesError } = await supabase
        .from('memes')
        .delete()
        .eq('week_id', currentWeek.id);

      if (deleteMemesError) {
        console.error('⚠️ Failed to delete old memes:', deleteMemesError);
      } else {
        console.log(`✅ Deleted ${allOldMemes.length} memes from database`);
      }
    }

    console.log('🆕 Creating new week...');

    // Create new week (Sunday 00:00 UTC to next Sunday 00:00 UTC)
    const newWeekStart = new Date(weekEnd.getTime() + 1000); // 1 second after old week ends

    // Calculate next Sunday at 00:00 UTC
    const getNextSundayMidnightUTC = (fromDate) => {
      const currentDow = fromDate.getUTCDay(); // 0 = Sunday

      // Calculate days until next Sunday
      let daysUntilSunday = (7 - currentDow) % 7;
      if (daysUntilSunday === 0) {
        daysUntilSunday = 7; // If it's Sunday, go to NEXT Sunday for a full week
      }

      // Create target date at 00:00 UTC on the next Sunday
      const targetDate = new Date(fromDate);
      targetDate.setUTCDate(targetDate.getUTCDate() + daysUntilSunday);
      targetDate.setUTCHours(0, 0, 0, 0);

      console.log(`📅 Next Sunday 00:00 UTC: ${targetDate.toISOString()} (${daysUntilSunday} days from now)`);

      return targetDate;
    };

    const newWeekEnd = getNextSundayMidnightUTC(newWeekStart);

    const { data: newWeek, error: createError } = await supabase
      .from('meme_weeks')
      .insert({
        week_start: newWeekStart.toISOString(),
        week_end: newWeekEnd.toISOString()
      })
      .select()
      .single();

    if (createError) throw createError;

    console.log(`✅ New week created: ${newWeek.week_start} to ${newWeek.week_end}`);

    res.json({
      success: true,
      message: 'Week reset complete!',
      old_week: {
        id: currentWeek.id,
        week_start: currentWeek.week_start,
        week_end: currentWeek.week_end
      },
      winners,
      memes_deleted: memesDeletedCount,
      new_week: {
        id: newWeek.id,
        week_start: newWeek.week_start,
        week_end: newWeek.week_end
      }
    });

  } catch (error) {
    console.error('❌ Week reset error:', error);
    safeErrorResponse(res, error);
  }
});

// =======================
// BEARDROPS AIRDROP SYSTEM
// =======================

// APEX wallet - only this wallet can see full admin data
const APEX_WALLET = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT';

// Middleware to verify APEX wallet
const verifyApex = (req, res, next) => {
  const wallet = req.body.wallet || req.query.wallet || req.headers['x-wallet'];
  if (!wallet || wallet.toLowerCase() !== APEX_WALLET.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Unauthorized: APEX wallet required' });
  }
  next();
};

// Get airdrop configuration
app.get('/api/beardrops/config', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('airdrop_config')
      .select('key, value, description');

    if (error) throw error;

    // Convert array to object for easier consumption
    const config = {};
    data.forEach(row => {
      config[row.key] = row.value;
    });

    res.json({ success: true, config });
  } catch (error) {
    console.error('❌ Error fetching airdrop config:', error);
    safeErrorResponse(res, error);
  }
});

// Check wallet eligibility for airdrop
app.get('/api/beardrops/eligibility/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    // Get minimum honey points from config
    const { data: configData } = await supabase
      .from('airdrop_config')
      .select('value')
      .eq('key', 'min_honey_points_24h')
      .single();

    const minHoneyPoints = parseInt(configData?.value || '30');

    // Calculate daily honey points (resets at 00:00 UTC)
    const midnightUTC = new Date();
    midnightUTC.setUTCHours(0, 0, 0, 0);

    const { data: activityData } = await supabase
      .from('honey_points_activity')
      .select('points')
      .eq('wallet_address', wallet)
      .gte('created_at', midnightUTC.toISOString());

    const honeyPoints24h = activityData?.reduce((sum, row) => sum + row.points, 0) || 0;

    // Check if wallet is blacklisted
    const { data: blacklistData } = await supabase
      .from('lp_blacklist')
      .select('reason, detected_at')
      .eq('wallet_address', wallet)
      .eq('is_active', true)
      .single();

    const isBlacklisted = !!blacklistData;
    const isEligible = honeyPoints24h >= minHoneyPoints && !isBlacklisted;

    res.json({
      success: true,
      wallet,
      honey_points_24h: honeyPoints24h,
      min_required: minHoneyPoints,
      is_blacklisted: isBlacklisted,
      blacklist_reason: blacklistData?.reason || null,
      is_eligible: isEligible
    });
  } catch (error) {
    console.error('❌ Error checking eligibility:', error);
    safeErrorResponse(res, error);
  }
});

// Get wallet's latest snapshot data
app.get('/api/beardrops/snapshot/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    const { data, error } = await supabase
      .from('airdrop_snapshots')
      .select('*')
      .eq('wallet_address', wallet)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found

    res.json({
      success: true,
      snapshot: data || null
    });
  } catch (error) {
    console.error('❌ Error fetching snapshot:', error);
    safeErrorResponse(res, error);
  }
});

// Get wallet's airdrop history
app.get('/api/beardrops/history/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const limit = parseInt(req.query.limit) || 30;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    const { data, error } = await supabase
      .from('airdrop_snapshots')
      .select('snapshot_date, pixel_bears, ultra_rares, lp_tokens, nft_reward, lp_reward, total_reward, is_eligible, claim_status, claimed_at, claim_tx_hash')
      .eq('wallet_address', wallet)
      .order('snapshot_date', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      success: true,
      history: data || []
    });
  } catch (error) {
    console.error('❌ Error fetching airdrop history:', error);
    safeErrorResponse(res, error);
  }
});

// Record honey points activity (called from other endpoints when points are earned)
app.post('/api/beardrops/activity', async (req, res) => {
  try {
    const { wallet, points, activity_type, activity_id } = req.body;

    if (!wallet || !points || !activity_type) {
      return res.status(400).json({ success: false, error: 'wallet, points, and activity_type required' });
    }

    const { error } = await supabase
      .from('honey_points_activity')
      .insert({
        wallet_address: wallet,
        points,
        activity_type,
        activity_id: activity_id || null
      });

    if (error) throw error;

    res.json({ success: true, message: 'Activity recorded' });
  } catch (error) {
    console.error('❌ Error recording activity:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Get pending claims summary (APEX only)
app.get('/api/beardrops/admin/pending', verifyApex, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pending_claims_summary')
      .select('*')
      .limit(30);

    if (error) throw error;

    res.json({ success: true, summary: data || [] });
  } catch (error) {
    console.error('❌ Error fetching pending claims:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Get all snapshots for a specific date (APEX only)
app.get('/api/beardrops/admin/snapshots/:date', verifyApex, async (req, res) => {
  try {
    const { date } = req.params;

    const { data, error } = await supabase
      .from('wallet_airdrop_history')
      .select('*')
      .eq('snapshot_date', date)
      .order('total_reward', { ascending: false });

    if (error) throw error;

    res.json({ success: true, snapshots: data || [] });
  } catch (error) {
    console.error('❌ Error fetching snapshots:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Add wallet to LP blacklist (APEX only)
app.post('/api/beardrops/admin/blacklist', verifyApex, async (req, res) => {
  try {
    const { target_wallet, reason, tx_hash, notes } = req.body;

    if (!target_wallet || !reason) {
      return res.status(400).json({ success: false, error: 'target_wallet and reason required' });
    }

    const { data, error } = await supabase
      .from('lp_blacklist')
      .upsert({
        wallet_address: target_wallet,
        reason,
        tx_hash: tx_hash || null,
        notes: notes || null,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'wallet_address' })
      .select()
      .single();

    if (error) throw error;

    console.log(`🚫 Wallet blacklisted: ${target_wallet} - Reason: ${reason}`);

    res.json({ success: true, blacklist_entry: data });
  } catch (error) {
    console.error('❌ Error adding to blacklist:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Remove wallet from LP blacklist (APEX only)
app.post('/api/beardrops/admin/unblacklist', verifyApex, async (req, res) => {
  try {
    const { target_wallet } = req.body;

    if (!target_wallet) {
      return res.status(400).json({ success: false, error: 'target_wallet required' });
    }

    const { error } = await supabase
      .from('lp_blacklist')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('wallet_address', target_wallet);

    if (error) throw error;

    console.log(`✅ Wallet removed from blacklist: ${target_wallet}`);

    res.json({ success: true, message: `Wallet ${target_wallet} removed from blacklist` });
  } catch (error) {
    console.error('❌ Error removing from blacklist:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Get full blacklist (APEX only)
app.get('/api/beardrops/admin/blacklist', verifyApex, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lp_blacklist')
      .select('*')
      .eq('is_active', true)
      .order('detected_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, blacklist: data || [] });
  } catch (error) {
    console.error('❌ Error fetching blacklist:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Update airdrop config (APEX only)
app.post('/api/beardrops/admin/config', verifyApex, async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ success: false, error: 'key and value required' });
    }

    const { error } = await supabase
      .from('airdrop_config')
      .update({ value: value.toString(), updated_at: new Date().toISOString() })
      .eq('key', key);

    if (error) throw error;

    console.log(`⚙️ Airdrop config updated: ${key} = ${value}`);

    res.json({ success: true, message: `Config ${key} updated to ${value}` });
  } catch (error) {
    console.error('❌ Error updating config:', error);
    safeErrorResponse(res, error);
  }
});

// CLAIM AIRDROP - Send $BEAR tokens to eligible wallet
// Requires AIRDROP_WALLET_SECRET env variable
// SECURITY: Multiple layers of protection against exploits
// - Rate limiter: 3 requests per minute per IP+wallet
// - Mutex check: Blocks if already processing
// - Atomic lock: Only one request can acquire lock
// - Row count verification: Ensures lock was actually acquired
app.post('/api/beardrops/claim', claimRateLimiter, validateWallet, async (req, res) => {
  try {
    const { wallet_address } = req.body;

    // Check if airdrop wallet is configured
    if (!process.env.AIRDROP_WALLET_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'Airdrop system not configured. Contact admin.'
      });
    }

    // CRITICAL: Use admin client to bypass RLS for claim operations
    if (!supabaseAdmin) {
      console.error('❌ supabaseAdmin not initialized - cannot process claims');
      return res.status(503).json({
        success: false,
        error: 'Database admin client not configured. Contact admin.'
      });
    }

    // ========== SECURITY FIX #1: CLAIM MUTEX ==========
    // Check if there's already a claim in progress for this wallet
    const { data: inProgress } = await supabase
      .from('airdrop_snapshots')
      .select('id')
      .eq('wallet_address', wallet_address)
      .eq('claim_status', 'processing')
      .maybeSingle();

    if (inProgress) {
      return res.status(429).json({
        success: false,
        error: 'Claim already in progress. Please wait.'
      });
    }

    // ========== CLAIM WINDOW LOGIC ==========
    // Users can ONLY claim YESTERDAY's snapshot
    // Claim window: 00:00 UTC to 23:59 UTC (exactly 24 hours)
    // NO grace period - miss it and it's gone!
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Yesterday's date - this is the ONLY snapshot that can be claimed
    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    console.log(`📅 Claim window open for snapshot: ${yesterdayStr}`);

    // Only yesterday's snapshot is valid - no grace period
    const validDates = [yesterdayStr];

    // Get the latest pending snapshot for this wallet (only valid dates)
    const { data: snapshot, error: snapshotError } = await supabase
      .from('airdrop_snapshots')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('claim_status', 'pending')
      .eq('is_eligible', true)
      .eq('is_blacklisted', false)
      .in('snapshot_date', validDates)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (snapshotError || !snapshot) {
      console.log(`❌ Snapshot query failed for ${wallet_address}:`, snapshotError);
      return res.status(404).json({
        success: false,
        error: 'No pending airdrop found for this wallet'
      });
    }

    console.log(`✅ Found snapshot for ${wallet_address}: id=${snapshot.id}, date=${snapshot.snapshot_date}, status=${snapshot.claim_status}`);

    // Double-check eligibility (daily honey points - resets at 00:00 UTC)
    const midnightUTC = new Date();
    midnightUTC.setUTCHours(0, 0, 0, 0);

    const { data: activityData } = await supabase
      .from('honey_points_activity')
      .select('points')
      .eq('wallet_address', wallet_address)
      .gte('created_at', midnightUTC.toISOString());

    const honeyPoints24h = activityData?.reduce((sum, row) => sum + row.points, 0) || 0;

    // Get minimum required points
    const { data: configData } = await supabase
      .from('airdrop_config')
      .select('value')
      .eq('key', 'min_honey_points_24h')
      .single();

    const minHoneyPoints = parseInt(configData?.value || '30');

    if (honeyPoints24h < minHoneyPoints) {
      return res.status(403).json({
        success: false,
        error: `Need ${minHoneyPoints} honey points in 24h to claim. You have ${honeyPoints24h}.`
      });
    }

    // ========== SECURITY FIX #3: RECALCULATE AMOUNT SERVER-SIDE ==========
    // Don't trust the database value - recalculate from snapshot data
    const BEAR_PER_PIXEL = 1;
    const BEAR_PER_ULTRA = 5;
    const LP_PER_BEAR = 250000;

    const nftReward = (snapshot.pixel_bears || 0) * BEAR_PER_PIXEL +
                      (snapshot.ultra_rares || 0) * BEAR_PER_ULTRA;
    const lpReward = Math.floor(parseFloat(snapshot.lp_tokens || 0) / LP_PER_BEAR);
    const calculatedAmount = nftReward + lpReward;

    // Use the LOWER of stored vs calculated (prevent inflation attacks)
    const claimAmount = Math.min(parseFloat(snapshot.total_reward), calculatedAmount);

    if (claimAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No reward to claim'
      });
    }

    // ========== SECURITY FIX #4: SET PROCESSING LOCK ==========
    // Mark as processing BEFORE sending transaction (prevents race condition)
    // Using two-step approach: UPDATE then verify with SELECT
    console.log(`🔐 Attempting lock for ${wallet_address}: snapshotId=${snapshot.id}, current status=${snapshot.claim_status}`);

    // Step 1: Try to update to 'processing' (using admin client to bypass RLS)
    const { error: updateError, data: updateData } = await supabaseAdmin
      .from('airdrop_snapshots')
      .update({ claim_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', snapshot.id)
      .eq('claim_status', 'pending')  // Only if still pending (atomic check)
      .select();

    console.log(`📝 Update result for ${wallet_address}: rows=${updateData?.length || 0}, error=`, updateError);

    if (updateError) {
      console.error(`❌ Update error for ${wallet_address}:`, updateError);
      return res.status(500).json({
        success: false,
        error: 'Database error during claim. Please try again.'
      });
    }

    // Step 2: Verify the lock was acquired by checking current status
    const { data: verifyData, error: verifyError } = await supabaseAdmin
      .from('airdrop_snapshots')
      .select('id, claim_status')
      .eq('id', snapshot.id)
      .single();

    console.log(`🔍 Lock verification for ${wallet_address}: verifyData=`, verifyData, 'verifyError=', verifyError);

    if (verifyError || !verifyData || verifyData.claim_status !== 'processing') {
      console.warn(`⚠️ Claim lock failed for ${wallet_address} - status is ${verifyData?.claim_status || 'unknown'}, expected 'processing'`);
      return res.status(409).json({
        success: false,
        error: 'Claim already in progress or completed. Please refresh and try again.'
      });
    }

    console.log(`🔒 Claim lock acquired for ${wallet_address}, snapshot ${snapshot.id}`);

    // Send $BEAR via XRPL
    const xrpl = require('xrpl');
    const client = new xrpl.Client('wss://s1.ripple.com');

    await client.connect();

    try {
      const airdropWallet = xrpl.Wallet.fromSecret(process.env.AIRDROP_WALLET_SECRET);

      // Prepare payment transaction
      // BEAR currency in hex format (required for xrpl v4+)
      const BEAR_CURRENCY_HEX = '4245415200000000000000000000000000000000';
      const payment = {
        TransactionType: 'Payment',
        Account: airdropWallet.address,
        Destination: wallet_address,
        Amount: {
          currency: BEAR_CURRENCY_HEX,
          issuer: 'rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW',
          value: claimAmount.toFixed(6)
        }
      };

      // Autofill, sign, and submit
      const prepared = await client.autofill(payment);
      const signed = airdropWallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      const txHash = result.result.hash;
      const txResult = result.result.meta.TransactionResult;

      if (txResult === 'tesSUCCESS') {
        // Update snapshot as claimed (using admin client to bypass RLS)
        await supabaseAdmin
          .from('airdrop_snapshots')
          .update({
            claim_status: 'claimed',
            claimed_at: new Date().toISOString(),
            claim_tx_hash: txHash,
            updated_at: new Date().toISOString()
          })
          .eq('id', snapshot.id);

        // Record transaction
        await supabaseAdmin
          .from('airdrop_transactions')
          .insert({
            snapshot_id: snapshot.id,
            wallet_address,
            amount: claimAmount,
            tx_hash: txHash,
            tx_status: 'validated',
            tx_result: txResult,
            ledger_index: result.result.ledger_index,
            submitted_at: new Date().toISOString(),
            validated_at: new Date().toISOString()
          });

        console.log(`🐻 Airdrop claimed: ${claimAmount} $BEAR sent to ${wallet_address}`);
        console.log(`   TX: ${txHash}`);

        res.json({
          success: true,
          message: `Successfully claimed ${claimAmount.toFixed(2)} $BEAR!`,
          amount: claimAmount,
          tx_hash: txHash,
          explorer_url: `https://xrpscan.com/tx/${txHash}`
        });
      } else {
        // Transaction failed - ROLLBACK the processing lock
        await supabaseAdmin
          .from('airdrop_snapshots')
          .update({ claim_status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', snapshot.id);

        await supabaseAdmin
          .from('airdrop_transactions')
          .insert({
            snapshot_id: snapshot.id,
            wallet_address,
            amount: claimAmount,
            tx_hash: txHash,
            tx_status: 'failed',
            tx_result: txResult,
            submitted_at: new Date().toISOString()
          });

        console.error(`❌ Airdrop claim failed: ${txResult}`);

        res.status(500).json({
          success: false,
          error: `Transaction failed: ${txResult}`
        });
      }
    } catch (txError) {
      // XRPL error - ROLLBACK the processing lock
      console.error('❌ XRPL Transaction error:', txError);
      await supabaseAdmin
        .from('airdrop_snapshots')
        .update({ claim_status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', snapshot.id);
      throw txError;
    } finally {
      await client.disconnect();
    }

  } catch (error) {
    console.error('❌ Error processing claim:', error);
    safeErrorResponse(res, error);
  }
});

// DEBUG: Get ALL snapshots for a wallet - SECURITY: Added auth middleware
app.get('/api/beardrops/debug-snapshots/:wallet', verifyAdmin, async (req, res) => {
  try {
    const { wallet } = req.params;
    const { data: allSnapshots } = await supabase
      .from('airdrop_snapshots')
      .select('id, wallet_address, snapshot_date, claim_status, total_reward, is_eligible, is_blacklisted, created_at, updated_at')
      .eq('wallet_address', wallet)
      .order('snapshot_date', { ascending: false });

    res.json({
      wallet,
      total_count: allSnapshots?.length || 0,
      snapshots: allSnapshots || []
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get claim status for a wallet - SECURITY: Added rate limiting
app.get('/api/beardrops/claim-status/:wallet', claimRateLimiter, async (req, res) => {
  try {
    const { wallet } = req.params;

    // ========== CLAIM WINDOW LOGIC ==========
    // Users can ONLY claim YESTERDAY's snapshot
    // This MUST match the claim endpoint logic exactly!
    const now = new Date();
    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Get pending claims - ONLY for claimable date (yesterday)
    const { data: pending } = await supabase
      .from('airdrop_snapshots')
      .select('snapshot_date, total_reward, is_eligible, claim_status, is_blacklisted')
      .eq('wallet_address', wallet)
      .eq('claim_status', 'pending')
      .eq('is_eligible', true)
      .eq('is_blacklisted', false)  // Blacklisted wallets can't claim
      .eq('snapshot_date', yesterdayStr)  // ONLY yesterday's snapshot is claimable
      .order('snapshot_date', { ascending: false });

    // Get recent claims (include 'claimed' status)
    const { data: claimed } = await supabase
      .from('airdrop_snapshots')
      .select('snapshot_date, total_reward, claimed_at, claim_tx_hash, claim_status')
      .eq('wallet_address', wallet)
      .eq('claim_status', 'claimed')
      .order('claimed_at', { ascending: false })
      .limit(5);

    // ALSO check if yesterday's snapshot was already claimed or is processing
    // This catches the case where someone claimed but we need to show them as "already claimed"
    const { data: yesterdayClaim } = await supabase
      .from('airdrop_snapshots')
      .select('claim_status, claimed_at, total_reward, claim_tx_hash')
      .eq('wallet_address', wallet)
      .eq('snapshot_date', yesterdayStr)
      .in('claim_status', ['claimed', 'processing'])
      .maybeSingle();

    // Get daily honey points (resets at 00:00 UTC)
    const midnightUTC = new Date();
    midnightUTC.setUTCHours(0, 0, 0, 0);

    const { data: activityData } = await supabase
      .from('honey_points_activity')
      .select('points')
      .eq('wallet_address', wallet)
      .gte('created_at', midnightUTC.toISOString());

    const honeyPoints24h = activityData?.reduce((sum, row) => sum + row.points, 0) || 0;

    // Get config
    const { data: configData } = await supabase
      .from('airdrop_config')
      .select('value')
      .eq('key', 'min_honey_points_24h')
      .single();

    const minHoneyPoints = parseInt(configData?.value || '30');

    // Calculate total pending
    const totalPending = pending?.reduce((sum, p) => sum + parseFloat(p.total_reward), 0) || 0;

    // Check if claimed today (UTC) - multiple checks for robustness
    const todayUTC = new Date().toISOString().split('T')[0];

    // Method 1: Check if any claim happened today
    const claimedTodayByDate = claimed?.find(c => {
      const claimDate = c.claimed_at ? new Date(c.claimed_at).toISOString().split('T')[0] : null;
      return claimDate === todayUTC;
    });

    // Method 2: Check if yesterday's snapshot (the one that's claimable) is already claimed/processing
    const yesterdaySnapshotClaimed = yesterdayClaim &&
      (yesterdayClaim.claim_status === 'claimed' || yesterdayClaim.claim_status === 'processing');

    // Either method indicates they've already claimed/are claiming
    const claimedToday = !!claimedTodayByDate || !!yesterdaySnapshotClaimed;
    const claimedAmount = yesterdayClaim?.total_reward || claimedTodayByDate?.total_reward || null;
    const claimedTxHash = yesterdayClaim?.claim_tx_hash || claimedTodayByDate?.claim_tx_hash || null;

    // Final can_claim calculation - must have pending reward for YESTERDAY and not already claimed
    const canClaim = honeyPoints24h >= minHoneyPoints && totalPending > 0 && !claimedToday;

    console.log(`📊 Claim status for ${wallet}:`);
    console.log(`   - yesterdayStr: ${yesterdayStr}`);
    console.log(`   - pending count: ${pending?.length || 0}`);
    console.log(`   - totalPending: ${totalPending}`);
    console.log(`   - claimedToday: ${claimedToday}`);
    console.log(`   - canClaim: ${canClaim}`);
    console.log(`   - yesterdayClaim: ${JSON.stringify(yesterdayClaim)}`);

    res.json({
      success: true,
      wallet,
      honey_points_24h: honeyPoints24h,
      min_required: minHoneyPoints,
      can_claim: canClaim,
      claimed_today: claimedToday,
      claimed_amount: claimedAmount ? parseFloat(claimedAmount) : null,
      amount: claimedAmount ? parseFloat(claimedAmount) : null,
      tx_hash: claimedTxHash,
      pending_rewards: pending || [],
      total_pending: claimedToday ? 0 : totalPending,  // If claimed, show 0 pending
      recent_claims: claimed || [],
      debug: {
        yesterdayStr: yesterdayStr,
        pendingCount: pending?.length || 0,
        yesterdayClaim: yesterdayClaim,
        claimedTodayByDate: !!claimedTodayByDate,
        yesterdaySnapshotClaimed: !!yesterdaySnapshotClaimed
      }
    });
  } catch (error) {
    console.error('❌ Error fetching claim status:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Trigger manual snapshot (APEX only)
app.post('/api/beardrops/admin/trigger-snapshot', verifyApex, async (req, res) => {
  try {
    // This would trigger the daily-airdrop-snapshot.js script
    // For now, return instructions
    res.json({
      success: true,
      message: 'Manual snapshot can be triggered by running: node backend/daily-airdrop-snapshot.js',
      note: 'Automated snapshots run daily at 00:00 UTC via cron'
    });
  } catch (error) {
    console.error('❌ Error triggering snapshot:', error);
    safeErrorResponse(res, error);
  }
});

// ADMIN: Process all pending claims (batch payout - APEX only)
app.post('/api/beardrops/admin/batch-payout', verifyApex, async (req, res) => {
  try {
    const { date } = req.body; // Optional: specific date to process

    // Get all pending, eligible claims
    let query = supabase
      .from('airdrop_snapshots')
      .select('*')
      .eq('claim_status', 'pending')
      .eq('is_eligible', true)
      .eq('is_blacklisted', false);

    if (date) {
      query = query.eq('snapshot_date', date);
    }

    const { data: pendingClaims, error } = await query.order('total_reward', { ascending: false });

    if (error) throw error;

    if (!pendingClaims || pendingClaims.length === 0) {
      return res.json({
        success: true,
        message: 'No pending claims to process',
        processed: 0
      });
    }

    // Calculate totals
    const totalWallets = pendingClaims.length;
    const totalBear = pendingClaims.reduce((sum, c) => sum + parseFloat(c.total_reward), 0);

    // Return summary for confirmation (actual batch processing would require more implementation)
    res.json({
      success: true,
      message: 'Batch payout summary',
      pending_wallets: totalWallets,
      total_bear: totalBear.toFixed(2),
      note: 'Use the claim endpoint for individual payouts or implement batch processing with stored wallet secret'
    });

  } catch (error) {
    console.error('❌ Error processing batch payout:', error);
    safeErrorResponse(res, error);
  }
});

console.log('✅ BEARDROPS airdrop endpoints initialized');

// ========== XRPL TRADING DATA ENDPOINT ==========
// Fetches real-time 24h trading data from XRPL Meta + OnTheDEX APIs

const BEAR_ISSUER = 'rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW';
const BEAR_HEX = '4245415200000000000000000000000000000000';
const XRPLMETA_API = 'https://s1.xrplmeta.org';
const ONTHEDEX_API = 'https://api.onthedex.live/public/v1';

// Cache for trading data (refresh every 60 seconds)
let xrplTradingCache = null;
let xrplTradingCacheTime = 0;
const XRPL_CACHE_TTL = 60000; // 60 seconds

app.get('/api/xrpl/trading-stats', async (req, res) => {
  try {
    const now = Date.now();

    // Check cache
    if (xrplTradingCache && (now - xrplTradingCacheTime) < XRPL_CACHE_TTL) {
      return res.json({ ...xrplTradingCache, cached: true });
    }

    console.log('📊 Fetching BEAR trading stats from XRPL Meta + OnTheDEX + DexScreener...');

    // Fetch from all APIs in parallel
    const [metaResponse, tickerResponse, dexScreenerResponse] = await Promise.all([
      fetch(`${XRPLMETA_API}/token/BEAR:${BEAR_ISSUER}?metrics=true`),
      fetch(`${ONTHEDEX_API}/ticker/BEAR.${BEAR_ISSUER}:XRP`),
      fetch('https://api.dexscreener.com/latest/dex/search?q=BEAR%20XRPL')
    ]);

    let metaData = null;
    let tickerData = null;
    let dexScreenerData = null;

    if (metaResponse.ok) {
      metaData = await metaResponse.json();
    }

    if (tickerResponse.ok) {
      tickerData = await tickerResponse.json();
    }

    if (dexScreenerResponse.ok) {
      const dsData = await dexScreenerResponse.json();
      // Find BEAR pair
      dexScreenerData = dsData.pairs?.find(p =>
        p.baseToken?.symbol === 'BEAR' &&
        p.chainId === 'xrpl'
      );
    }

    // Extract data from XRPL Meta (more accurate trade/trader counts)
    const metrics = metaData?.metrics || {};

    // Extract data from OnTheDEX (volume and price data)
    const pair = tickerData?.pairs?.[0] || {};

    // Extract buy/sell counts from DexScreener
    const dsTxns = dexScreenerData?.txns?.h24 || {};
    const buys24h = dsTxns.buys || 0;
    const sells24h = dsTxns.sells || 0;
    const totalTxns = buys24h + sells24h;

    // Calculate buy/sell ratio from DexScreener transaction counts
    const buyRatio = totalTxns > 0 ? buys24h / totalTxns : 0.5;
    const sellRatio = totalTxns > 0 ? sells24h / totalTxns : 0.5;

    // Get total BEAR volume and split by buy/sell ratio
    const totalBearVol = Math.round(pair.volume_base || 0);
    const buyVolumeBEAR = Math.round(totalBearVol * buyRatio);
    const sellVolumeBEAR = Math.round(totalBearVol * sellRatio);

    // Build response combining all sources
    const result = {
      success: true,
      source: 'XRPL Meta + OnTheDEX + DexScreener',
      cached: false,
      timestamp: now,
      stats: {
        // Price data from OnTheDEX
        price: pair.last || parseFloat(metrics.price) || 0,
        price24hAgo: pair.ago24 || 0,
        priceChange24h: pair.pc24 || 0,
        priceHigh24h: pair.price_hi || 0,
        priceLow24h: pair.price_lo || 0,

        // Volume from XRPL Meta (more accurate) with OnTheDEX as fallback
        volume24hXRP: Math.round(parseFloat(metrics.volume_24h) || pair.volume_quote || 0),
        volume24hBEAR: totalBearVol,
        volume24hUSD: Math.round(pair.volume_usd || 0),

        // Buy/Sell volume breakdown (using DexScreener ratio)
        buyVolumeBEAR,
        sellVolumeBEAR,
        buys24h,
        sells24h,

        // Trade counts from XRPL Meta (matches xMagnetic better)
        totalTrades: parseInt(metrics.exchanges_24h) || pair.num_trades || 0,
        uniqueTraders: parseInt(metrics.takers_24h) || 0,

        // Additional metrics from XRPL Meta
        holders: parseInt(metrics.holders) || 0,
        trustlines: parseInt(metrics.trustlines) || 0,
        marketcap: Math.round(parseFloat(metrics.marketcap) || 0),

        lastUpdated: pair.time ? pair.time * 1000 : now
      }
    };

    // Update cache
    xrplTradingCache = result;
    xrplTradingCacheTime = now;

    console.log('📊 BEAR Trading Stats:', result.stats);
    res.json(result);

  } catch (error) {
    console.error('❌ Error fetching trading stats:', error);

    // Return cached data if available
    if (xrplTradingCache) {
      return res.json({ ...xrplTradingCache, cached: true, error: 'Using cached data' });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

console.log('✅ XRPL Trading Data endpoint initialized');

// ============================================
// BEAR STORE - TOKEN PURCHASES
// ============================================

// Token configurations for the store
const STORE_TOKENS = {
  FARM: {
    currency: 'FARM',
    currencyHex: '4641524D00000000000000000000000000000000', // FARM in hex
    issuer: 'rPrAEfVATUNDTJm9CUa8tYeD7oJrVdEGhU',
    amount: '25000',
    honeyCost: 4000,
    name: 'FARM Token',
    logo: 'https://img.xmagnetic.org/u/rPrAEfVATUNDTJm9CUa8tYeD7oJrVdEGhU_FARM.webp'
  },
  SPIFFY: {
    currency: 'SPIFFY',
    currencyHex: '5350494646590000000000000000000000000000', // SPIFFY in hex
    issuer: 'rZ4yugfiQQMWx1a2ZxvzskL75TZeGgMFp',
    amount: '250',
    honeyCost: 4000,
    name: 'SPIFFY Token',
    logo: 'https://img.xmagnetic.org/u/rZ4yugfiQQMWx1a2ZxvzskL75TZeGgMFp_SPIFFY.webp'
  }
};

// Get available store tokens
app.get('/api/store/tokens', (req, res) => {
  const tokens = Object.entries(STORE_TOKENS).map(([key, token]) => ({
    id: key,
    name: token.name,
    currency: token.currency,
    amount: token.amount,
    honeyCost: token.honeyCost,
    logo: token.logo,
    issuer: token.issuer
  }));
  res.json({ success: true, tokens });
});

// Check if user has trustline for a token
app.get('/api/store/check-trustline/:wallet/:tokenType', async (req, res) => {
  const xrpl = require('xrpl');
  const { wallet, tokenType } = req.params;

  const token = STORE_TOKENS[tokenType.toUpperCase()];
  if (!token) {
    return res.status(400).json({ success: false, error: 'Invalid token type' });
  }

  const client = new xrpl.Client('wss://s1.ripple.com');

  try {
    await client.connect();

    const response = await client.request({
      command: 'account_lines',
      account: wallet,
      peer: token.issuer
    });

    const hasTrustline = response.result.lines.some(
      line => line.currency === token.currency || line.currency === token.currencyHex
    );

    await client.disconnect();

    res.json({
      success: true,
      hasTrustline,
      token: token.currency,
      issuer: token.issuer
    });
  } catch (error) {
    try { await client.disconnect(); } catch (e) {}

    // If account not found, they definitely don't have trustline
    if (error.message?.includes('actNotFound')) {
      return res.json({ success: true, hasTrustline: false, token: token.currency, issuer: token.issuer });
    }

    console.error('Error checking trustline:', error);
    safeErrorResponse(res, error);
  }
});

// Purchase token from store
app.post('/api/store/purchase-token', async (req, res) => {
  const xrpl = require('xrpl');
  const { wallet_address, token_type } = req.body;

  if (!wallet_address || !token_type) {
    return res.status(400).json({
      success: false,
      error: 'wallet_address and token_type are required'
    });
  }

  const token = STORE_TOKENS[token_type.toUpperCase()];
  if (!token) {
    return res.status(400).json({ success: false, error: 'Invalid token type' });
  }

  const client = new xrpl.Client('wss://s1.ripple.com', { connectionTimeout: 10000 });

  try {
    console.log(`🛒 Token purchase attempt: ${token_type} for ${wallet_address}`);

    // 1. Check user's honey points FIRST
    const { data: pointsData } = await supabase
      .from('honey_points')
      .select('total_points')
      .eq('wallet_address', wallet_address)
      .single();

    const currentPoints = pointsData?.total_points || 0;

    if (currentPoints < token.honeyCost) {
      return res.status(400).json({
        success: false,
        error: `Not enough Honey Points. Need ${token.honeyCost.toLocaleString()}, have ${Math.floor(currentPoints).toLocaleString()}`
      });
    }

    // 2. Check trustline BEFORE deducting points
    console.log(`   Connecting to XRPL...`);
    await client.connect();
    console.log(`   Connected! Checking trustline for ${token.currency}...`);

    const trustlineResponse = await client.request({
      command: 'account_lines',
      account: wallet_address,
      peer: token.issuer
    });
    console.log(`   Got trustline response, lines: ${trustlineResponse.result?.lines?.length || 0}`);

    const lines = trustlineResponse.result?.lines || [];
    const hasTrustline = lines.some(
      line => line.currency === token.currency || line.currency === token.currencyHex
    );
    console.log(`   Has trustline: ${hasTrustline}`);

    if (!hasTrustline) {
      console.log(`   No trustline - disconnecting client...`);
      try { await client.disconnect(); } catch (e) { console.log('   Disconnect error (ignored):', e.message); }

      // Log the failed attempt (no trustline)
      console.log(`   Logging failed attempt to database...`);
      try {
        await supabase
          .from('store_token_transactions')
          .insert({
            wallet_address,
            token_type: token_type.toUpperCase(),
            token_amount: token.amount,
            honey_spent: 0,
            tx_hash: null,
            tx_status: 'failed',
            error_message: `No ${token.currency} trustline set`
          });
        console.log(`   Database insert successful`);
      } catch (dbErr) {
        console.log(`   Database insert failed (ignored):`, dbErr.message);
      }

      console.log(`❌ Token purchase FAILED: No trustline for ${token.currency} - ${wallet_address}`);

      return res.status(400).json({
        success: false,
        error: `YOU NEED TO SET THE ${token.currency} TRUST LINE FIRST!`,
        needsTrustline: true,
        trustlineInfo: {
          currency: token.currency,
          issuer: token.issuer
        }
      });
    }

    // 3. Deduct honey points
    const newPoints = currentPoints - token.honeyCost;
    const { error: pointsError } = await supabase
      .from('honey_points')
      .update({ total_points: newPoints })
      .eq('wallet_address', wallet_address);

    if (pointsError) {
      await client.disconnect();
      throw pointsError;
    }

    // 4. Send tokens via XRPL
    const airdropWallet = xrpl.Wallet.fromSecret(process.env.AIRDROP_WALLET_SECRET);

    const payment = {
      TransactionType: 'Payment',
      Account: airdropWallet.address,
      Destination: wallet_address,
      Amount: {
        currency: token.currencyHex,
        issuer: token.issuer,
        value: token.amount
      }
    };

    const prepared = await client.autofill(payment);
    const signed = airdropWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    const txHash = result.result.hash;
    const txResult = result.result.meta.TransactionResult;

    await client.disconnect();

    if (txResult === 'tesSUCCESS') {
      // Record transaction
      const { error: insertError } = await supabase
        .from('store_token_transactions')
        .insert({
          wallet_address,
          token_type: token_type.toUpperCase(),
          token_amount: token.amount,
          honey_spent: token.honeyCost,
          tx_hash: txHash,
          tx_status: 'validated'
        });

      if (insertError) {
        console.log('Transaction record error (table may not exist):', insertError.message);
      }

      console.log(`🛒 Store purchase: ${token.amount} ${token.currency} sent to ${wallet_address}`);
      console.log(`   TX: ${txHash}`);

      res.json({
        success: true,
        message: `Successfully purchased ${Number(token.amount).toLocaleString()} ${token.currency}!`,
        amount: token.amount,
        currency: token.currency,
        new_balance: newPoints,
        tx_hash: txHash,
        explorer_url: `https://xrpscan.com/tx/${txHash}`
      });
    } else {
      // Transaction failed - REFUND honey points
      await supabase
        .from('honey_points')
        .update({ total_points: currentPoints })
        .eq('wallet_address', wallet_address);

      // Log failed transaction
      await supabase
        .from('store_token_transactions')
        .insert({
          wallet_address,
          token_type: token_type.toUpperCase(),
          token_amount: token.amount,
          honey_spent: 0, // Refunded
          tx_hash: txHash || null,
          tx_status: 'failed',
          error_message: txResult
        });

      console.log(`❌ Token purchase FAILED: ${txResult} for ${wallet_address}`);

      res.status(500).json({
        success: false,
        error: `Transaction failed: ${txResult}. Your Honey Points have been refunded.`
      });
    }
  } catch (error) {
    try { await client.disconnect(); } catch (e) {}

    // Log error transaction
    if (token) {
      await supabase
        .from('store_token_transactions')
        .insert({
          wallet_address,
          token_type: token_type.toUpperCase(),
          token_amount: token.amount,
          honey_spent: 0,
          tx_hash: null,
          tx_status: 'error',
          error_message: error.message?.substring(0, 255) || 'Unknown error'
        }).catch(() => {}); // Ignore if insert fails
    }

    // Handle account not found (no trustline)
    if (error.message?.includes('actNotFound')) {
      return res.status(400).json({
        success: false,
        error: `YOU NEED TO SET THE ${token.currency} TRUST LINE FIRST!`,
        needsTrustline: true,
        trustlineInfo: {
          currency: token.currency,
          issuer: token.issuer
        }
      });
    }

    console.error('Error purchasing token:', error.message, error.stack);

    // Make sure we always send a response
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Unknown error occurred' });
    }
  }
});

console.log('✅ Token Store endpoints initialized');

// ============================================
// BEAR STORE - NFT PURCHASES (Pixel BEARS)
// ============================================

const NFT_STORE_WALLET = 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9';
const NFT_ISSUER = 'rBEARKfWJS1LYdg2g6t99BgbvpWY5pgMB9';
const NFT_HONEY_COST = 10000;

// Helper to decode hex URI to string
function hexToString(hex) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (code) str += String.fromCharCode(code);
  }
  return str;
}

// Get available NFTs from the store wallet (filters out already purchased)
app.get('/api/store/nfts', async (req, res) => {
  const xrpl = require('xrpl');
  const client = new xrpl.Client('wss://s1.ripple.com');

  try {
    await client.connect();

    // Get all NFTs from the store wallet
    const response = await client.request({
      command: 'account_nfts',
      account: NFT_STORE_WALLET,
      limit: 100
    });

    await client.disconnect();

    const allNfts = response.result.account_nfts || [];

    // Get already purchased NFT token IDs from database
    const { data: purchased } = await supabase
      .from('nft_purchase_requests')
      .select('nft_token_id')
      .in('status', ['pending', 'fulfilled']);

    const purchasedIds = new Set((purchased || []).map(p => p.nft_token_id).filter(Boolean));

    // Filter out already purchased NFTs (show ALL NFTs in the wallet)
    // First map to basic info, then fetch metadata for each
    const availableNftsBasic = allNfts.filter(nft => !purchasedIds.has(nft.NFTokenID));

    // Process each NFT and try to fetch metadata for images
    const availableNfts = await Promise.all(availableNftsBasic.map(async (nft) => {
      let uri = '';
      let imageUrl = 'https://pub-58cecf0785cc4738a3496a79699fdf1e.r2.dev/images/v2jedg.png'; // default
      let name = 'Pixel BEAR';
      let rawUri = nft.URI || '';

      // Helper to properly encode IPFS paths (handles spaces, #, etc.)
      const encodeIpfsPath = (ipfsPath) => {
        const parts = ipfsPath.split('/');
        // First part is the CID, rest is the filename that needs encoding
        const cid = parts[0];
        const filename = parts.slice(1).join('/');
        if (filename) {
          return cid + '/' + encodeURIComponent(filename);
        }
        return cid;
      };

      if (nft.URI) {
        uri = hexToString(nft.URI);
        console.log(`NFT ${nft.NFTokenID.substring(0, 8)}... Raw URI: ${uri}`);

        // Handle different URI formats
        let metadataUrl = null;

        if (uri.startsWith('ipfs://')) {
          // IPFS protocol URI - need to encode the path for special chars
          const ipfsPath = uri.replace('ipfs://', '');
          metadataUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(ipfsPath)}`;
        } else if (uri.startsWith('https://') || uri.startsWith('http://')) {
          // Direct HTTP URL
          metadataUrl = uri;
        } else if (uri.match(/^Qm[a-zA-Z0-9]{44}/) || uri.match(/^bafy[a-zA-Z0-9]+/)) {
          // Raw IPFS CID (starts with Qm or bafy)
          metadataUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(uri)}`;
        }

        // If we have a metadata URL, try to fetch it to get the image
        if (metadataUrl) {
          try {
            console.log(`Fetching metadata from: ${metadataUrl}`);
            const metaResponse = await fetch(metadataUrl, {
              timeout: 5000,
              headers: { 'Accept': 'application/json, image/*' }
            });

            const contentType = metaResponse.headers.get('content-type') || '';

            if (contentType.includes('application/json') || contentType.includes('text/')) {
              // It's JSON metadata - parse and get image
              const metadata = await metaResponse.json();
              console.log(`Metadata keys: ${Object.keys(metadata).join(', ')}`);

              // Try common image field names
              let imgField = metadata.image || metadata.image_url || metadata.imageUrl ||
                           metadata.animation_url || metadata.file || metadata.media;

              if (imgField) {
                if (imgField.startsWith('ipfs://')) {
                  // Encode the IPFS path properly for special chars like # and spaces
                  const imgPath = imgField.replace('ipfs://', '');
                  imageUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(imgPath)}`;
                } else if (imgField.startsWith('http')) {
                  imageUrl = imgField;
                } else if (imgField.match(/^Qm[a-zA-Z0-9]{44}/) || imgField.match(/^bafy/)) {
                  imageUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(imgField)}`;
                }
                console.log(`Found image URL: ${imageUrl}`);
              }

              // Get name from metadata
              if (metadata.name) {
                name = metadata.name;
              }
            } else if (contentType.includes('image/')) {
              // The URI itself points directly to an image
              imageUrl = metadataUrl;
              console.log(`URI is direct image: ${imageUrl}`);
            }
          } catch (fetchError) {
            console.log(`Could not fetch metadata: ${fetchError.message}`);
            // Keep default image if metadata fetch fails
          }
        }
      }

      return {
        nftTokenId: nft.NFTokenID,
        name: name,
        uri: uri,
        rawUri: rawUri,
        imageUrl: imageUrl,
        honeyCost: NFT_HONEY_COST,
        issuer: nft.Issuer,
        taxon: nft.NFTokenTaxon
      };
    }));

    res.json({
      success: true,
      nfts: availableNfts,
      totalAvailable: availableNfts.length,
      honeyCost: NFT_HONEY_COST
    });

  } catch (error) {
    try { await client.disconnect(); } catch (e) {}
    console.error('Error fetching store NFTs:', error);
    safeErrorResponse(res, error);
  }
});

// Fetch NFT image URL from URI (for inventory display)
app.get('/api/nft/image/:hexUri', async (req, res) => {
  try {
    const hexUri = req.params.hexUri;
    if (!hexUri) {
      return res.json({ success: false, error: 'No URI provided' });
    }

    // Decode hex to string
    const uri = hexToString(hexUri);
    console.log(`[NFT Image API] Decoding URI: ${uri}`);

    let imageUrl = null;
    let name = 'BEAR';

    // Helper to properly encode IPFS paths (handles spaces, #, etc.)
    const encodeIpfsPath = (ipfsPath) => {
      const parts = ipfsPath.split('/');
      const cid = parts[0];
      const filename = parts.slice(1).join('/');
      if (filename) {
        return cid + '/' + encodeURIComponent(filename);
      }
      return cid;
    };

    // Build metadata URL
    let metadataUrl = null;
    if (uri.startsWith('ipfs://')) {
      const ipfsPath = uri.replace('ipfs://', '');
      metadataUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(ipfsPath)}`;
    } else if (uri.startsWith('http')) {
      metadataUrl = uri;
    } else if (uri.match(/^Qm[a-zA-Z0-9]{44}/) || uri.match(/^bafy/)) {
      metadataUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(uri)}`;
    }

    if (metadataUrl) {
      console.log(`[NFT Image API] Fetching metadata from: ${metadataUrl}`);
      const metaResponse = await fetch(metadataUrl, { timeout: 10000 });
      const contentType = metaResponse.headers.get('content-type') || '';

      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const metadata = await metaResponse.json();

        // Get name
        if (metadata.name) {
          name = metadata.name;
        }

        // Try to get image - check animation first for animated NFTs
        let imgField = metadata.animation || metadata.animation_url ||
                       metadata.image || metadata.image_url || metadata.media;

        if (imgField) {
          if (imgField.startsWith('ipfs://')) {
            const imgPath = imgField.replace('ipfs://', '');
            imageUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(imgPath)}`;
          } else if (imgField.startsWith('http')) {
            imageUrl = imgField;
          } else if (imgField.match(/^Qm[a-zA-Z0-9]{44}/) || imgField.match(/^bafy/)) {
            imageUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(imgField)}`;
          }
        }

        // Also get fallback image if animation exists
        let fallbackUrl = null;
        if (metadata.animation && metadata.image) {
          const fallbackField = metadata.image;
          if (fallbackField.startsWith('ipfs://')) {
            const imgPath = fallbackField.replace('ipfs://', '');
            fallbackUrl = `https://ipfs.io/ipfs/${encodeIpfsPath(imgPath)}`;
          } else if (fallbackField.startsWith('http')) {
            fallbackUrl = fallbackField;
          }
        }

        console.log(`[NFT Image API] Found image: ${imageUrl}`);
        return res.json({
          success: true,
          imageUrl,
          fallbackUrl,
          name,
          isAnimated: !!metadata.animation
        });
      } else if (contentType.includes('image/')) {
        // URI points directly to image
        return res.json({
          success: true,
          imageUrl: metadataUrl,
          name
        });
      }
    }

    res.json({ success: false, error: 'Could not extract image URL' });
  } catch (error) {
    console.error('[NFT Image API] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// Request specific NFT purchase (by NFTokenID)
app.post('/api/store/request-nft', async (req, res) => {
  const { wallet_address, nft_token_id } = req.body;

  if (!wallet_address || !nft_token_id) {
    return res.status(400).json({
      success: false,
      error: 'wallet_address and nft_token_id are required'
    });
  }

  try {
    // 1. Check if this NFT is already purchased/pending
    const { data: existingPurchase } = await supabase
      .from('nft_purchase_requests')
      .select('id, status, wallet_address')
      .eq('nft_token_id', nft_token_id)
      .in('status', ['pending', 'fulfilled'])
      .single();

    if (existingPurchase) {
      return res.status(400).json({
        success: false,
        error: 'NFT ALREADY PURCHASED! This NFT has been claimed by another user.',
        alreadyPurchased: true
      });
    }

    // 2. Verify NFT still exists in store wallet
    const xrpl = require('xrpl');
    const client = new xrpl.Client('wss://s1.ripple.com');
    await client.connect();

    const response = await client.request({
      command: 'account_nfts',
      account: NFT_STORE_WALLET,
      limit: 100
    });

    await client.disconnect();

    const nftExists = response.result.account_nfts.some(nft => nft.NFTokenID === nft_token_id);

    if (!nftExists) {
      return res.status(400).json({
        success: false,
        error: 'NFT ALREADY PURCHASED! This NFT is no longer available.',
        alreadyPurchased: true
      });
    }

    // 3. Check user's honey points
    const { data: pointsData } = await supabase
      .from('honey_points')
      .select('total_points')
      .eq('wallet_address', wallet_address)
      .single();

    const currentPoints = pointsData?.total_points || 0;

    if (currentPoints < NFT_HONEY_COST) {
      return res.status(400).json({
        success: false,
        error: `Not enough Honey Points. Need ${NFT_HONEY_COST.toLocaleString()}, have ${Math.floor(currentPoints).toLocaleString()}`
      });
    }

    // 4. Deduct honey points
    const newPoints = currentPoints - NFT_HONEY_COST;
    const { error: pointsError } = await supabase
      .from('honey_points')
      .update({ total_points: newPoints })
      .eq('wallet_address', wallet_address);

    if (pointsError) throw pointsError;

    // 5. Create NFT request record with specific token ID
    const { data: request, error: requestError } = await supabase
      .from('nft_purchase_requests')
      .insert({
        wallet_address,
        nft_token_id: nft_token_id,
        nft_type: 'PIXEL_BEAR',
        nft_name: 'Pixel BEAR NFT',
        honey_spent: NFT_HONEY_COST,
        status: 'pending',
        requested_at: new Date().toISOString()
      })
      .select()
      .single();

    if (requestError) {
      // Refund points if request creation failed
      await supabase
        .from('honey_points')
        .update({ total_points: currentPoints })
        .eq('wallet_address', wallet_address);
      throw requestError;
    }

    console.log(`🎨 NFT Request: Pixel BEAR (${nft_token_id.slice(0, 16)}...) requested by ${wallet_address}`);
    console.log(`   Request ID: ${request.id}`);

    res.json({
      success: true,
      message: 'Your Pixel BEAR NFT request has been submitted! It will be sent to you shortly.',
      request_id: request.id,
      nft_token_id: nft_token_id,
      new_balance: newPoints,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error creating NFT request:', error);
    safeErrorResponse(res, error);
  }
});

// Get user's NFT requests (for inventory)
app.get('/api/store/nft-requests/:wallet', async (req, res) => {
  const { wallet } = req.params;

  try {
    const { data: requests, error } = await supabase
      .from('nft_purchase_requests')
      .select('*')
      .eq('wallet_address', wallet)
      .order('requested_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, requests: requests || [] });
  } catch (error) {
    console.error('Error fetching NFT requests:', error);
    safeErrorResponse(res, error);
  }
});

// Admin: Get all token purchases - SECURITY: Added auth middleware
app.get('/api/admin/token-purchases', verifyAdmin, async (req, res) => {
  try {
    const { data: purchases, error } = await supabase
      .from('store_token_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, purchases: purchases || [] });
  } catch (error) {
    console.error('Error fetching token purchases:', error);
    safeErrorResponse(res, error);
  }
});

// Admin: Get all pending NFT requests - SECURITY: Added auth middleware
app.get('/api/admin/nft-requests', verifyAdmin, async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('nft_purchase_requests')
      .select('*')
      .order('requested_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, requests: requests || [] });
  } catch (error) {
    console.error('Error fetching admin NFT requests:', error);
    safeErrorResponse(res, error);
  }
});

// Admin: Mark NFT request as fulfilled - SECURITY: Added auth middleware
app.post('/api/admin/fulfill-nft-request', verifyAdmin, async (req, res) => {
  const { request_id, tx_hash } = req.body;

  if (!request_id) {
    return res.status(400).json({ success: false, error: 'request_id is required' });
  }

  try {
    const { data, error } = await supabase
      .from('nft_purchase_requests')
      .update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString(),
        tx_hash: tx_hash || null
      })
      .eq('id', request_id)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ NFT Request ${request_id} fulfilled`);

    res.json({ success: true, request: data });
  } catch (error) {
    console.error('Error fulfilling NFT request:', error);
    safeErrorResponse(res, error);
  }
});

console.log('✅ NFT Request endpoints initialized');

// Start server for local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 BEAR Park API Server running on http://localhost:${PORT}`);
    console.log(`✅ Ready to handle XAMAN authentication`);
    console.log(`✅ Ready to handle honey points & leaderboard`);
    console.log(`✅ Ready to handle admin features`);
    console.log(`✅ Ready to handle notifications`);
    console.log(`✅ Ready to handle cosmetics store`);
    console.log(`✅ Ready to handle bulletin board comments`);
    console.log(`✅ Ready to handle Meme of the Week`);
    console.log(`✅ Ready to handle BEARDROPS airdrops\n`);
  });
}

// Export for Vercel serverless
module.exports = app;

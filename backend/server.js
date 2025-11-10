require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
console.log('✅ Supabase initialized:', process.env.SUPABASE_URL);

// Initialize Direct PostgreSQL Pool (for reactions to bypass PostgREST cache)
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
console.log('✅ Direct PostgreSQL pool initialized');

// Configure web-push with VAPID keys for push notifications
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@bearpark.xyz',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
console.log('✅ Push notifications configured');

// Validate required environment variables
if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
  console.error('❌ ERROR: XAMAN_API_KEY and XAMAN_API_SECRET must be set in environment variables');
  process.exit(1);
}

// Initialize XAMAN SDK
console.log('Initializing XAMAN SDK...');
console.log('API Key length:', XAMAN_API_KEY?.length);
console.log('API Secret length:', XAMAN_API_SECRET?.length);
console.log('API Key (first 10 chars):', XAMAN_API_KEY?.substring(0, 10));
console.log('API Secret (first 10 chars):', XAMAN_API_SECRET?.substring(0, 10));
const xumm = new XummSdk(XAMAN_API_KEY, XAMAN_API_SECRET);
console.log('✅ XAMAN SDK initialized successfully');

// Middleware
app.use(cors({
  origin: [FRONTEND_URL, 'https://bearpark.xyz', 'https://www.bearpark.xyz', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json());

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
    const { data, error } = await supabase
      .from('game_leaderboard_with_profiles')
      .select('*')
      .eq('game_id', gameId)
      .order('score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`Error fetching ${gameId} leaderboard:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      leaderboard: data || []
    });
  } catch (error) {
    console.error(`Error in ${req.params.gameId} leaderboard endpoint:`, error);
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

// Create New Raid
app.post('/api/raids', async (req, res) => {
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
app.delete('/api/raids/:id', async (req, res) => {
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
app.post('/api/raids/complete', async (req, res) => {
  try {
    const { wallet_address, raid_id, completed_at, points_awarded } = req.body;

    if (!wallet_address || !raid_id || !points_awarded) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, raid_id, points_awarded'
      });
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

    console.log(`✅ Awarded ${points_awarded} points to ${wallet_address}`);
    res.json({
      success: true,
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
app.post('/api/games/complete', async (req, res) => {
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
    // Use direct SQL to get all profiles with basic info
    const result = await pgPool.query(
      'SELECT wallet_address, display_name, avatar_nft, created_at FROM profiles ORDER BY display_name ASC'
    );

    res.json({
      success: true,
      users: result.rows || []
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

    res.json({
      success: true,
      profile: data || null
    });
  } catch (error) {
    console.error('Error in profile endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save/Update User Profile
app.post('/api/profile', async (req, res) => {
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
app.post('/api/profile/bio', async (req, res) => {
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

    const { data, error } = await supabase
      .from('profile_comments')
      .select('*')
      .eq('profile_wallet', wallet)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, comments: data || [] });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Post a Comment
app.post('/api/comments', async (req, res) => {
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
    const { wallet_address, is_admin } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ success: false, error: 'wallet_address required' });
    }

    // Get the comment to check ownership using direct SQL
    const commentResult = await pgPool.query(
      'SELECT * FROM profile_comments WHERE id = $1',
      [id]
    );

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const comment = commentResult.rows[0];

    // Check permissions: admin, profile owner, or comment author
    const canDelete = is_admin ||
                     comment.profile_wallet === wallet_address ||
                     comment.commenter_wallet === wallet_address;

    if (!canDelete) {
      return res.status(403).json({ success: false, error: 'Permission denied' });
    }

    // Delete the comment using direct SQL (CASCADE will delete reactions and child comments)
    await pgPool.query(
      'DELETE FROM profile_comments WHERE id = $1',
      [id]
    );

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

    // Use direct SQL to check if reaction exists
    const checkResult = await pgPool.query(
      'SELECT id FROM comment_reactions WHERE comment_id = $1 AND wallet_address = $2 AND reaction_type = $3',
      [id, wallet_address, reaction_type]
    );

    if (checkResult.rows.length > 0) {
      // Remove reaction
      await pgPool.query(
        'DELETE FROM comment_reactions WHERE comment_id = $1 AND wallet_address = $2 AND reaction_type = $3',
        [id, wallet_address, reaction_type]
      );
      res.json({ success: true, action: 'removed' });
    } else {
      // Add reaction
      await pgPool.query(
        'INSERT INTO comment_reactions (comment_id, wallet_address, reaction_type) VALUES ($1, $2, $3)',
        [id, wallet_address, reaction_type]
      );
      res.json({ success: true, action: 'added' });
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Reactions for a Comment (using direct PostgreSQL to bypass cache)
app.get('/api/comments/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pgPool.query(
      'SELECT * FROM comment_reactions WHERE comment_id = $1',
      [id]
    );

    const data = result.rows;

    // Group reactions by type with counts
    const reactionCounts = {};
    const userReactions = {};

    data.forEach(reaction => {
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
      reactions: data,
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
app.post('/api/follow', async (req, res) => {
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

    // Check if already following using direct SQL
    const checkResult = await pgPool.query(
      'SELECT id FROM follows WHERE follower_wallet = $1 AND following_wallet = $2',
      [follower_wallet, following_wallet]
    );

    if (checkResult.rows.length > 0) {
      // Unfollow
      await pgPool.query(
        'DELETE FROM follows WHERE follower_wallet = $1 AND following_wallet = $2',
        [follower_wallet, following_wallet]
      );
      res.json({ success: true, action: 'unfollowed' });
    } else {
      // Follow
      await pgPool.query(
        'INSERT INTO follows (follower_wallet, following_wallet) VALUES ($1, $2)',
        [follower_wallet, following_wallet]
      );
      res.json({ success: true, action: 'followed' });
    }
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

    const result = await pgPool.query(
      'SELECT id FROM follows WHERE follower_wallet = $1 AND following_wallet = $2',
      [follower_wallet, following_wallet]
    );

    res.json({
      success: true,
      isFollowing: result.rows.length > 0
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

    res.json({
      success: true,
      followers: parseInt(followerResult.rows[0].count),
      following: parseInt(followingResult.rows[0].count)
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

    const result = await pgPool.query(
      `SELECT f.follower_wallet, p.display_name, p.avatar_nft, f.created_at
       FROM follows f
       LEFT JOIN profiles p ON f.follower_wallet = p.wallet_address
       WHERE f.following_wallet = $1
       ORDER BY f.created_at DESC`,
      [wallet]
    );

    res.json({
      success: true,
      followers: result.rows
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

    const result = await pgPool.query(
      `SELECT f.following_wallet, p.display_name, p.avatar_nft, f.created_at
       FROM follows f
       LEFT JOIN profiles p ON f.following_wallet = p.wallet_address
       WHERE f.follower_wallet = $1
       ORDER BY f.created_at DESC`,
      [wallet]
    );

    res.json({
      success: true,
      following: result.rows
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

// Debug endpoint to check environment variables
app.get('/debug/env', (req, res) => {
  res.json({
    apiKeyLength: XAMAN_API_KEY?.length,
    apiSecretLength: XAMAN_API_SECRET?.length,
    apiKeyFirst10: XAMAN_API_KEY?.substring(0, 10),
    apiSecretFirst10: XAMAN_API_SECRET?.substring(0, 10),
    apiKeyLast4: XAMAN_API_KEY?.substring(XAMAN_API_KEY.length - 4),
    supabaseUrl: process.env.SUPABASE_URL
  });
});

// Get All Users (for admin name moderation)
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('honey_points')
      .select('wallet_address, display_name, total_points')
      .order('total_points', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Format for frontend
    const users = data.map(user => ({
      wallet_address: user.wallet_address,
      display_name: user.display_name,
      honey_points: user.total_points
    }));

    res.json({ success: true, users: users || [] });
  } catch (error) {
    console.error('Error in get users endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
app.post('/api/admin/adjust-points', async (req, res) => {
  try {
    const { wallet_address, amount, reason, admin_wallet } = req.body;

    if (!wallet_address || !amount || !admin_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, amount, admin_wallet'
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
app.post('/api/admin/ban-user', async (req, res) => {
  try {
    const { wallet_address, reason, admin_wallet } = req.body;

    if (!wallet_address || !admin_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet_address, admin_wallet'
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
app.post('/api/admin/unban-user', async (req, res) => {
  try {
    const { wallet_address, admin_wallet } = req.body;

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
app.post('/api/admin/game-settings', async (req, res) => {
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
app.post('/api/admin/bulk-points', async (req, res) => {
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
app.post('/api/admin/roles/assign', async (req, res) => {
  try {
    const { wallet_address, role, assigned_by, notes } = req.body;

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
app.delete('/api/admin/roles/:wallet', async (req, res) => {
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

// Start server for local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 BEAR Park API Server running on http://localhost:${PORT}`);
    console.log(`✅ Ready to handle XAMAN authentication`);
    console.log(`✅ Ready to handle honey points & leaderboard`);
    console.log(`✅ Ready to handle admin features\n`);
  });
}

// Export for Vercel serverless
module.exports = app;

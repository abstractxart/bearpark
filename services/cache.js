/**
 * Redis Cache Service for BEARpark
 * Provides caching for profiles, leaderboards, raids, and honey points
 * Falls back gracefully to no-cache if Redis is unavailable
 */

const Redis = require('ioredis');

// Cache TTLs in seconds
const CACHE_TTL = {
  PROFILE: 60,           // 1 minute - profiles change occasionally
  LEADERBOARD: 30,       // 30 seconds - leaderboards update frequently
  HONEY_LEADERBOARD: 30, // 30 seconds
  GAME_LEADERBOARD: 60,  // 1 minute
  RAIDS: 30,             // 30 seconds - raids are time-sensitive
  POINTS: 10,            // 10 seconds - points change often
  COSMETICS: 300,        // 5 minutes - catalog rarely changes
};

let redis = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
function initCache() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.log('⚠️  REDIS_URL not set - caching disabled (running without cache)');
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('❌ Redis connection failed after 3 retries - running without cache');
          return null;
        }
        return Math.min(times * 100, 2000);
      },
      reconnectOnError: (err) => {
        console.log('🔄 Redis reconnecting due to error:', err.message);
        return true;
      },
    });

    redis.on('connect', () => {
      isConnected = true;
      console.log('✅ Redis connected successfully');
    });

    redis.on('error', (err) => {
      if (isConnected) {
        console.error('❌ Redis error:', err.message);
      }
      isConnected = false;
    });

    redis.on('close', () => {
      isConnected = false;
      console.log('⚠️  Redis connection closed');
    });

    return redis;
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error.message);
    return null;
  }
}

/**
 * Get value from cache
 */
async function get(key) {
  if (!redis || !isConnected) return null;

  try {
    const data = await redis.get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error(`Cache get error for ${key}:`, error.message);
    return null;
  }
}

/**
 * Set value in cache with TTL
 */
async function set(key, value, ttlSeconds) {
  if (!redis || !isConnected) return false;

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch (error) {
    console.error(`Cache set error for ${key}:`, error.message);
    return false;
  }
}

/**
 * Delete key from cache
 */
async function del(key) {
  if (!redis || !isConnected) return false;

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error(`Cache del error for ${key}:`, error.message);
    return false;
  }
}

/**
 * Delete keys matching a pattern
 */
async function delPattern(pattern) {
  if (!redis || !isConnected) return false;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error) {
    console.error(`Cache delPattern error for ${pattern}:`, error.message);
    return false;
  }
}

/**
 * Check if cache is connected
 */
function isCacheConnected() {
  return isConnected;
}

/**
 * Get cache stats for health endpoint
 */
async function getStats() {
  if (!redis || !isConnected) {
    return { connected: false };
  }

  try {
    const info = await redis.info('memory');
    const dbsize = await redis.dbsize();

    // Parse memory usage from info
    const memMatch = info.match(/used_memory_human:(\S+)/);
    const memory = memMatch ? memMatch[1] : 'unknown';

    return {
      connected: true,
      keys: dbsize,
      memory,
    };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

// ============================================
// CACHE KEY GENERATORS
// ============================================

const keys = {
  profile: (wallet) => `profile:${wallet}`,
  points: (wallet) => `points:${wallet}`,
  honeyLeaderboard: (limit) => `honey_leaderboard:${limit}`,
  gameLeaderboard: (gameId, limit) => `game_leaderboard:${gameId}:${limit}`,
  raids: () => 'raids:active',
  raidCompletions: (wallet) => `raid_completions:${wallet}`,
  cosmeticsCatalog: () => 'cosmetics:catalog',
  cosmeticsInventory: (wallet) => `cosmetics:inventory:${wallet}`,
  claimStatus: (wallet, date) => `claim:${wallet}:${date}`,
};

// ============================================
// CONVENIENCE METHODS
// ============================================

/**
 * Get or fetch with cache
 * @param {string} key - Cache key
 * @param {number} ttl - TTL in seconds
 * @param {Function} fetchFn - Function to call if cache miss
 */
async function getOrFetch(key, ttl, fetchFn) {
  // Try cache first
  const cached = await get(key);
  if (cached !== null) {
    return { data: cached, fromCache: true };
  }

  // Cache miss - fetch fresh data
  const fresh = await fetchFn();

  // Store in cache (don't await - fire and forget)
  set(key, fresh, ttl);

  return { data: fresh, fromCache: false };
}

/**
 * Invalidate profile-related caches
 */
async function invalidateProfile(wallet) {
  await del(keys.profile(wallet));
  await del(keys.points(wallet));
}

/**
 * Invalidate leaderboard caches
 */
async function invalidateLeaderboards() {
  await delPattern('honey_leaderboard:*');
  await delPattern('game_leaderboard:*');
}

/**
 * Invalidate raid caches
 */
async function invalidateRaids() {
  await del(keys.raids());
  await delPattern('raid_completions:*');
}

module.exports = {
  initCache,
  get,
  set,
  del,
  delPattern,
  isCacheConnected,
  getStats,
  getOrFetch,
  invalidateProfile,
  invalidateLeaderboards,
  invalidateRaids,
  keys,
  CACHE_TTL,
};

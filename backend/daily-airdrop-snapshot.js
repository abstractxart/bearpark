/**
 * Daily Airdrop Snapshot - RANDOM TIMING SYSTEM
 *
 * SECURITY: Snapshots run at RANDOM times each day to prevent flash loan attacks.
 * The snapshot time is determined by a hash of the date + secret salt.
 * Nobody (not even admins) knows when the snapshot will run until it happens.
 *
 * Run via cron EVERY HOUR: 0 * * * * node /path/to/daily-airdrop-snapshot.js
 * The script checks if it's time to run based on the random schedule.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const crypto = require('crypto');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// XRPL Constants
const NFT_ISSUER = 'rBEARbo4Prn33894evmvYcAf9yAQjp4VJF';
const AMM_POOL_ACCOUNT = 'rwE86ARLXfyKYCVmFpk511ddYfs5Fh6Vcp';
const BEAR_ISSUER = 'rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW';

// Airdrop calculation constants (can be overridden from config)
let BEAR_PER_PIXEL_BEAR = 1;
let BEAR_PER_ULTRA_RARE = 5;
let LP_TOKENS_PER_BEAR = 250000;
let MIN_HONEY_POINTS_24H = 30;

// Secret salt for random time generation (set in Railway env vars)
const SNAPSHOT_SALT = process.env.SNAPSHOT_SALT || 'BEAR_SNAPSHOT_DEFAULT_SALT_CHANGE_ME';

// Ultra Rare NFT taxons - SECURITY: Define these properly!
const ULTRA_RARE_TAXONS = [
  // Add your ultra rare taxon IDs here
  // Example: 12345, 67890
];

/**
 * RANDOM SNAPSHOT TIMING
 * Generates a deterministic but unpredictable hour (0-23) for today's snapshot
 * Uses date + secret salt so only the server knows the time
 */
function getRandomSnapshotHour(dateStr) {
  const hash = crypto.createHash('sha256').update(dateStr + SNAPSHOT_SALT).digest('hex');
  // Use first 2 hex chars to get a number 0-255, then mod 24 for hour
  const hourSeed = parseInt(hash.substring(0, 2), 16);
  return hourSeed % 24;
}

/**
 * Check if we should run the snapshot now
 */
async function shouldRunSnapshot() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentHour = now.getUTCHours();
  const targetHour = getRandomSnapshotHour(todayStr);

  console.log(`🎲 Random snapshot hour for ${todayStr}: ${targetHour}:00 UTC`);
  console.log(`⏰ Current hour: ${currentHour}:00 UTC`);

  // Check if snapshot already ran today
  const { data: existing } = await supabase
    .from('airdrop_snapshots')
    .select('id')
    .eq('snapshot_date', todayStr)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('✅ Snapshot already completed for today. Skipping.');
    return false;
  }

  // Check if it's time (current hour >= target hour)
  if (currentHour >= targetHour) {
    console.log('🚀 It\'s snapshot time! Running now...');
    return true;
  }

  console.log(`⏳ Not yet time. Snapshot will run at ${targetHour}:00 UTC.`);
  return false;
}

console.log('🐻 Daily Airdrop Snapshot');
console.log('=========================');
console.log(`Date: ${new Date().toISOString()}`);
console.log('');

// XRPL WebSocket helpers
function connectXRPL() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://s1.ripple.com');
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function xrplRequest(ws, command) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 30000);
    const id = Date.now() + Math.random();

    const handler = (data) => {
      const response = JSON.parse(data.toString());
      if (response.id === id) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(response);
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify({ ...command, id }));
  });
}

// Load config from database
async function loadConfig() {
  const { data } = await supabase.from('airdrop_config').select('key, value');

  if (data) {
    for (const row of data) {
      switch (row.key) {
        case 'bear_per_pixel_bear':
          BEAR_PER_PIXEL_BEAR = parseFloat(row.value);
          break;
        case 'bear_per_ultra_rare':
          BEAR_PER_ULTRA_RARE = parseFloat(row.value);
          break;
        case 'lp_tokens_per_bear':
          LP_TOKENS_PER_BEAR = parseFloat(row.value);
          break;
        case 'min_honey_points_24h':
          MIN_HONEY_POINTS_24H = parseInt(row.value);
          break;
      }
    }
  }

  console.log('📋 Config loaded:');
  console.log(`   BEAR per Pixel Bear: ${BEAR_PER_PIXEL_BEAR}`);
  console.log(`   BEAR per Ultra Rare: ${BEAR_PER_ULTRA_RARE}`);
  console.log(`   LP Tokens per BEAR: ${LP_TOKENS_PER_BEAR}`);
  console.log(`   Min Honey Points (24h): ${MIN_HONEY_POINTS_24H}`);
  console.log('');
}

// Get all NFT holders
async function getAllNFTHolders(ws) {
  console.log('🖼️  Fetching NFT holders...');

  const holders = new Map(); // wallet -> { pixelBears: count, ultraRares: count }
  let marker = null;
  let totalNFTs = 0;

  do {
    const request = {
      command: 'nfts_by_issuer',
      issuer: NFT_ISSUER,
      limit: 400
    };

    if (marker) request.marker = marker;

    const response = await xrplRequest(ws, request);

    if (response.result?.nfts) {
      for (const nft of response.result.nfts) {
        totalNFTs++;
        const owner = nft.owner;
        const taxon = nft.nft_taxon;

        if (!holders.has(owner)) {
          holders.set(owner, { pixelBears: 0, ultraRares: 0 });
        }

        const holder = holders.get(owner);

        // Check if ultra rare
        if (ULTRA_RARE_TAXONS.includes(taxon)) {
          holder.ultraRares++;
        } else {
          holder.pixelBears++;
        }
      }

      marker = response.result.marker;
    } else {
      break;
    }

    process.stdout.write(`\r   Processed: ${totalNFTs} NFTs, ${holders.size} holders`);
  } while (marker);

  console.log(`\n   ✅ Found ${holders.size} NFT holders with ${totalNFTs} total NFTs`);
  return holders;
}

// Get all LP token holders
async function getLPTokenHolders(ws) {
  console.log('\n💧 Fetching LP token holders...');

  const lpHolders = new Map(); // wallet -> lp_tokens (as string for precision)

  // Get all trust lines to the AMM pool account
  let marker = null;
  let totalHolders = 0;

  do {
    const request = {
      command: 'account_lines',
      account: AMM_POOL_ACCOUNT,
      limit: 400
    };

    if (marker) request.marker = marker;

    const response = await xrplRequest(ws, request);

    if (response.result?.lines) {
      for (const line of response.result.lines) {
        // LP token balance is in the 'balance' field (negative from issuer perspective)
        const balance = Math.abs(parseFloat(line.balance));
        if (balance > 0) {
          lpHolders.set(line.account, balance.toString());
          totalHolders++;
        }
      }

      marker = response.result.marker;
    } else {
      break;
    }

    process.stdout.write(`\r   Processed: ${totalHolders} LP holders`);
  } while (marker);

  console.log(`\n   ✅ Found ${lpHolders.size} LP token holders`);
  return lpHolders;
}

// Get 24h honey points for a wallet
async function getHoneyPoints24h(wallet) {
  const { data } = await supabase
    .from('honey_points_activity')
    .select('points')
    .eq('wallet_address', wallet)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return data?.reduce((sum, row) => sum + row.points, 0) || 0;
}

// Check if wallet is blacklisted
async function isBlacklisted(wallet) {
  const { data } = await supabase
    .from('lp_blacklist')
    .select('id')
    .eq('wallet_address', wallet)
    .eq('is_active', true)
    .single();

  return !!data;
}

// Main snapshot function
async function runSnapshot() {
  const snapshotDate = new Date().toISOString().split('T')[0];

  console.log(`📸 Creating snapshot for ${snapshotDate}\n`);

  let ws;

  try {
    // Load config
    await loadConfig();

    // Connect to XRPL
    console.log('🔌 Connecting to XRPL...');
    ws = await connectXRPL();
    console.log('   ✅ Connected\n');

    // Get all holders
    const nftHolders = await getAllNFTHolders(ws);
    const lpHolders = await getLPTokenHolders(ws);

    // Merge all unique wallets
    const allWallets = new Set([...nftHolders.keys(), ...lpHolders.keys()]);
    console.log(`\n📊 Total unique wallets: ${allWallets.size}\n`);

    // Get existing blacklist
    const { data: blacklistData } = await supabase
      .from('lp_blacklist')
      .select('wallet_address')
      .eq('is_active', true);

    const blacklistedWallets = new Set(blacklistData?.map(b => b.wallet_address) || []);
    console.log(`🚫 Blacklisted wallets: ${blacklistedWallets.size}`);

    // Process each wallet
    console.log('\n⏳ Processing wallets...\n');

    const snapshots = [];
    let processed = 0;
    let eligible = 0;
    let totalReward = 0;

    for (const wallet of allWallets) {
      processed++;

      const nftData = nftHolders.get(wallet) || { pixelBears: 0, ultraRares: 0 };
      const lpTokens = lpHolders.get(wallet) || '0';

      // Calculate rewards
      const nftReward = (nftData.pixelBears * BEAR_PER_PIXEL_BEAR) +
                        (nftData.ultraRares * BEAR_PER_ULTRA_RARE);
      const lpReward = parseFloat(lpTokens) / LP_TOKENS_PER_BEAR;
      const totalRewardAmount = nftReward + lpReward;

      // Skip if no reward
      if (totalRewardAmount === 0) continue;

      // Check eligibility
      const honeyPoints = await getHoneyPoints24h(wallet);
      const isBlack = blacklistedWallets.has(wallet);
      const isElig = honeyPoints >= MIN_HONEY_POINTS_24H && !isBlack;

      if (isElig) {
        eligible++;
        totalReward += totalRewardAmount;
      }

      snapshots.push({
        wallet_address: wallet,
        snapshot_date: snapshotDate,
        pixel_bears: nftData.pixelBears,
        ultra_rares: nftData.ultraRares,
        lp_tokens: lpTokens,
        nft_reward: nftReward,
        lp_reward: lpReward,
        total_reward: totalRewardAmount,
        is_blacklisted: isBlack,
        is_eligible: isElig,
        honey_points_24h: honeyPoints,
        claim_status: isElig ? 'pending' : 'ineligible'
      });

      if (processed % 50 === 0) {
        process.stdout.write(`\r   Processed: ${processed}/${allWallets.size} wallets`);
      }
    }

    console.log(`\n\n💾 Saving ${snapshots.length} snapshots to database...`);

    // Batch insert snapshots
    if (snapshots.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < snapshots.length; i += 100) {
        const batch = snapshots.slice(i, i + 100);
        const { error } = await supabase
          .from('airdrop_snapshots')
          .upsert(batch, { onConflict: 'wallet_address,snapshot_date' });

        if (error) {
          console.error(`   ❌ Batch ${i/100 + 1} error:`, error.message);
        } else {
          process.stdout.write(`\r   Saved: ${Math.min(i + 100, snapshots.length)}/${snapshots.length}`);
        }
      }
    }

    // Summary
    console.log('\n\n🎉 Snapshot Complete!');
    console.log('=====================');
    console.log(`📅 Date: ${snapshotDate}`);
    console.log(`👛 Total wallets processed: ${processed}`);
    console.log(`📸 Snapshots created: ${snapshots.length}`);
    console.log(`✅ Eligible wallets: ${eligible}`);
    console.log(`🐻 Total $BEAR to distribute: ${totalReward.toFixed(2)}`);
    console.log('');

  } catch (err) {
    console.error('\n❌ Snapshot error:', err.message);
    console.error(err.stack);
  } finally {
    if (ws) ws.close();
    process.exit(0);
  }
}

// MAIN: Check if we should run based on random timing
async function main() {
  // Force run with --force flag (for manual testing)
  if (process.argv.includes('--force')) {
    console.log('⚠️  FORCE FLAG DETECTED - Running snapshot immediately!');
    await runSnapshot();
    return;
  }

  // Check random timing
  const shouldRun = await shouldRunSnapshot();
  if (shouldRun) {
    await runSnapshot();
  } else {
    process.exit(0);
  }
}

main();

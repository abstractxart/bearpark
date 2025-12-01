/**
 * Daily Airdrop Snapshot - FIXED TIMING SYSTEM
 *
 * Snapshots run at 06:29 UTC every day.
 *
 * Run via cron at 06:29 UTC: 29 6 * * * node /path/to/daily-airdrop-snapshot.js
 * Or run every hour and the script will check if it's time.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const xrpl = require('xrpl');
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

// Ultra Rare NFT taxons
// Taxon 0 = Ultra Rare BEARS (667 total)
// Taxon 1/2 = Pixel BEARS
const ULTRA_RARE_TAXONS = [0];

// XRPL servers to try (in order) - need Clio servers for nfts_by_issuer
const XRPL_SERVERS = [
  'wss://s1.ripple.com',  // Clio server - supports nfts_by_issuer
  'wss://s2.ripple.com',  // Clio server - supports nfts_by_issuer
  'wss://xrplcluster.com'
];

/**
 * FIXED SNAPSHOT TIMING
 * Snapshot runs at 06:29 UTC every day
 */
const SNAPSHOT_HOUR = 6;
const SNAPSHOT_MINUTE = 29;

/**
 * Check if we should run the snapshot now
 */
async function shouldRunSnapshot() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  console.log(`📅 Fixed snapshot time: ${SNAPSHOT_HOUR}:${SNAPSHOT_MINUTE.toString().padStart(2, '0')} UTC`);
  console.log(`⏰ Current time: ${currentHour}:${currentMinute.toString().padStart(2, '0')} UTC`);

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

  // Check if it's time (current time >= 06:29 UTC)
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  const targetTimeMinutes = SNAPSHOT_HOUR * 60 + SNAPSHOT_MINUTE;

  if (currentTimeMinutes >= targetTimeMinutes) {
    console.log('🚀 It\'s snapshot time! Running now...');
    return true;
  }

  console.log(`⏳ Not yet time. Snapshot will run at ${SNAPSHOT_HOUR}:${SNAPSHOT_MINUTE.toString().padStart(2, '0')} UTC.`);
  return false;
}

console.log('🐻 Daily Airdrop Snapshot');
console.log('=========================');
console.log(`Date: ${new Date().toISOString()}`);
console.log('');

// Connect to XRPL with fallback servers
async function connectXRPL() {
  for (const server of XRPL_SERVERS) {
    try {
      console.log(`   Trying ${server}...`);
      const client = new xrpl.Client(server, {
        timeout: 60000, // 60 second connection timeout
        connectionTimeout: 30000
      });
      await client.connect();
      console.log(`   ✅ Connected to ${server}`);
      return client;
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`);
    }
  }
  throw new Error('Could not connect to any XRPL server');
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

// Get all NFT holders using xrpl library
async function getAllNFTHolders(client) {
  console.log('🖼️  Fetching NFT holders...');

  const holders = new Map(); // wallet -> { pixelBears: count, ultraRares: count }
  let marker = null;
  let totalNFTs = 0;
  let retries = 0;
  const maxRetries = 3;

  do {
    try {
      const request = {
        command: 'nfts_by_issuer',
        issuer: NFT_ISSUER,
        limit: 100 // Smaller batches for reliability
      };

      if (marker) request.marker = marker;

      const response = await client.request(request);

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
        retries = 0; // Reset retries on success
      } else {
        break;
      }

      process.stdout.write(`\r   Processed: ${totalNFTs} NFTs, ${holders.size} holders`);

      // Small delay between requests to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      retries++;
      console.log(`\n   ⚠️ Request failed (attempt ${retries}/${maxRetries}): ${err.message}`);

      if (retries >= maxRetries) {
        console.log(`   ❌ Max retries reached, continuing with ${totalNFTs} NFTs found so far`);
        break;
      }

      // Wait before retry
      await new Promise(r => setTimeout(r, 2000));
    }
  } while (marker);

  console.log(`\n   ✅ Found ${holders.size} NFT holders with ${totalNFTs} total NFTs`);
  return holders;
}

// Get all LP token holders
async function getLPTokenHolders(client) {
  console.log('\n💧 Fetching LP token holders...');

  const lpHolders = new Map(); // wallet -> lp_tokens (as string for precision)
  let marker = null;
  let totalHolders = 0;
  let retries = 0;
  const maxRetries = 3;

  do {
    try {
      const request = {
        command: 'account_lines',
        account: AMM_POOL_ACCOUNT,
        limit: 200
      };

      if (marker) request.marker = marker;

      const response = await client.request(request);

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
        retries = 0;
      } else {
        break;
      }

      process.stdout.write(`\r   Processed: ${totalHolders} LP holders`);

      // Small delay between requests
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      retries++;
      console.log(`\n   ⚠️ Request failed (attempt ${retries}/${maxRetries}): ${err.message}`);

      if (retries >= maxRetries) {
        console.log(`   ❌ Max retries reached, continuing with ${totalHolders} LP holders found`);
        break;
      }

      await new Promise(r => setTimeout(r, 2000));
    }
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

// Main snapshot function
async function runSnapshot() {
  const snapshotDate = new Date().toISOString().split('T')[0];

  console.log(`📸 Creating snapshot for ${snapshotDate}\n`);

  let client;

  try {
    // Load config
    await loadConfig();

    // Connect to XRPL
    console.log('🔌 Connecting to XRPL...');
    client = await connectXRPL();

    // Get all holders
    const nftHolders = await getAllNFTHolders(client);
    const lpHolders = await getLPTokenHolders(client);

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
      const lpRewardRaw = parseFloat(lpTokens) / LP_TOKENS_PER_BEAR;

      // Check blacklist status
      const isBlack = blacklistedWallets.has(wallet);

      // BLACKLIST RULE: Blacklisted wallets get NFT rewards but NO LP rewards
      // This prevents single-side $BEAR deposits from gaming the system
      const lpReward = isBlack ? 0 : lpRewardRaw;
      const totalRewardAmount = nftReward + lpReward;

      // Skip if no reward (after blacklist adjustment)
      if (totalRewardAmount === 0) continue;

      // SNAPSHOT ONLY CAPTURES HOLDINGS
      // Honey points requirement is checked at CLAIM TIME only
      // Everyone with holdings is marked as eligible (pending)
      eligible++;
      totalReward += totalRewardAmount;

      snapshots.push({
        wallet_address: wallet,
        snapshot_date: snapshotDate,
        pixel_bears: nftData.pixelBears,
        ultra_rares: nftData.ultraRares,
        lp_tokens: lpTokens,
        nft_reward: nftReward,
        lp_reward: lpReward,  // 0 if blacklisted
        total_reward: totalRewardAmount,
        is_blacklisted: isBlack,
        is_eligible: true,  // Always eligible at snapshot - HP checked at claim time
        honey_points_24h: 0,  // Not checked at snapshot time
        claim_status: 'pending',  // Always pending - HP checked at claim time
        lp_reward_forfeited: isBlack ? lpRewardRaw : 0  // Track what they would have earned
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

    // =====================================================
    // Track LP Balance Changes
    // =====================================================
    console.log('\n\n📊 Tracking LP balance changes...');

    // Get yesterday's LP balances
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: yesterdayBalances } = await supabase
      .from('lp_balance_history')
      .select('wallet_address, lp_balance, first_seen_at')
      .eq('snapshot_date', yesterday);

    const yesterdayMap = new Map();
    const firstSeenMap = new Map();
    if (yesterdayBalances) {
      for (const row of yesterdayBalances) {
        yesterdayMap.set(row.wallet_address, row.lp_balance);
        if (row.first_seen_at) {
          firstSeenMap.set(row.wallet_address, row.first_seen_at);
        }
      }
    }

    // Build LP history records
    const lpHistory = [];
    let newLPWallets = 0;
    let increasedLP = 0;

    for (const [wallet, lpBalance] of lpHolders) {
      const balance = parseFloat(lpBalance);
      if (balance <= 0) continue;

      const prevBalanceStr = yesterdayMap.get(wallet) || '0';
      const prevBalance = parseFloat(prevBalanceStr);
      const change = balance - prevBalance;

      let changeType = 'unchanged';
      let firstSeen = firstSeenMap.get(wallet) || null;

      if (prevBalance === 0 && balance > 0) {
        changeType = 'new';
        firstSeen = new Date().toISOString();
        newLPWallets++;
      } else if (change > 0) {
        changeType = 'increase';
        increasedLP++;
      } else if (change < 0) {
        changeType = 'decrease';
      }

      lpHistory.push({
        wallet_address: wallet,
        snapshot_date: snapshotDate,
        lp_balance: lpBalance,
        previous_balance: prevBalanceStr,
        balance_change: change.toString(),
        change_type: changeType,
        first_seen_at: firstSeen
      });
    }

    // Save LP history
    if (lpHistory.length > 0) {
      for (let i = 0; i < lpHistory.length; i += 100) {
        const batch = lpHistory.slice(i, i + 100);
        await supabase
          .from('lp_balance_history')
          .upsert(batch, { onConflict: 'wallet_address,snapshot_date' });
      }
    }

    console.log(`   ✅ Tracked ${lpHistory.length} LP holders`);
    console.log(`   🆕 New LP wallets: ${newLPWallets}`);
    console.log(`   📈 Increased LP: ${increasedLP}`);

    // Summary
    console.log('\n\n🎉 Snapshot Complete!');
    console.log('=====================');
    console.log(`📅 Date: ${snapshotDate}`);
    console.log(`👛 Total wallets processed: ${processed}`);
    console.log(`📸 Snapshots created: ${snapshots.length}`);
    console.log(`✅ Eligible wallets: ${eligible}`);
    console.log(`🐻 Total $BEAR to distribute: ${totalReward.toFixed(2)}`);
    console.log(`🆕 New LP wallets today: ${newLPWallets}`);
    console.log('');

  } catch (err) {
    console.error('\n❌ Snapshot error:', err.message);
    console.error(err.stack);
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
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

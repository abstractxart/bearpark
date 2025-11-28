/**
 * LP Blacklist Scanner
 * Scans XRPL AMM transactions to detect single-side deposits/withdrawals
 *
 * Run: node lp-blacklist-scanner.js [--scan-all] [--limit=1000]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

// XRPL WebSocket
const WebSocket = require('ws');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// AMM Pool Address for BEAR/XRP
const AMM_POOL = 'rwE86ARLXfyKYCVmFpk511ddYfs5Fh6Vcp';
const BEAR_ISSUER = 'rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW';

// Parse command line args
const args = process.argv.slice(2);
const scanAll = args.includes('--scan-all');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 500;

console.log('🔍 LP Blacklist Scanner');
console.log('========================');
console.log(`AMM Pool: ${AMM_POOL}`);
console.log(`BEAR Issuer: ${BEAR_ISSUER}`);
console.log(`Scan Mode: ${scanAll ? 'All Transactions' : 'Recent Only'}`);
console.log(`Limit: ${limit}`);
console.log('');

// XRPL WebSocket connection
function connectXRPL() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://s1.ripple.com');

    ws.on('open', () => {
      console.log('✅ Connected to XRPL');
      resolve(ws);
    });

    ws.on('error', (err) => {
      console.error('❌ XRPL connection error:', err.message);
      reject(err);
    });
  });
}

// Send XRPL request
function xrplRequest(ws, command) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 30000);

    const handler = (data) => {
      const response = JSON.parse(data.toString());
      if (response.id === command.id) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(response);
      }
    };

    ws.on('message', handler);
    command.id = Date.now();
    ws.send(JSON.stringify(command));
  });
}

// Get AMM account transactions
async function getAMMTransactions(ws, marker = null) {
  const request = {
    command: 'account_tx',
    account: AMM_POOL,
    limit: Math.min(limit, 200),
    forward: false // Most recent first
  };

  if (marker) {
    request.marker = marker;
  }

  return await xrplRequest(ws, request);
}

// Analyze a transaction for single-side behavior
function analyzeTransaction(tx) {
  const meta = tx.meta || tx.metaData;
  if (!meta || typeof meta === 'string') return null;

  const txType = tx.tx?.TransactionType || tx.TransactionType;
  const account = tx.tx?.Account || tx.Account;
  const hash = tx.tx?.hash || tx.hash;

  // Only analyze AMMDeposit and AMMWithdraw
  if (txType !== 'AMMDeposit' && txType !== 'AMMWithdraw') {
    return null;
  }

  // Check for single-side operations
  // Single-side deposit: Only Amount or Amount2 is provided (not both)
  // Single-side withdraw: LPTokenIn is provided but only one asset is returned

  const txData = tx.tx || tx;

  if (txType === 'AMMDeposit') {
    const hasAmount = !!txData.Amount;
    const hasAmount2 = !!txData.Amount2;
    const hasLPTokenOut = !!txData.LPTokenOut;

    // Single-asset deposit (only one of Amount/Amount2)
    if ((hasAmount && !hasAmount2) || (!hasAmount && hasAmount2)) {
      return {
        wallet: account,
        type: 'single_side_deposit',
        hash,
        timestamp: tx.tx?.date || tx.date,
        details: `Single-asset AMM deposit`
      };
    }

    // LPTokenOut with single asset
    if (hasLPTokenOut && (hasAmount !== hasAmount2)) {
      return {
        wallet: account,
        type: 'single_side_deposit',
        hash,
        timestamp: tx.tx?.date || tx.date,
        details: `Single-asset AMM deposit with LPTokenOut`
      };
    }
  }

  if (txType === 'AMMWithdraw') {
    const hasAmount = !!txData.Amount;
    const hasAmount2 = !!txData.Amount2;
    const hasLPTokenIn = !!txData.LPTokenIn;

    // Single-asset withdrawal
    if ((hasAmount && !hasAmount2) || (!hasAmount && hasAmount2)) {
      return {
        wallet: account,
        type: 'single_side_withdraw',
        hash,
        timestamp: tx.tx?.date || tx.date,
        details: `Single-asset AMM withdrawal`
      };
    }

    // Check AffectedNodes for one-sided balance changes
    const affectedNodes = meta.AffectedNodes || [];
    let xrpChange = false;
    let tokenChange = false;

    for (const node of affectedNodes) {
      const modified = node.ModifiedNode || node.CreatedNode || node.DeletedNode;
      if (!modified) continue;

      // Check for trust line changes (token)
      if (modified.LedgerEntryType === 'RippleState') {
        tokenChange = true;
      }
      // Check for AccountRoot changes (XRP)
      if (modified.LedgerEntryType === 'AccountRoot' &&
          modified.FinalFields?.Account === AMM_POOL) {
        xrpChange = true;
      }
    }

    // If only one type of asset changed, it's single-side
    if (hasLPTokenIn && (xrpChange !== tokenChange)) {
      return {
        wallet: account,
        type: 'single_side_withdraw',
        hash,
        timestamp: tx.tx?.date || tx.date,
        details: `Asymmetric AMM withdrawal detected`
      };
    }
  }

  return null;
}

// Add wallet to blacklist
async function addToBlacklist(detection) {
  try {
    const { data, error } = await supabase
      .from('lp_blacklist')
      .upsert({
        wallet_address: detection.wallet,
        reason: detection.type,
        tx_hash: detection.hash,
        notes: detection.details,
        is_active: true,
        detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'wallet_address' });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`  ❌ Failed to add ${detection.wallet}: ${err.message}`);
    return false;
  }
}

// Main scanner function
async function runScanner() {
  let ws;

  try {
    ws = await connectXRPL();

    const detections = [];
    let marker = null;
    let totalTx = 0;
    let scannedTx = 0;

    console.log('📊 Scanning AMM transactions...\n');

    do {
      const response = await getAMMTransactions(ws, marker);

      if (response.result?.transactions) {
        for (const tx of response.result.transactions) {
          scannedTx++;

          const detection = analyzeTransaction(tx);
          if (detection) {
            detections.push(detection);
            console.log(`  🚨 Found: ${detection.type}`);
            console.log(`     Wallet: ${detection.wallet}`);
            console.log(`     TX: ${detection.hash?.slice(0, 16)}...`);
            console.log('');
          }

          if (scannedTx >= limit) break;
        }

        marker = response.result.marker;
        totalTx = response.result.transactions.length;

        // Progress update
        process.stdout.write(`\r  Scanned: ${scannedTx} transactions`);
      } else {
        break;
      }

    } while (marker && scannedTx < limit && scanAll);

    console.log(`\n\n📈 Scan Complete!`);
    console.log(`   Transactions scanned: ${scannedTx}`);
    console.log(`   Single-side detections: ${detections.length}`);

    if (detections.length > 0) {
      console.log('\n📝 Adding to blacklist...');

      // Deduplicate by wallet
      const uniqueWallets = new Map();
      for (const d of detections) {
        if (!uniqueWallets.has(d.wallet)) {
          uniqueWallets.set(d.wallet, d);
        }
      }

      let added = 0;
      for (const [wallet, detection] of uniqueWallets) {
        const success = await addToBlacklist(detection);
        if (success) {
          added++;
          console.log(`  ✅ Blacklisted: ${wallet.slice(0, 12)}...`);
        }
      }

      console.log(`\n🏁 Done! Added ${added} wallets to blacklist.`);
    } else {
      console.log('\n✅ No single-side operations detected!');
    }

  } catch (err) {
    console.error('❌ Scanner error:', err.message);
  } finally {
    if (ws) {
      ws.close();
    }
    process.exit(0);
  }
}

// Run
runScanner();

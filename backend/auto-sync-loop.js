// Auto-sync users table from honey_points every 10 seconds
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let syncCount = 0;

async function syncTables() {
  try {
    // Get all honey_points (source of truth)
    const { data: honeyPoints, error: honeyError } = await supabase
      .from('honey_points')
      .select('*')
      .order('wallet_address');

    if (honeyError) {
      console.error('❌ Error fetching honey_points:', honeyError);
      return;
    }

    let updated = 0;
    let changed = 0;

    for (const hp of honeyPoints) {
      // Get current user points
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('total_points')
        .eq('wallet_address', hp.wallet_address)
        .single();

      if (userError) continue;

      const roundedPoints = Math.round(hp.total_points);

      // Only update if different
      if (user && user.total_points !== roundedPoints) {
        const { error } = await supabase
          .from('users')
          .update({ total_points: roundedPoints })
          .eq('wallet_address', hp.wallet_address);

        if (!error) {
          console.log(`🔄 Synced ${hp.wallet_address.slice(-6)}: ${user.total_points} → ${roundedPoints} HP`);
          changed++;
        }
      }
      updated++;
    }

    syncCount++;
    if (changed > 0) {
      console.log(`✅ [${new Date().toLocaleTimeString()}] Sync #${syncCount}: Updated ${changed}/${updated} users`);
    } else {
      console.log(`✓ [${new Date().toLocaleTimeString()}] Sync #${syncCount}: All in sync (${updated} users)`);
    }
  } catch (error) {
    console.error('❌ Sync error:', error);
  }
}

// Initial sync
console.log('🚀 Starting auto-sync service...');
syncTables();

// Sync every 10 seconds
setInterval(syncTables, 10000);

console.log('⏰ Auto-sync running - will sync every 10 seconds');
console.log('Press Ctrl+C to stop');

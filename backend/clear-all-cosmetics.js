// Clear all cosmetic items from all users
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearAllCosmetics() {
  console.log('🧹 CLEARING ALL COSMETIC ITEMS FROM ALL USERS...\n');

  try {
    // Delete all entries from user_cosmetics table
    const { data: deleted, error: deleteError } = await supabase
      .from('user_cosmetics')
      .delete()
      .neq('id', 0); // Delete all rows (neq 0 matches everything)

    if (deleteError) {
      console.error('❌ Error deleting cosmetics:', deleteError);
      return;
    }

    console.log(`✅ Deleted all cosmetic items from user_cosmetics table`);
    console.log(`📊 Total items cleared: ${deleted?.length || 'All'}`);

    // Also clear equipped items from users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .update({
        equipped_ring: null,
        equipped_banner: null
      })
      .not('wallet_address', 'is', null)
      .select();

    if (usersError) {
      console.error('❌ Error clearing equipped items:', usersError);
      return;
    }

    console.log(`✅ Cleared equipped items from ${users?.length || 0} users`);
    console.log('\n🎉 ALL COSMETICS CLEARED! Ready for fresh testing!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

clearAllCosmetics();

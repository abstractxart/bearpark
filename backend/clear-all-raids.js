require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function clearAllRaids() {
  console.log('🧹 Clearing ALL raids from database...');

  try {
    // Delete all records from raids table
    console.log('🗑️  Clearing all raids...');
    const { error: raidsError } = await supabase
      .from('raids')
      .delete()
      .neq('id', 0); // Delete all records

    if (raidsError) {
      console.error('❌ Error clearing raids:', raidsError);
      process.exit(1);
    }

    console.log('✅ Successfully cleared ALL raids!');
    console.log('📊 Database is now reset - ready for fresh raids.');
    console.log('🔄 Refresh your browser to see the reset state.');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

clearAllRaids();

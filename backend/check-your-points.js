import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkPoints() {
  // Check all wallets and their points
  const { data, error } = await supabase
    .from('honey_points')
    .select('*')
    .order('total_points', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n📊 Current Honey Points Status:\n');
  data.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.wallet_address.slice(-8)}: ${entry.total_points} HP (Raiding: ${entry.raiding_points}, Games: ${entry.games_points})`);
  });

  console.log(`\nTotal entries: ${data.length}`);
}

checkPoints();

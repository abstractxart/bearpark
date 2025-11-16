// Fix apex wallet honey points to 5890
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APEX_WALLET = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT';
const NEW_POINTS = 5890;

async function fixApexPoints() {
  console.log(`🍯 Fixing apex wallet (${APEX_WALLET}) to ${NEW_POINTS} honey points...`);

  try {
    // 1. Update users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .update({ total_points: NEW_POINTS })
      .eq('wallet_address', APEX_WALLET)
      .select();

    if (userError) {
      console.error('❌ Error updating users table:', userError);
    } else {
      console.log(`✅ Updated users table:`, userData);
    }

    // 2. Update honey_points table
    const { data: honeyData, error: honeyError } = await supabase
      .from('honey_points')
      .update({ total_points: NEW_POINTS })
      .eq('wallet_address', APEX_WALLET)
      .select();

    if (honeyError) {
      console.error('❌ Error updating honey_points table:', honeyError);
    } else {
      console.log(`✅ Updated honey_points table:`, honeyData);
    }

    console.log(`🎉 Apex wallet now has ${NEW_POINTS} honey points!`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixApexPoints();

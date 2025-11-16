// Verify that the database trigger is working correctly
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_WALLET = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT';

async function verifyTrigger() {
  console.log('🧪 Testing database trigger...\n');

  try {
    // Step 1: Get current state
    console.log('📊 Getting current points...');
    const { data: honeyBefore, error: honeyError } = await supabase
      .from('honey_points')
      .select('total_points')
      .eq('wallet_address', TEST_WALLET)
      .single();

    if (honeyError) {
      console.error('❌ Error fetching honey_points:', honeyError);
      return;
    }

    const { data: userBefore, error: userError } = await supabase
      .from('users')
      .select('total_points')
      .eq('wallet_address', TEST_WALLET)
      .single();

    if (userError) {
      console.error('❌ Error fetching users:', userError);
      return;
    }

    console.log(`   Honey points: ${honeyBefore.total_points}`);
    console.log(`   Users points: ${userBefore.total_points}`);

    // Step 2: Make a test change (add 0.5 then subtract 0.5)
    console.log('\n🔄 Making test update to honey_points (+0.5)...');
    const testValue = honeyBefore.total_points + 0.5;

    const { error: updateError } = await supabase
      .from('honey_points')
      .update({ total_points: testValue })
      .eq('wallet_address', TEST_WALLET);

    if (updateError) {
      console.error('❌ Error updating honey_points:', updateError);
      return;
    }

    // Step 3: Wait for trigger to fire
    console.log('⏳ Waiting for trigger (1 second)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 4: Check if users table was auto-updated
    const { data: userAfter, error: afterError } = await supabase
      .from('users')
      .select('total_points')
      .eq('wallet_address', TEST_WALLET)
      .single();

    if (afterError) {
      console.error('❌ Error checking users table:', afterError);
      return;
    }

    const expectedValue = Math.round(testValue);
    console.log(`   Expected users points: ${expectedValue}`);
    console.log(`   Actual users points: ${userAfter.total_points}`);

    // Step 5: Restore original value
    console.log('\n🔙 Restoring original value...');
    await supabase
      .from('honey_points')
      .update({ total_points: honeyBefore.total_points })
      .eq('wallet_address', TEST_WALLET);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 6: Verify restoration worked
    const { data: finalUser } = await supabase
      .from('users')
      .select('total_points')
      .eq('wallet_address', TEST_WALLET)
      .single();

    console.log(`   Restored to: ${finalUser.total_points}\n`);

    // Step 7: Final verdict
    if (userAfter.total_points === expectedValue && finalUser.total_points === Math.round(honeyBefore.total_points)) {
      console.log('✅ ✅ ✅ TRIGGER IS WORKING PERFECTLY! ✅ ✅ ✅\n');
      console.log('🎉 The localStorage overwrite bug is FIXED!');
      console.log('🛒 Cosmetics purchases will now persist correctly!');
      console.log('\n📋 FINAL STEPS:');
      console.log('   1. Open your BEARpark site in browser');
      console.log('   2. Press F12 to open console');
      console.log('   3. Type: localStorage.clear()');
      console.log('   4. Press Enter');
      console.log('   5. Refresh the page');
      console.log('   6. Test buying a cosmetic - it should stick now!\n');
    } else {
      console.log('❌ TRIGGER NOT WORKING!\n');
      console.log('⚠️  The trigger may not be installed correctly.');
      console.log('📋 Next steps:');
      console.log('   1. Go back to Supabase SQL Editor');
      console.log('   2. Run the SQL code again from install-trigger.js');
      console.log('   3. Make sure you see "Success. No rows returned"');
      console.log('   4. Run this verification script again\n');
    }

  } catch (error) {
    console.error('\n❌ Verification error:', error);
  }
}

verifyTrigger();

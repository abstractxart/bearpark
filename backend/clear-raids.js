// Script to clear raid data from localStorage
// Run this in your browser console at http://localhost:3000/

const walletAddress = localStorage.getItem('bearpark_wallet');
if (walletAddress) {
  console.log('🧹 Clearing raid data for wallet:', walletAddress);

  localStorage.removeItem(`completed_raids_${walletAddress}`);
  localStorage.removeItem(`completed_raids_data_${walletAddress}`);

  console.log('✅ Raid data cleared! Refresh the page to see updated raids.');
} else {
  console.log('❌ No wallet address found. Make sure you are logged in.');
}

// HONEY POINTS TIMER - Only awards points for time with active tapping (every 2.5-3 seconds)
let gameRoundStartTime = null;
let interactionTimestamps = []; // Store all interaction times
let waitingForGameStart = true;
let readyToStart = false;
let gameCompletionHandled = false;
const MIN_TAP_INTERVAL = 2500; // 2.5 seconds
const MAX_TAP_INTERVAL = 3000; // 3 seconds
const MAX_ROUND_TIME_MS = 300000; // 5 minutes max per round

// Track user interaction timestamps
function handleUserInteraction() {
  const now = Date.now();

  // Start timer logic (two-interaction system)
  if (waitingForGameStart && !gameRoundStartTime) {
    if (!readyToStart) {
      readyToStart = true;
      console.log('⏱️ Ready... (next interaction will start timer)');
    } else {
      // Start the timer
      gameRoundStartTime = now;
      interactionTimestamps = [now];
      waitingForGameStart = false;
      readyToStart = false;
      console.log('⏱️ Gameplay started - tracking interactions for honey points');
    }
  } else if (gameRoundStartTime) {
    // Record interaction timestamp during gameplay
    interactionTimestamps.push(now);
  }
}

// Listen for ALL user interactions
document.addEventListener('click', handleUserInteraction);
document.addEventListener('keydown', handleUserInteraction);
document.addEventListener('touchstart', handleUserInteraction);
document.addEventListener('mousedown', handleUserInteraction);
document.addEventListener('touchmove', handleUserInteraction);
document.addEventListener('pointermove', handleUserInteraction);

// Calculate active gameplay time based on tap frequency
function calculateActiveGameplayMinutes(timestamps, gameStart, gameEnd) {
  if (timestamps.length === 0) return 0;

  // Sort timestamps just in case
  timestamps.sort((a, b) => a - b);

  let activeSeconds = 0;
  let lastActiveTimestamp = gameStart;

  // Go through each timestamp and count active periods
  for (let i = 0; i < timestamps.length; i++) {
    const currentTimestamp = timestamps[i];
    const timeSinceLastActive = currentTimestamp - lastActiveTimestamp;

    // If this tap is within 2.5-3 seconds of the last active period
    if (timeSinceLastActive <= MAX_TAP_INTERVAL) {
      // Count the time between last active and this tap as active
      activeSeconds += timeSinceLastActive / 1000;
      lastActiveTimestamp = currentTimestamp;
    } else {
      // Gap too large, reset active tracking from this tap
      lastActiveTimestamp = currentTimestamp;
    }
  }

  // Convert to minutes and round to 0.1 precision
  const activeMinutes = Math.round((activeSeconds / 60) * 10) / 10;
  return activeMinutes;
}

// Function to handle game completion and award points
window.handlePongGameCompletion = async function() {
  if (gameCompletionHandled) return;
  gameCompletionHandled = true;

  console.log('🎮 BEAR PONG game completed!');

  let minutesPlayed = 0;

  if (gameRoundStartTime) {
    const roundEndTime = Date.now();
    const totalElapsed = roundEndTime - gameRoundStartTime;
    const totalSeconds = totalElapsed / 1000;

    // Calculate active gameplay based on interaction pattern
    minutesPlayed = calculateActiveGameplayMinutes(interactionTimestamps, gameRoundStartTime, roundEndTime);

    // Cap at max round time (5 minutes)
    const maxMinutes = MAX_ROUND_TIME_MS / 60000;
    if (minutesPlayed > maxMinutes) {
      console.log(`⚠️ Round time capped at ${maxMinutes} minutes (was ${minutesPlayed.toFixed(1)})`);
      minutesPlayed = maxMinutes;
    }

    console.log(`⏱️ Round ended - Total time: ${totalSeconds.toFixed(1)}s`);
    console.log(`⏱️ Total interactions: ${interactionTimestamps.length}`);
    console.log(`⏱️ Active gameplay (with tapping): ${minutesPlayed.toFixed(1)} minutes`);

    // Reset timer state BEFORE awarding points
    gameRoundStartTime = null;
    interactionTimestamps = [];
    waitingForGameStart = true;
    readyToStart = false;
  }

  // Award points AFTER timer is stopped and reset
  if (minutesPlayed > 0) {
    console.log('🍯 Awarding honey points for active gameplay time...');
    setTimeout(async () => {
      await awardGamePoints('bear-pong', minutesPlayed);
      console.log('⏱️ Click/tap twice to start next round timer.');

      // Reset flag after awarding
      setTimeout(() => {
        gameCompletionHandled = false;
      }, 2000);
    }, 100);
  } else {
    console.log('⚠️ No active gameplay detected (need tapping every 2.5-3 seconds)');
    setTimeout(() => {
      gameCompletionHandled = false;
    }, 2000);
  }
};

console.log('🎮 BEAR PONG honey points integration active!');
console.log('🎯 Earn points by tapping/playing every 2.5-3 seconds');
console.log('🔒 Only active gameplay with consistent tapping counts!');

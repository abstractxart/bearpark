// 🎭 MEME OF THE WEEK - FIXED VERSION - Global State
let currentMemes = [];
let currentSlide = 0;
let userVotes = new Set();
let weekEndTime = null;
let timerInterval = null;

// 🚀 Initialize Meme of the Week
async function initMemeOfTheWeek() {
  try {
    await loadTimer();
    await loadMemes();
    await loadLeaderboard();

    const walletAddress = localStorage.getItem('bearpark_wallet');
    if (walletAddress) {
      await loadUserVotes();
    }

    // Start timer update
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);

    // Setup drag and drop
    const dropZone = document.getElementById('meme-dropzone');
    const fileInput = document.getElementById('meme-file-input');

    dropZone?.addEventListener('click', () => fileInput?.click());

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');

      const file = e.dataTransfer.files[0];
      if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        handleMemeFileSelect(file);
      } else {
        alert('Please drop a valid media file!\nImages: JPG, PNG, GIF, WEBP\nVideos: MP4, WEBM, MOV, AVI, MPEG');
      }
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleMemeFileSelect(file);
    });

    console.log('🎭 Meme of the Week initialized!');
  } catch (error) {
    console.error('❌ Failed to initialize Meme of the Week:', error);
  }
}

// ⏰ Load Timer Info
async function loadTimer() {
  try {
    const response = await fetch('/api/memes/timer');
    const data = await response.json();

    if (data.success) {
      weekEndTime = new Date(data.next_week_start);
      updateTimer();
    }
  } catch (error) {
    console.error('❌ Failed to load timer:', error);
  }
}

// 🕐 Update Timer Display
function updateTimer() {
  const timerEl = document.getElementById('meme-timer');
  if (!timerEl || !weekEndTime) return;

  const now = new Date();
  const diff = weekEndTime - now;

  if (diff <= 0) {
    timerEl.innerHTML = '<span class="days">0d</span><span class="hours">0h</span><span class="mins">0m</span><span class="secs">0s</span>';
    // Week ended - reload memes for new week
    setTimeout(() => {
      loadMemes();
      loadLeaderboard();
      loadTimer();
    }, 2000);
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  timerEl.innerHTML = `<span class="days">${days}d</span><span class="hours">${hours}h</span><span class="mins">${minutes}m</span><span class="secs">${seconds}s</span>`;
}

// 📥 Load Memes from API
async function loadMemes() {
  try {
    const response = await fetch('/api/memes/current-week');
    const data = await response.json();

    if (data.success) {
      currentMemes = data.memes || [];
      currentSlide = 0;
      renderCarousel();
    }
  } catch (error) {
    console.error('❌ Failed to load memes:', error);
  }
}

// 🎠 Render Carousel
function renderCarousel() {
  const container = document.getElementById('meme-track');
  if (!container) return;

  if (currentMemes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 80px;">🎨</div>
        <h3 style="color: var(--gold); font-size: 32px; margin: 20px 0;">No memes yet this week!</h3>
        <p style="color: var(--honey); font-size: 20px;">Be the first to submit a meme and earn 50 honey points!</p>
        <button class="btn btn-gold" onclick="openMemeUploadModal()" style="margin-top: 1rem;">
          📤 SUBMIT MEME
        </button>
      </div>
    `;
    return;
  }

  const walletAddress = localStorage.getItem('bearpark_wallet');
  container.innerHTML = currentMemes.map((meme, index) => {
    const hasVoted = userVotes.has(meme.id);
    const isCurrentUser = walletAddress && meme.wallet_address.toLowerCase() === walletAddress.toLowerCase();
    const isVideo = meme.image_url.match(/\.(mp4|webm|mov|avi|mpeg)$/i);

    // Parse avatar NFT
    let avatarUrl = 'https://files.catbox.moe/1z14d9.jpg';
    if (meme.avatar_nft) {
      try {
        const avatarData = JSON.parse(meme.avatar_nft);
        avatarUrl = avatarData.imageUrl || avatarData.fallbackImageUrl || avatarUrl;
      } catch (e) {}
    }

    const equippedRing = meme.equipped_ring;

    return `
      <div class="meme-slide ${index === currentSlide ? 'active' : ''}" data-slide="${index}">
        <div class="meme-image-container">
          ${isVideo ?
            `<video src="${meme.image_url}" controls class="meme-image"></video>` :
            `<img src="${meme.image_url}" alt="Meme by ${meme.username || 'Anonymous'}" class="meme-image">`
          }
        </div>
        <div class="meme-info">
          <div class="meme-author">
            <div class="meme-avatar-container" style="position: relative; width: 60px; height: 60px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: visible;">
              <img src="${avatarUrl}" alt="${meme.username || 'Anonymous'}" class="meme-avatar" onerror="this.src='https://files.catbox.moe/1z14d9.jpg';">
              ${equippedRing ? `<img src="${equippedRing.image_url}" class="meme-cosmetic-ring ${equippedRing.ring_type}" alt="${equippedRing.name}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; pointer-events: none; z-index: 1; ${equippedRing.rarity === 'bearableguy123' ? 'animation: spinRingImage 3s linear infinite !important;' : ''}">` : ''}
            </div>
            <span class="meme-username">${meme.username || 'Anonymous'}</span>
          </div>
          ${meme.caption ? `<p class="meme-caption">${escapeHtml(meme.caption)}</p>` : ''}
          <div class="meme-actions">
            <button
              class="meme-vote-btn ${hasVoted ? 'voted' : ''}"
              onclick="voteMeme(${meme.id})"
              ${!walletAddress || isCurrentUser ? 'disabled' : ''}
              title="${!walletAddress ? 'Connect wallet to vote' : isCurrentUser ? 'Cannot vote for your own meme' : hasVoted ? 'Click to remove vote' : 'Vote for this meme'}"
            >
              <span class="vote-icon">${hasVoted ? '✅' : '⬆️'}</span>
              <span class="vote-count">${meme.vote_count || 0}</span>
            </button>
          </div>
        </div>
        <div class="meme-counter">${index + 1} / ${currentMemes.length}</div>
      </div>
    `;
  }).join('');
}

// ⬅️ Previous Slide
function prevMemeSlide() {
  if (currentSlide > 0) {
    currentSlide--;
    renderCarousel();
  }
}

// ➡️ Next Slide
function nextMemeSlide() {
  if (currentSlide < currentMemes.length - 1) {
    currentSlide++;
    renderCarousel();
  }
}

// 🗳️ Vote for Meme
async function voteMeme(memeId) {
  console.log('🗳️ voteMeme called for meme ID:', memeId);
  console.log('📋 Current userVotes:', Array.from(userVotes));

  const walletAddress = localStorage.getItem('bearpark_wallet');
  console.log('👛 Wallet address:', walletAddress);

  if (!walletAddress) {
    alert('Please connect your wallet to vote!');
    return;
  }

  // If user already voted for THIS meme, unvote it
  if (userVotes.has(memeId)) {
    console.log('🔄 User already voted for this meme, calling unvote');
    await unvoteMeme(memeId);
    return;
  }

  // Find the meme
  const meme = currentMemes.find(m => m.id === memeId);
  console.log('🎭 Found meme:', meme);
  if (!meme) {
    console.error('❌ Meme not found in currentMemes');
    alert('DEBUG: Meme not found in currentMemes!');
    return;
  }

  // Check if voting for own meme
  if (meme.wallet_address.toLowerCase() === walletAddress.toLowerCase()) {
    console.log('⚠️ Cannot vote for own meme');
    alert('You cannot vote for your own meme!');
    return;
  }

  console.log('📤 Sending vote request to backend...');

  try {
    const response = await fetch(`/api/memes/${memeId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress
      })
    });

    console.log('📥 Response status:', response.status);
    const data = await response.json();
    console.log('📦 Response data:', data);

    // TEMPORARY DEBUG ALERT
    if (!response.ok) {
      alert(`VOTE FAILED!\nStatus: ${response.status}\nError: ${data.error || 'Unknown'}\n\nDID YOU RUN THE SQL SCRIPT IN SUPABASE?`);
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to vote');
    }

    // Handle vote switching
    if (data.switched && data.oldMemeId) {
      userVotes.delete(data.oldMemeId);
      const oldMeme = currentMemes.find(m => m.id === data.oldMemeId);
      if (oldMeme) {
        oldMeme.vote_count = Math.max(0, (oldMeme.vote_count || 0) - 1);
      }
      console.log('🔄 Vote switched from meme', data.oldMemeId, 'to meme', data.newMemeId);
    }

    // Add new vote
    userVotes.clear();
    userVotes.add(memeId);
    meme.vote_count = (meme.vote_count || 0) + 1;

    // Re-render
    renderCarousel();
    loadLeaderboard();

    console.log(data.switched ? '🔄 Vote switched successfully!' : '✅ Vote recorded!');

    // TEMPORARY DEBUG ALERT
    alert(`✅ VOTE SUCCESS!\nMeme ID: ${memeId}\nNew vote count: ${meme.vote_count}`);
  } catch (error) {
    console.error('❌ Vote error:', error);
    alert(`❌ VOTE ERROR!\n${error.message}\n\nCheck if database tables exist in Supabase!`);
  }
}

// 🗳️ Unvote (remove vote from a meme)
async function unvoteMeme(memeId) {
  const walletAddress = localStorage.getItem('bearpark_wallet');
  if (!walletAddress) {
    alert('Please connect your wallet!');
    return;
  }

  // Find the meme
  const meme = currentMemes.find(m => m.id === memeId);
  if (!meme) return;

  try {
    // Use query parameter for DELETE request
    const response = await fetch(`/api/memes/${memeId}/vote?wallet_address=${encodeURIComponent(walletAddress)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to remove vote');
    }

    // Remove vote from local state
    userVotes.delete(memeId);
    meme.vote_count = Math.max(0, (meme.vote_count || 0) - 1);

    // Re-render
    renderCarousel();
    loadLeaderboard();

    console.log('❌ Vote removed!');
  } catch (error) {
    console.error('❌ Unvote error:', error);
    alert(`Failed to remove vote: ${error.message}`);
  }
}

// 📊 Load Leaderboard
async function loadLeaderboard() {
  try {
    const response = await fetch('/api/memes/leaderboard');
    const data = await response.json();

    const container = document.getElementById('meme-leaderboard-list');
    if (!container) return;

    if (!data.success || data.leaderboard.length === 0) {
      container.innerHTML = `
        <div class="leaderboard-empty">No memes yet!</div>
      `;
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const rewards = [50, 35, 20];

    container.innerHTML = data.leaderboard.map((meme, index) => {
      const isVideo = meme.image_url.match(/\.(mp4|webm|mov|avi|mpeg)$/i);

      // Parse avatar NFT
      let avatarUrl = 'https://files.catbox.moe/1z14d9.jpg';
      if (meme.avatar_nft) {
        try {
          const avatarData = JSON.parse(meme.avatar_nft);
          avatarUrl = avatarData.imageUrl || avatarData.fallbackImageUrl || avatarUrl;
        } catch (e) {}
      }

      const equippedRing = meme.equipped_ring;

      return `
        <div class="leaderboard-item" onclick="jumpToMeme(${meme.id})" style="cursor: pointer;">
          <div class="leaderboard-rank">${medals[index] || `#${index + 1}`}</div>
          ${isVideo ?
            `<video src="${meme.image_url}" class="leaderboard-meme-thumb" muted loop autoplay playsinline></video>` :
            `<img src="${meme.image_url}" alt="Meme" class="leaderboard-meme-thumb">`
          }
          <div class="leaderboard-info">
            <div class="leaderboard-user">
              <div class="leaderboard-avatar-container" style="position: relative; width: 48px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: visible;">
                <img src="${avatarUrl}" alt="${meme.username || 'Anonymous'}" class="leaderboard-avatar" onerror="this.src='https://files.catbox.moe/1z14d9.jpg';">
                ${equippedRing ? `<img src="${equippedRing.image_url}" class="leaderboard-cosmetic-ring ${equippedRing.ring_type}" alt="${equippedRing.name}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; pointer-events: none; z-index: 1; ${equippedRing.rarity === 'bearableguy123' ? 'animation: spinRingImage 3s linear infinite !important;' : ''}">` : ''}
              </div>
              <span class="leaderboard-username">${meme.username || 'Anonymous'}</span>
            </div>
            <div class="leaderboard-stats">
              <span class="leaderboard-votes">⬆️ ${meme.vote_count || 0}</span>
              ${index < 3 ? `<span class="leaderboard-reward">+${rewards[index]} 🍯</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('❌ Failed to load leaderboard:', error);
  }
}

// 🎯 Jump to specific meme in carousel
function jumpToMeme(memeId) {
  // Find the index of this meme in currentMemes
  const memeIndex = currentMemes.findIndex(m => m.id === memeId);

  if (memeIndex === -1) {
    console.error('Meme not found in carousel:', memeId);
    return;
  }

  // Set the current slide to this meme
  currentSlide = memeIndex;

  // Re-render the carousel to show this meme
  renderCarousel();

  // Scroll to the meme carousel section
  const carouselSection = document.getElementById('meme-carousel-container');
  if (carouselSection) {
    carouselSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  console.log(`🎯 Jumped to meme ${memeId} (slide ${memeIndex + 1}/${currentMemes.length})`);
}

// 📥 Load User's Votes
async function loadUserVotes() {
  const walletAddress = localStorage.getItem('bearpark_wallet');
  if (!walletAddress) {
    console.log('⚠️ No wallet address, skipping vote load');
    return;
  }

  try {
    console.log('📥 Loading user votes for:', walletAddress);
    const response = await fetch(`/api/memes/user-votes/${walletAddress}`);
    const data = await response.json();

    console.log('📦 User votes response:', data);

    if (data.success && data.votes) {
      // Clear existing votes and add new ones
      userVotes.clear();
      data.votes.forEach(v => {
        console.log('Adding vote for meme ID:', v.meme_id);
        userVotes.add(v.meme_id);
      });
      console.log('✅ Loaded votes:', Array.from(userVotes));
    } else {
      console.log('⚠️ No votes found or failed:', data);
    }
  } catch (error) {
    console.error('❌ Failed to load user votes:', error);
    alert(`DEBUG: Failed to load votes!\n${error.message}`);
  }
}

// 📤 Open Upload Modal
function openMemeUploadModal() {
  const walletAddress = localStorage.getItem('bearpark_wallet');
  if (!walletAddress) {
    alert('Please connect your wallet to submit a meme!');
    return;
  }

  const modal = document.getElementById('meme-upload-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

// ❌ Close Upload Modal
function closeMemeUploadModal() {
  const modal = document.getElementById('meme-upload-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// 📁 Handle File Selection
function handleMemeFileSelect(file) {
  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024; // 50MB for videos, 5MB for images

  // Validate file size
  if (file.size > maxSize) {
    alert(`File too large! Maximum size is ${isVideo ? '50MB' : '5MB'}.`);
    return;
  }

  const validTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'
  ];
  if (!validTypes.includes(file.type)) {
    alert('Invalid file type! Please upload:\nImages: JPG, PNG, GIF, WEBP\nVideos: MP4, WEBM, MOV, AVI, MPEG');
    return;
  }

  // Store file reference
  window.selectedMemeFile = file;

  // Enable submit button
  const submitBtn = document.getElementById('meme-submit-btn');
  if (submitBtn) submitBtn.disabled = false;
}

// 📤 Submit Meme
async function submitMeme() {
  const walletAddress = localStorage.getItem('bearpark_wallet');
  if (!walletAddress) {
    alert('Please connect your wallet first!');
    return;
  }

  if (!window.selectedMemeFile) {
    alert('Please select an image or video!');
    return;
  }

  const submitBtn = document.getElementById('meme-submit-btn');

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = '📤 UPLOADING...';

    // Upload to Supabase Storage via backend
    const fileExt = window.selectedMemeFile.name.split('.').pop();
    const fileName = `${walletAddress}_${Date.now()}.${fileExt}`;

    // Create form data
    const formData = new FormData();
    formData.append('file', window.selectedMemeFile);
    formData.append('wallet_address', walletAddress);
    formData.append('file_name', fileName);

    // Submit to backend
    const response = await fetch('/api/memes/submit', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to submit meme');
    }

    alert('🎉 Meme submitted successfully! You earned 50 honey points!');

    // Refresh data
    await loadMemes();
    await loadLeaderboard();

    // Update honey points if function exists
    if (typeof fetchHoneyPoints === 'function') {
      await fetchHoneyPoints();
    }

    // Close modal
    closeMemeUploadModal();

    console.log('✅ Meme submitted successfully!');
  } catch (error) {
    console.error('❌ Submit error:', error);
    alert(`Failed to submit meme: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '📤 SUBMIT MEME';
  }
}

// 🛡️ Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 🚀 Initialize when wallet connects
if (typeof window.addEventListener !== 'undefined') {
  // Wait for DOM and wallet to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initMemeOfTheWeek, 1000);
    });
  } else {
    setTimeout(initMemeOfTheWeek, 1000);
  }

  // Re-initialize when wallet connects
  window.addEventListener('walletConnected', () => {
    setTimeout(initMemeOfTheWeek, 500);
  });
}

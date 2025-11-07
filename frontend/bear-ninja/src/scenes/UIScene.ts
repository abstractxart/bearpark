import Phaser from "phaser";
import * as utils from "../utils";

export default class UIScene extends Phaser.Scene {
  public uiContainer?: Phaser.GameObjects.DOMElement;
  public gameScene?: Phaser.Scene;
  private currentGameSceneKey: string | null = null;

  constructor() {
    super({
      key: "UIScene",
    });
  }

  init(data: { gameSceneKey?: string; currentLevelKey?: string }) {
    // Receive current game scene key
    this.currentGameSceneKey = data.gameSceneKey || data.currentLevelKey || null;
  }

  create(): void {
    if (this.currentGameSceneKey) {
      // Get reference to the game scene
      this.gameScene = this.scene.get(this.currentGameSceneKey);
    }
    
    // Create UI DOM
    this.createDOMUI();
    
    // Setup event listeners
    this.setupEventListeners();
  }

  createDOMUI(): void {
    const uiHTML = `
      <div id="ui-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-supercell text-white">
        <!-- Pause Button (Top Right) -->
        <div class="absolute top-2 right-2 pointer-events-auto">
          <div id="pause-button" class="game-3d-container-clickable-orange-600 px-3 py-2 text-white font-bold cursor-pointer transition-all duration-200" style="
            font-size: 20px;
            text-shadow: 2px 2px 0px #000000;
            border-radius: 8px;
            min-width: 50px;
            text-align: center;
            user-select: none;
          ">⏸️</div>
        </div>

        <!-- Top UI Bar -->
        <div class="absolute top-2 left-2 flex items-center space-x-2 pointer-events-auto">
          <div class="game-3d-container-blue-600 px-2 py-1 text-sm font-bold">
            Score: <span id="score-value">0</span>
          </div>
          <div class="game-3d-container-red-600 px-2 py-1 text-sm font-bold">
            Lives: <span id="lives-value">3</span>
          </div>
          <div class="game-3d-container-purple-600 px-2 py-1 text-sm font-bold">
            Level: <span id="level-value">1</span>
          </div>
          <div id="combo-display" class="game-3d-container-yellow-500 px-2 py-1 text-sm font-bold" style="display: none;">
            Combo: <span id="combo-value">0</span>x
          </div>
          <div id="streak-display" class="game-3d-container-green-600 px-2 py-1 text-sm font-bold">
            Streak: <span id="streak-value">0</span>
          </div>
          <div id="frenzy-mode-indicator" class="game-3d-container-clickable-red-500 px-2 py-1 text-sm font-bold animate-pulse" style="display: none;">
            🔥 FRENZY 🔥
          </div>
          <div id="special-mode-indicator" class="game-3d-container-clickable-orange-500 px-2 py-1 text-sm font-bold animate-pulse" style="display: none;">
            ⚡ SPECIAL ⚡
          </div>
        </div>

        <!-- Top Center Notifications (Level Up & Golden Fruit) -->
        <div class="absolute top-8 left-1/2 transform -translate-x-1/2 text-center pointer-events-none z-50">
          <!-- Difficulty Increase Notification -->
          <div id="difficulty-increase" class="game-3d-container-clickable-orange-500 px-3 py-1 text-lg font-bold" style="display: none;">
            🔥 LEVEL UP! 🔥
          </div>
          
          <!-- Hourglass Mode Indicator -->
          <div id="golden-fruit-zoom-mode" class="game-3d-container-clickable-yellow-400 px-4 py-2 text-xl font-bold mt-2" style="display: none; animation: goldenPulse 0.8s infinite alternate;">
            <div>HOURGLASS MODE ACTIVATED</div>
            <div class="text-lg mt-1">SWIPE!</div>
          </div>
          
          <!-- Golden Fruit Slice Counter -->
          <div id="golden-fruit-indicator" class="game-3d-container-clickable-yellow-500 px-3 py-1 text-lg font-bold animate-pulse mt-2" style="display: none;">
            SLICE COUNT: 0/20
          </div>
          
          <!-- Golden Fruit Progress Bar -->
          <div id="golden-fruit-progress" class="mt-2" style="display: none;">
            <div class="game-3d-container-slot-gray-800 w-48 h-2 mx-auto relative">
              <div id="golden-fruit-progress-fill" class="game-3d-container-progress-fill-yellow-500 h-full transition-all duration-300" style="width: 0%;">
              </div>
            </div>
            <div class="text-yellow-300 text-sm font-bold mt-1">TIME REMAINING</div>
          </div>
        </div>

        <!-- Center UI Elements -->
        <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <!-- Slice quality indicators removed for clean gameplay experience -->
        </div>

        <!-- Instructions (shown at start) -->
        <div id="instructions" class="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-center pointer-events-none">
          <div class="game-3d-container-gray-700 px-3 py-1 text-sm">
            Swipe to slice 🐻artifacts! Avoid bombs! Press ESC to pause!
          </div>
        </div>
        
        <!-- Pause Indicator -->
        <div id="pause-indicator" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-50" style="display: none;">
          <div class="game-3d-container-clickable-orange-600 px-8 py-4 text-white font-bold" style="
            font-size: 36px;
            text-shadow: 4px 4px 0px #000000;
            animation: pauseBlink 1s ease-in-out infinite alternate;
          ">⏸️ PAUSED</div>
        </div>

        <!-- Custom Animations -->
        <style>
          #pause-button:hover {
            transform: scale(1.1);
            filter: brightness(1.2);
          }
          
          #pause-button:active {
            transform: scale(0.95);
            filter: brightness(0.9);
          }
          
          @keyframes goldenPulse {
            from { 
              transform: scale(1) rotate(-1deg);
              text-shadow: 0 0 20px #ffd700, 0 0 40px #ffd700;
            }
            to { 
              transform: scale(1.1) rotate(1deg);
              text-shadow: 0 0 30px #ffd700, 0 0 60px #ffd700, 0 0 80px #ffd700;
            }
          }
          
          @keyframes heartbeat {
            0%, 100% { 
              transform: scale(1);
            }
            50% { 
              transform: scale(1.15);
            }
          }
          
          @keyframes pauseBlink {
            from { opacity: 0.7; }
            to { opacity: 1; }
          }
          
          /* Score animations removed for clean gameplay experience */
          
          /* Achievement animation removed */
        </style>
      </div>
    `;

    this.uiContainer = utils.initUIDom(this, uiHTML);
    
    // Hide instructions after a few seconds
    this.time.delayedCall(5000, () => {
      const instructions = document.getElementById("instructions");
      if (instructions) {
        instructions.style.display = "none";
      }
    });
  }

  setupEventListeners(): void {
    if (!this.gameScene) return;
    
    // Setup pause button click handler
    this.setupPauseButton();
    
    // Listen for game events
    this.gameScene.events.on('scoreUpdated', (score: number) => {
      this.updateScore(score);
    });
    
    this.gameScene.events.on('livesUpdated', (lives: number) => {
      this.updateLives(lives);
    });
    
    this.gameScene.events.on('comboUpdated', (combo: number) => {
      this.updateCombo(combo);
    });
    
    this.gameScene.events.on('streakUpdated', (streak: number) => {
      this.updateStreak(streak);
    });
    
    this.gameScene.events.on('goldenFruitSlice', (data: any) => {
      this.showGoldenFruit(data);
    });
    
    this.gameScene.events.on('goldenFruitZoomActivated', () => {
      this.showGoldenFruitZoomMode();
    });
    
    this.gameScene.events.on('goldenFruitZoomDeactivated', () => {
      this.hideGoldenFruitZoomMode();
    });
    
    this.gameScene.events.on('difficultyIncreased', (data: any) => {
      this.showDifficultyIncrease(data.level);
      this.updateLevel(data.level);
    });
    
    this.gameScene.events.on('gameRestarted', () => {
      this.resetUI();
    });
    
    // Achievement system removed
    
    this.gameScene.events.on('frenzyModeActivated', () => {
      this.showFrenzyMode();
    });
    
    this.gameScene.events.on('frenzyModeDeactivated', () => {
      this.hideFrenzyMode();
    });
    
    // Perfect slice quality indicators completely removed for clean gameplay experience
    
    // Enhanced difficulty progression events
    this.gameScene.events.on('timeDifficultyIncreased', (data: any) => {
      this.showTimeDifficultyIncrease(data.level, data.message);
    });
    
    this.gameScene.events.on('rapidFireActivated', (data: any) => {
      this.showSpecialMode(data.message, '#ff4500', data.duration);
    });
    
    this.gameScene.events.on('rapidFireEnded', () => {
      this.hideSpecialMode();
    });
    
    this.gameScene.events.on('chaosModeActivated', (data: any) => {
      this.showSpecialMode(data.message, '#ff0000', data.duration);
    });
    
    this.gameScene.events.on('chaosModeEnded', () => {
      this.hideSpecialMode();
    });
  }

  setupPauseButton(): void {
    const pauseButton = document.getElementById('pause-button');
    if (pauseButton && this.gameScene) {
      pauseButton.addEventListener('click', () => {
        // Add click visual feedback
        pauseButton.style.transform = 'scale(0.9)';
        
        // Call pause method on the game scene if it exists
        if (this.gameScene && typeof (this.gameScene as any).pauseGame === 'function') {
          (this.gameScene as any).pauseGame();
        }
        
        // Reset visual feedback after a brief moment
        setTimeout(() => {
          pauseButton.style.transform = '';
        }, 150);
      });
      
      // Add keyboard shortcut hint on hover
      pauseButton.addEventListener('mouseenter', () => {
        pauseButton.title = 'Pause Game (ESC key also works)';
      });
    }
  }

  updateScore(score: number): void {
    console.log(`UI Scene received score update: ${score}`);
    const scoreElement = document.getElementById("score-value");
    if (scoreElement) {
      console.log(`Updating score element from ${scoreElement.textContent} to ${score}`);
      // Simply update the score text with no animation at all
      scoreElement.textContent = score.toString();
    } else {
      console.log('Score element not found in DOM!');
    }
  }

  updateLives(lives: number): void {
    const livesElement = document.getElementById("lives-value");
    const livesContainer = livesElement?.parentElement;
    
    if (livesElement && livesContainer) {
      livesElement.textContent = lives.toString();
      
      // Add beating heart animation when lives are low
      if (lives <= 1) {
        livesContainer.style.animation = "heartbeat 0.8s ease-in-out infinite";
        livesContainer.style.color = "#ff4444";
      } else if (lives <= 2) {
        livesContainer.style.animation = "heartbeat 1.2s ease-in-out infinite";
        livesContainer.style.color = "#ffaa44";
      } else {
        livesContainer.style.animation = "";
        livesContainer.style.color = "";
      }
    }
  }

  updateLevel(level: number): void {
    const levelElement = document.getElementById("level-value");
    if (levelElement) {
      levelElement.textContent = (level + 1).toString(); // Show as level 1, 2, 3... instead of 0, 1, 2...
    }
  }

  updateCombo(combo: number): void {
    const comboDisplay = document.getElementById("combo-display");
    const comboValue = document.getElementById("combo-value");
    
    if (comboDisplay && comboValue) {
      if (combo > 1) {
        comboDisplay.style.display = "block";
        comboValue.textContent = combo.toString();
        
        // Enhanced visual feedback based on combo level - use text effects instead of transforms
        if (combo >= 10) {
          comboDisplay.className = "game-3d-container-clickable-red-500 px-2 py-1 text-sm font-bold animate-pulse";
          comboDisplay.style.textShadow = "0 0 12px rgba(239, 68, 68, 0.8), 2px 2px 0px #000000";
          comboDisplay.style.fontWeight = "900";
        } else if (combo >= 5) {
          comboDisplay.className = "game-3d-container-clickable-orange-500 px-2 py-1 text-sm font-bold animate-pulse";
          comboDisplay.style.textShadow = "0 0 8px rgba(249, 115, 22, 0.6), 2px 2px 0px #000000";
          comboDisplay.style.fontWeight = "800";
        } else {
          comboDisplay.className = "game-3d-container-yellow-500 px-2 py-1 text-sm font-bold";
          comboDisplay.style.textShadow = "";
          comboDisplay.style.fontWeight = "";
        }
      } else {
        comboDisplay.style.display = "none";
      }
    }
  }

  updateStreak(streak: number): void {
    const streakDisplay = document.getElementById("streak-display");
    const streakValue = document.getElementById("streak-value");
    
    if (streakDisplay && streakValue) {
      streakValue.textContent = streak.toString();
      
      // Add visual feedback for high streaks
      if (streak >= 20) {
        streakDisplay.classList.add("animate-pulse");
        streakDisplay.style.color = "#ff0000"; // Red for very high streaks
      } else if (streak >= 10) {
        streakDisplay.classList.add("animate-pulse");
        streakDisplay.style.color = "#ffd700"; // Gold for high streaks
      } else if (streak >= 5) {
        streakDisplay.style.color = "#00ff00"; // Green for medium streaks
        streakDisplay.classList.remove("animate-pulse");
      } else {
        streakDisplay.style.color = "#ffffff"; // White for low streaks
        streakDisplay.classList.remove("animate-pulse");
      }
    }
  }

  showGoldenFruitZoomMode(): void {
    const zoomIndicator = document.getElementById("golden-fruit-zoom-mode");
    const sliceIndicator = document.getElementById("golden-fruit-indicator");
    const progressBar = document.getElementById("golden-fruit-progress");
    const progressFill = document.getElementById("golden-fruit-progress-fill");
    
    if (zoomIndicator) {
      zoomIndicator.style.display = "block";
    }
    
    if (sliceIndicator) {
      sliceIndicator.textContent = "SLICE COUNT: 0/20";
      sliceIndicator.style.display = "block";
    }
    
    if (progressBar) {
      progressBar.style.display = "block";
    }
    
    if (progressFill) {
      progressFill.style.width = "100%";
      // Animate progress bar countdown over 11 seconds
      this.tweens.add({
        targets: { progress: 100 },
        progress: 0,
        duration: 11000, // 11 second duration
        ease: 'Linear',
        onUpdate: (tween) => {
          const value = tween.getValue();
          if (progressFill) {
            progressFill.style.width = `${value}%`;
          }
        }
      });
    }
  }

  hideGoldenFruitZoomMode(): void {
    const zoomIndicator = document.getElementById("golden-fruit-zoom-mode");
    const sliceIndicator = document.getElementById("golden-fruit-indicator");
    const progressBar = document.getElementById("golden-fruit-progress");
    
    if (zoomIndicator) {
      zoomIndicator.style.display = "none";
    }
    
    if (sliceIndicator) {
      sliceIndicator.style.display = "none";
    }
    
    if (progressBar) {
      progressBar.style.display = "none";
    }
  }

  showGoldenFruit(data: any): void {
    const goldenIndicator = document.getElementById("golden-fruit-indicator");
    if (goldenIndicator) {
      // Update text to show slice count
      goldenIndicator.textContent = `SLICE COUNT: ${data.slice}/${data.totalSlices}`;
      goldenIndicator.style.display = "block";
      
      // Add increasing glow effect based on slice count
      const glowIntensity = Math.min(data.slice * 10, 100);
      goldenIndicator.style.textShadow = `0 0 ${glowIntensity}px #ffd700, 0 0 ${glowIntensity * 2}px #ffd700`;
      
      // Hide after 3 seconds if this is the final slice for extended satisfaction
      if (data.slice >= data.totalSlices) {
        // Show completion message
        goldenIndicator.textContent = "GOLDEN FRENZY COMPLETE!";
        goldenIndicator.style.color = "#FFD700";
        goldenIndicator.style.fontSize = "28px";
        
        this.time.delayedCall(3000, () => {
          goldenIndicator.style.display = "none";
        });
      }
    }
  }



  showDifficultyIncrease(level: number): void {
    // Level up popup animations completely removed for clean gameplay experience
  }

  // Achievement system removed
  
  showFrenzyMode(): void {
    const indicator = document.getElementById("frenzy-mode-indicator");
    if (indicator) {
      indicator.style.display = "block";
    }
  }
  
  hideFrenzyMode(): void {
    const indicator = document.getElementById("frenzy-mode-indicator");
    if (indicator) {
      indicator.style.display = "none";
    }
  }
  
  showSliceQuality(text: string, color: string, x: number, y: number): void {
    // Slice quality animations completely removed for clean gameplay experience
  }

  // Enhanced difficulty progression UI methods
  showTimeDifficultyIncrease(level: number, message: string): void {
    // Time difficulty increase notifications completely removed for clean gameplay experience
  }

  showSpecialMode(message: string, color: string, duration: number): void {
    const indicator = document.getElementById("special-mode-indicator");
    if (indicator) {
      indicator.textContent = message;
      indicator.style.display = "block";
      indicator.style.color = color;
      indicator.style.borderColor = color;
      
      // Create countdown effect
      const startTime = Date.now();
      const updateCountdown = () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        const seconds = Math.ceil(remaining / 1000);
        
        if (remaining > 0 && indicator.style.display !== "none") {
          indicator.textContent = `${message} (${seconds}s)`;
          setTimeout(updateCountdown, 100);
        }
      };
      updateCountdown();
    }
  }

  hideSpecialMode(): void {
    const indicator = document.getElementById("special-mode-indicator");
    if (indicator) {
      indicator.style.display = "none";
    }
  }

  resetUI(): void {
    // Reset all counters
    this.updateScore(0);
    this.updateLives(3);
    this.updateLevel(0);
    this.updateCombo(0);
    this.updateStreak(0);
    
    // Hide all special indicators
    this.hideFrenzyMode();
    this.hideSpecialMode();
    this.hideGoldenFruitZoomMode();
    
    // Hide difficulty notifications
    const difficultyElement = document.getElementById("difficulty-increase");
    if (difficultyElement) {
      difficultyElement.style.display = "none";
    }
  }
}
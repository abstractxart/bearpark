/**
 * BEAR PONG - Multiplayer Pong Game
 * Completely standalone game - NO dependencies on any other games
 */
import Phaser from 'phaser';
import { PongLobbyScene } from './scenes/PongLobbyScene';
import { PongBettingLobbyScene } from './scenes/PongBettingLobbyScene';
import { PongGameScene } from './scenes/PongGameScene';
import { PongUIScene } from './scenes/PongUIScene';
import { PongPauseScene } from './scenes/PongPauseScene';
import { PongGameOverScene } from './scenes/PongGameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    PongLobbyScene,
    PongBettingLobbyScene,
    PongGameScene,
    PongUIScene,
    PongPauseScene,
    PongGameOverScene
  ],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      fps: 60
    }
  }
};

// Create game instance
const game = new Phaser.Game(config);

// Start with lobby scene (will auto-connect and search for opponent)
game.scene.start('PongLobbyScene');

// Log startup
console.log('🎮 BEAR PONG initialized');
console.log('🔌 Server URL:', 'wss://bear-pong-production.up.railway.app');

export default game;

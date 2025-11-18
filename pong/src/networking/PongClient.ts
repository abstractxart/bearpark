/**
 * PongClient - WebSocket client for multiplayer Pong
 * Handles connection to the Pong server and message routing
 */
import type { ClientMessage, ServerMessage, PlayerData } from './types';

export class PongClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // ms
  private playerData: PlayerData | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to Pong server: ${this.serverUrl}`);

      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log('✅ Connected to Pong server');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            this.handleServerMessage(message);
          } catch (error) {
            console.error('❌ Error parsing server message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('🔌 Disconnected from Pong server');
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect to the server
   */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Max reconnect attempts reached');
      this.emit('connection_failed', null);
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(() => {
        // Error is already logged in connect()
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  /**
   * Handle messages from server
   */
  private handleServerMessage(message: ServerMessage) {
    console.log('📨 Received:', message.type, message);

    switch (message.type) {
      case 'queue_joined':
        this.emit('queue_joined', message.position);
        break;

      case 'match_found':
        this.emit('match_found', {
          opponent: message.opponent,
          yourSide: message.yourSide
        });
        break;

      case 'countdown':
        this.emit('countdown', message.count);
        break;

      case 'game_state':
        this.emit('game_state', message.state);
        break;

      case 'game_over':
        this.emit('game_over', {
          winner: message.winner,
          finalScore: message.finalScore
        });
        break;

      case 'opponent_disconnected':
        this.emit('opponent_disconnected', null);
        break;

      case 'rematch_requested':
        this.emit('rematch_requested', null);
        break;

      case 'rematch_accepted':
        this.emit('rematch_accepted', null);
        break;

      case 'error':
        this.emit('error', message.message);
        break;

      case 'opponent_bet_set':
        this.emit('opponent_bet_set', (message as any));
        break;

      case 'opponent_ready':
        this.emit('opponent_ready', null);
        break;

      case 'final_bet_amount':
        this.emit('final_bet_amount', (message as any));
        break;

      case 'betting_timeout':
        this.emit('betting_timeout', null);
        break;

      case 'powerups_refreshed':
        this.emit('powerups_refreshed', null);
        break;

      default:
        console.log('⚠️ Unknown message type:', (message as any).type);
    }
  }

  /**
   * Register a message handler
   */
  on(event: string, handler: (data: any) => void) {
    this.messageHandlers.set(event, handler);
  }

  /**
   * Emit an event to registered handlers
   */
  private emit(event: string, data: any) {
    const handler = this.messageHandlers.get(event);
    if (handler) {
      handler(data);
    }
  }

  /**
   * Send a message to the server
   */
  private send(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('❌ Cannot send message - WebSocket not connected');
    }
  }

  /**
   * Join the matchmaking queue
   */
  joinQueue(playerData: PlayerData) {
    console.log('🎯 Joining matchmaking queue...');
    this.playerData = playerData; // Store player data
    this.send({
      type: 'join_queue',
      data: playerData
    });
  }

  /**
   * Get the current player's data
   */
  getPlayerData(): PlayerData | null {
    return this.playerData;
  }

  /**
   * Send paddle movement update
   */
  movePaddle(y: number) {
    this.send({
      type: 'paddle_move',
      y: y,
      timestamp: Date.now()
    });
  }

  /**
   * Send ready signal
   */
  ready() {
    this.send({ type: 'ready' });
  }

  /**
   * Request a rematch
   */
  requestRematch() {
    this.send({ type: 'rematch' });
  }

  /**
   * Leave the game
   */
  leave() {
    this.send({ type: 'leave' });
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected to server
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

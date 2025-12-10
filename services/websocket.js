/**
 * WebSocket Service for BEARpark
 * Provides real-time updates for raids, leaderboards, and activity
 */

const { Server } = require('socket.io');

let io = null;

// Track connected clients
const connectedClients = new Map(); // socketId -> { wallet, subscribedChannels }

/**
 * Initialize WebSocket server
 */
function initWebSocket(httpServer, corsOrigins) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`🔌 WebSocket client connected: ${socket.id}`);

    // Track this client
    connectedClients.set(socket.id, {
      wallet: null,
      subscribedChannels: new Set(),
      connectedAt: Date.now(),
    });

    // Client identifies with their wallet
    socket.on('identify', (wallet) => {
      if (wallet && typeof wallet === 'string') {
        const client = connectedClients.get(socket.id);
        if (client) {
          client.wallet = wallet;
          socket.join(`wallet:${wallet}`);
          console.log(`👤 Client ${socket.id} identified as ${wallet.substring(0, 8)}...`);
        }
      }
    });

    // Subscribe to specific game leaderboard
    socket.on('subscribe:leaderboard', (gameId) => {
      if (gameId && typeof gameId === 'string') {
        socket.join(`leaderboard:${gameId}`);
        const client = connectedClients.get(socket.id);
        if (client) {
          client.subscribedChannels.add(`leaderboard:${gameId}`);
        }
        console.log(`📊 Client ${socket.id} subscribed to leaderboard:${gameId}`);
      }
    });

    // Subscribe to raids channel
    socket.on('subscribe:raids', () => {
      socket.join('raids');
      const client = connectedClients.get(socket.id);
      if (client) {
        client.subscribedChannels.add('raids');
      }
      console.log(`🎯 Client ${socket.id} subscribed to raids`);
    });

    // Subscribe to honey points leaderboard
    socket.on('subscribe:honey', () => {
      socket.join('honey');
      const client = connectedClients.get(socket.id);
      if (client) {
        client.subscribedChannels.add('honey');
      }
      console.log(`🍯 Client ${socket.id} subscribed to honey leaderboard`);
    });

    // Ping/pong for latency measurement
    socket.on('ping', () => {
      socket.emit('pong', Date.now());
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`❌ WebSocket client disconnected: ${socket.id} (${reason})`);
      connectedClients.delete(socket.id);
    });
  });

  console.log('✅ WebSocket server initialized');
  return io;
}

/**
 * Get Socket.io instance
 */
function getIO() {
  return io;
}

/**
 * Broadcast to all connected clients
 */
function broadcast(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

/**
 * Send to specific room/channel
 */
function toRoom(room, event, data) {
  if (io) {
    io.to(room).emit(event, data);
  }
}

/**
 * Send to specific wallet
 */
function toWallet(wallet, event, data) {
  if (io) {
    io.to(`wallet:${wallet}`).emit(event, data);
  }
}

// ============================================
// EVENT EMITTERS FOR SPECIFIC UPDATES
// ============================================

/**
 * Broadcast new raid
 */
function emitNewRaid(raid) {
  toRoom('raids', 'raid:new', raid);
  broadcast('notification', {
    type: 'raid',
    message: 'New raid available!',
    data: raid,
  });
}

/**
 * Broadcast raid completed by user
 */
function emitRaidCompleted(wallet, raidId, pointsAwarded) {
  toWallet(wallet, 'raid:completed', {
    raidId,
    pointsAwarded,
    timestamp: Date.now(),
  });

  // Broadcast to raids room that someone completed it
  toRoom('raids', 'raid:activity', {
    wallet: wallet.substring(0, 8) + '...',
    raidId,
    action: 'completed',
  });
}

/**
 * Broadcast leaderboard update
 */
function emitLeaderboardUpdate(gameId, leaderboard) {
  toRoom(`leaderboard:${gameId}`, 'leaderboard:update', {
    gameId,
    leaderboard,
    timestamp: Date.now(),
  });
}

/**
 * Broadcast new high score
 */
function emitNewHighScore(gameId, entry) {
  toRoom(`leaderboard:${gameId}`, 'leaderboard:highscore', {
    gameId,
    entry,
    timestamp: Date.now(),
  });

  broadcast('notification', {
    type: 'highscore',
    message: `New high score in ${gameId}!`,
    data: entry,
  });
}

/**
 * Broadcast honey leaderboard update
 */
function emitHoneyLeaderboardUpdate(leaderboard) {
  toRoom('honey', 'honey:update', {
    leaderboard,
    timestamp: Date.now(),
  });
}

/**
 * Broadcast points update to specific wallet
 */
function emitPointsUpdate(wallet, points) {
  toWallet(wallet, 'points:update', {
    ...points,
    timestamp: Date.now(),
  });
}

/**
 * Get WebSocket stats for health endpoint
 */
function getStats() {
  if (!io) {
    return { enabled: false };
  }

  const clients = connectedClients.size;
  const rooms = io.sockets.adapter.rooms.size;

  return {
    enabled: true,
    clients,
    rooms,
  };
}

module.exports = {
  initWebSocket,
  getIO,
  broadcast,
  toRoom,
  toWallet,
  emitNewRaid,
  emitRaidCompleted,
  emitLeaderboardUpdate,
  emitNewHighScore,
  emitHoneyLeaderboardUpdate,
  emitPointsUpdate,
  getStats,
};

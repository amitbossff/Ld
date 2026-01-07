import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin with your credentials
// Note: For production, use service account key
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase Admin (using public config for database access)
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: firebaseConfig.databaseURL
});

const db = admin.database();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API endpoint to get active rooms
app.get('/api/rooms', (req, res) => {
  db.ref('rooms').once('value')
    .then(snapshot => {
      const rooms = snapshot.val() || {};
      res.json({ rooms: Object.keys(rooms) });
    })
    .catch(error => {
      res.status(500).json({ error: error.message });
    });
});

// Game state management
const activeGames = new Map();

// Save game to Firebase
async function saveGameToFirebase(roomId, gameData) {
  try {
    await db.ref(`games/${roomId}`).set({
      ...gameData,
      updatedAt: Date.now()
    });
    await db.ref(`rooms/${roomId}`).set({
      players: gameData.players.length,
      status: gameData.gameStarted ? 'playing' : 'waiting',
      createdAt: gameData.createdAt || Date.now()
    });
    console.log(`Game saved to Firebase: ${roomId}`);
  } catch (error) {
    console.error('Firebase save error:', error);
  }
}

// Socket.io events
io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id.substring(0, 6));

  // Create new game room
  socket.on('create-room', async (playerName) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerId = socket.id;
    
    const initialGameState = {
      roomId,
      players: [{
        id: playerId,
        name: playerName || `Player_${playerId.substring(0, 4)}`,
        color: 'red',
        position: 0,
        tokens: [
          { position: 0, status: 'home' },
          { position: 0, status: 'home' },
          { position: 0, status: 'home' },
          { position: 0, status: 'home' }
        ],
        score: 0,
        isReady: false
      }],
      currentPlayerIndex: 0,
      diceValue: 0,
      gameStarted: false,
      gameStatus: 'waiting',
      createdAt: Date.now(),
      turnHistory: []
    };

    // Join socket room
    socket.join(roomId);
    activeGames.set(roomId, initialGameState);
    
    // Save to Firebase
    await saveGameToFirebase(roomId, initialGameState);

    socket.emit('room-created', {
      roomId,
      gameState: initialGameState,
      playerId,
      playerColor: 'red'
    });

    console.log(`🎮 Room created: ${roomId} by ${playerName}`);
  });

  // Join existing room
  socket.on('join-room', async ({ roomId, playerName }) => {
    const roomRef = db.ref(`games/${roomId}`);
    const snapshot = await roomRef.once('value');
    const gameState = snapshot.val();

    if (!gameState) {
      socket.emit('error', 'Room not found');
      return;
    }

    if (gameState.players.length >= 4) {
      socket.emit('error', 'Room is full (4/4 players)');
      return;
    }

    const playerId = socket.id;
    const colors = ['red', 'green', 'yellow', 'blue'];
    const playerColor = colors[gameState.players.length];

    const newPlayer = {
      id: playerId,
      name: playerName || `Player_${playerId.substring(0, 4)}`,
      color: playerColor,
      position: 0,
      tokens: [
        { position: 0, status: 'home' },
        { position: 0, status: 'home' },
        { position: 0, status: 'home' },
        { position: 0, status: 'home' }
      ],
      score: 0,
      isReady: false
    };

    gameState.players.push(newPlayer);
    gameState.gameStatus = gameState.players.length === 4 ? 'ready' : 'waiting';

    // Update in memory and Firebase
    activeGames.set(roomId, gameState);
    await saveGameToFirebase(roomId, gameState);

    // Join socket room
    socket.join(roomId);

    // Notify all players
    io.to(roomId).emit('player-joined', {
      player: newPlayer,
      gameState,
      message: `${playerName} joined the game!`
    });

    socket.emit('room-joined', {
      roomId,
      gameState,
      playerId,
      playerColor
    });

    console.log(`👤 ${playerName} joined room: ${roomId}`);
  });

  // Player ready status
  socket.on('player-ready', async ({ roomId, playerId }) => {
    const gameState = activeGames.get(roomId);
    if (!gameState) return;

    const player = gameState.players.find(p => p.id === playerId);
    if (player) {
      player.isReady = true;
      
      // Check if all players are ready
      const allReady = gameState.players.every(p => p.isReady);
      if (allReady && gameState.players.length >= 2) {
        gameState.gameStarted = true;
        gameState.gameStatus = 'playing';
        gameState.currentPlayerIndex = 0;
      }

      await saveGameToFirebase(roomId, gameState);
      io.to(roomId).emit('game-update', gameState);
    }
  });

  // Roll dice
  socket.on('roll-dice', async ({ roomId, playerId }) => {
    const gameState = activeGames.get(roomId);
    if (!gameState || !gameState.gameStarted) return;

    // Check if it's player's turn
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      socket.emit('error', 'Not your turn!');
      return;
    }

    // Roll dice (1-6)
    const diceValue = Math.floor(Math.random() * 6) + 1;
    gameState.diceValue = diceValue;

    // Add to history
    gameState.turnHistory.push({
      playerId,
      diceValue,
      timestamp: Date.now()
    });

    // Update game state
    await saveGameToFirebase(roomId, gameState);
    activeGames.set(roomId, gameState);

    // Emit to all players
    io.to(roomId).emit('dice-rolled', {
      playerId,
      diceValue,
      gameState
    });

    console.log(`🎲 ${playerId} rolled: ${diceValue}`);
  });

  // Move token
  socket.on('move-token', async ({ roomId, playerId, tokenIndex }) => {
    const gameState = activeGames.get(roomId);
    if (!gameState || !gameState.gameStarted) return;

    const player = gameState.players.find(p => p.id === playerId);
    if (!player || gameState.diceValue === 0) return;

    const token = player.tokens[tokenIndex];
    
    // Game logic for moving token
    if (token.status === 'home' && gameState.diceValue === 6) {
      token.status = 'board';
      token.position = 0; // Start position
    } else if (token.status === 'board') {
      token.position += gameState.diceValue;
      
      // Check if reached home
      if (token.position >= 57) { // Complete board path
        token.status = 'finished';
        player.score++;
        
        // Check if player won
        if (player.score === 4) {
          gameState.gameStatus = 'finished';
          gameState.winner = playerId;
        }
      }
    }

    // Next player's turn (if dice not 6)
    if (gameState.diceValue !== 6) {
      gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    }
    
    gameState.diceValue = 0;

    await saveGameToFirebase(roomId, gameState);
    activeGames.set(roomId, gameState);

    io.to(roomId).emit('token-moved', {
      playerId,
      tokenIndex,
      token,
      gameState
    });
  });

  // Send chat message
  socket.on('send-chat', async ({ roomId, playerId, message }) => {
    const gameState = activeGames.get(roomId);
    if (!gameState) return;

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const chatMessage = {
      playerId,
      playerName: player.name,
      playerColor: player.color,
      message,
      timestamp: Date.now()
    };

    // Save to Firebase
    await db.ref(`chats/${roomId}`).push(chatMessage);

    // Emit to room
    io.to(roomId).emit('new-chat', chatMessage);
  });

  // Get game state
  socket.on('get-game-state', async (roomId) => {
    const gameState = activeGames.get(roomId);
    if (gameState) {
      socket.emit('game-state', gameState);
    } else {
      // Try to load from Firebase
      const snapshot = await db.ref(`games/${roomId}`).once('value');
      const savedState = snapshot.val();
      if (savedState) {
        activeGames.set(roomId, savedState);
        socket.emit('game-state', savedState);
      }
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    console.log('🔴 User disconnected:', socket.id.substring(0, 6));

    // Find and update rooms where player was present
    for (const [roomId, gameState] of activeGames.entries()) {
      const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        // Remove player
        gameState.players.splice(playerIndex, 1);
        
        if (gameState.players.length === 0) {
          // Delete empty room
          activeGames.delete(roomId);
          await db.ref(`games/${roomId}`).remove();
          await db.ref(`rooms/${roomId}`).remove();
          console.log(`🗑️ Room deleted: ${roomId}`);
        } else {
          // Update game state
          gameState.gameStatus = gameState.players.length < 2 ? 'waiting' : gameState.gameStatus;
          await saveGameToFirebase(roomId, gameState);
          
          // Notify remaining players
          io.to(roomId).emit('player-left', {
            playerId: socket.id,
            gameState,
            message: 'A player left the game'
          });
        }
        break;
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeGames: activeGames.size,
    timestamp: Date.now()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔥 Firebase connected: ${firebaseConfig.projectId}`);
});
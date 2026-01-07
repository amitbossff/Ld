// Socket.io connection
const socket = io();
const API_URL = window.location.origin;

// Game state variables
let currentRoom = null;
let playerId = null;
let playerName = "Player";
let playerColor = "red";
let gameState = null;
let isMyTurn = false;
let diceValue = 0;

// DOM Elements
const elements = {
    roomStatus: document.getElementById('roomStatus'),
    playerCount: document.getElementById('playerCount'),
    playersCount: document.getElementById('playersCount'),
    currentRoomId: document.getElementById('currentRoomId'),
    gameStatusText: document.getElementById('gameStatusText'),
    rollDiceBtn: document.getElementById('rollDiceBtn'),
    readyBtn: document.getElementById('readyBtn'),
    chatInput: document.getElementById('chatInput'),
    connectionStatus: document.getElementById('connectionStatus'),
    myPlayerId: document.getElementById('myPlayerId'),
    diceElement: document.getElementById('diceElement'),
    diceFace: document.getElementById('diceFace'),
    diceValueText: document.getElementById('diceValueText'),
    turnIndicator: document.getElementById('turnIndicator'),
    playersList: document.getElementById('playersList'),
    chatMessages: document.getElementById('chatMessages'),
    roomInfo: document.getElementById('roomInfo'),
    winnerModal: document.getElementById('winnerModal'),
    winnerMessage: document.getElementById('winnerMessage')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    playerName = document.getElementById('playerName').value || "Player";
    setupEventListeners();
    connectToServer();
    drawLudoBoard();
});

// Socket.io event handlers
function connectToServer() {
    socket.on('connect', () => {
        playerId = socket.id;
        elements.connectionStatus.textContent = 'Connected';
        elements.connectionStatus.style.color = '#4cc9f0';
        elements.myPlayerId.textContent = playerId.substring(0, 8);
        console.log('✅ Connected to server:', playerId);
    });

    socket.on('disconnect', () => {
        elements.connectionStatus.textContent = 'Disconnected';
        elements.connectionStatus.style.color = '#f72585';
        console.log('❌ Disconnected from server');
    });

    socket.on('room-created', (data) => {
        currentRoom = data.roomId;
        playerColor = data.playerColor;
        gameState = data.gameState;
        
        updateUI();
        updatePlayersList();
        addSystemMessage(`Room created! Share this ID: ${currentRoom}`);
        elements.roomInfo.classList.remove('hidden');
    });

    socket.on('room-joined', (data) => {
        currentRoom = data.roomId;
        playerColor = data.playerColor;
        gameState = data.gameState;
        
        updateUI();
        updatePlayersList();
        addSystemMessage(`Joined room: ${currentRoom}`);
        elements.roomInfo.classList.remove('hidden');
    });

    socket.on('player-joined', (data) => {
        gameState = data.gameState;
        updateUI();
        updatePlayersList();
        addSystemMessage(`${data.player.name} joined the game!`);
    });

    socket.on('player-left', (data) => {
        gameState = data.gameState;
        updateUI();
        updatePlayersList();
        addSystemMessage(data.message);
    });

    socket.on('game-update', (newGameState) => {
        gameState = newGameState;
        updateUI();
        updatePlayersList();
        
        if (gameState.gameStarted) {
            addSystemMessage('Game started!');
            updateTurnIndicator();
        }
    });

    socket.on('dice-rolled', (data) => {
        diceValue = data.diceValue;
        gameState = data.gameState;
        
        // Animate dice
        animateDiceRoll(data.diceValue);
        
        // Update turn
        updateTurnIndicator();
        updateBoard();
        
        addSystemMessage(`${getPlayerName(data.playerId)} rolled ${data.diceValue}`);
    });

    socket.on('token-moved', (data) => {
        gameState = data.gameState;
        updateBoard();
        updateTurnIndicator();
        
        addSystemMessage(`${getPlayerName(data.playerId)} moved token`);
        
        // Check for winner
        if (gameState.gameStatus === 'finished') {
            showWinner(gameState.winner);
        }
    });

    socket.on('new-chat', (message) => {
        addChatMessage(message);
    });

    socket.on('error', (message) => {
        alert('Error: ' + message);
        console.error('Server error:', message);
    });
}

// UI Functions
function updateUI() {
    if (!gameState) return;
    
    elements.playerCount.textContent = gameState.players.length;
    elements.playersCount.textContent = gameState.players.length;
    elements.currentRoomId.textContent = currentRoom;
    
    // Update room status
    elements.roomStatus.textContent = `In Room: ${currentRoom}`;
    elements.gameStatusText.textContent = gameState.gameStatus;
    
    // Update game controls
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    isMyTurn = currentPlayer && currentPlayer.id === playerId;
    
    elements.rollDiceBtn.disabled = !gameState.gameStarted || !isMyTurn;
    elements.readyBtn.disabled = gameState.gameStarted;
    elements.chatInput.disabled = !currentRoom;
    
    // Update ready button text
    const player = gameState.players.find(p => p.id === playerId);
    if (player && player.isReady) {
        elements.readyBtn.innerHTML = '<i class="fas fa-check-circle"></i> Ready ✓';
        elements.readyBtn.classList.add('success');
    } else {
        elements.readyBtn.innerHTML = '<i class="fas fa-check-circle"></i> Ready';
        elements.readyBtn.classList.remove('success');
    }
    
    // Update turn indicator
    updateTurnIndicator();
}

function updateTurnIndicator() {
    if (!gameState || !gameState.gameStarted) {
        elements.turnIndicator.textContent = 'Waiting for players...';
        return;
    }
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer) {
        if (currentPlayer.id === playerId) {
            elements.turnIndicator.textContent = '🎮 Your Turn!';
            elements.turnIndicator.style.color = '#4cc9f0';
        } else {
            elements.turnIndicator.textContent = `${currentPlayer.name}'s Turn`;
            elements.turnIndicator.style.color = '#f72585';
        }
    }
}

function updatePlayersList() {
    if (!gameState) return;
    
    elements.playersList.innerHTML = '';
    
    gameState.players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = `player-item ${player.id === playerId ? 'you' : ''}`;
        playerElement.style.borderLeftColor = player.color;
        
        playerElement.innerHTML = `
            <div class="player-color ${player.color}"></div>
            <div>
                <strong>${player.name}</strong>
                ${player.id === playerId ? ' (You)' : ''}
                <br>
                <small>Score: ${player.score} | ${player.isReady ? 'Ready ✓' : 'Not ready'}</small>
            </div>
        `;
        
        elements.playersList.appendChild(playerElement);
    });
    
    // Add waiting slots if less than 4 players
    for (let i = gameState.players.length; i < 4; i++) {
        const waitingElement = document.createElement('div');
        waitingElement.className = 'player-item waiting';
        waitingElement.innerHTML = `
            <div class="player-color"></div>
            <span>Waiting for player...</span>
        `;
        elements.playersList.appendChild(waitingElement);
    }
}

// Game Actions
function createRoom() {
    playerName = document.getElementById('playerName').value || "Player";
    socket.emit('create-room', playerName);
}

function joinRoom() {
    const roomId = document.getElementById('joinRoomId').value.trim();
    playerName = document.getElementById('playerName').value || "Player";
    
    if (!roomId) {
        alert('Please enter Room ID');
        return;
    }
    
    socket.emit('join-room', { roomId, playerName });
}

function rollDice() {
    if (!currentRoom || !isMyTurn) return;
    
    socket.emit('roll-dice', { roomId: currentRoom, playerId });
    elements.rollDiceBtn.disabled = true;
}

function moveToken(tokenIndex) {
    if (!currentRoom || diceValue === 0) return;
    
    socket.emit('move-token', { 
        roomId: currentRoom, 
        playerId, 
        tokenIndex 
    });
    
    diceValue = 0;
    elements.diceValueText.textContent = 'Click Roll Dice';
}

function toggleReady() {
    if (!currentRoom) return;
    
    socket.emit('player-ready', { roomId: currentRoom, playerId });
}

function sendChatMessage() {
    const input = elements.chatInput;
    const message = input.value.trim();
    
    if (message && currentRoom) {
        socket.emit('send-chat', { 
            roomId: currentRoom, 
            playerId, 
            message 
        });
        input.value = '';
    }
}

function leaveRoom() {
    if (currentRoom) {
        socket.emit('leave-room', currentRoom);
        currentRoom = null;
        gameState = null;
        resetGame();
    }
}

// Helper Functions
function getPlayerName(playerId) {
    if (!gameState) return 'Player';
    const player = gameState.players.find(p => p.id === playerId);
    return player ? player.name : 'Player';
}

function animateDiceRoll(value) {
    elements.diceElement.classList.add('dice-rolling');
    
    setTimeout(() => {
        elements.diceElement.classList.remove('dice-rolling');
        
        // Dice face emojis
        const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        elements.diceFace.textContent = diceFaces[value - 1];
        elements.diceValueText.textContent = `You rolled: ${value}`;
        
        // Update token buttons
        updateTokenButtons();
    }, 500);
}

function updateTokenButtons() {
    if (!gameState) return;
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    // Update token buttons based on game rules
    const tokenButtons = document.querySelectorAll('.token-btn');
    tokenButtons.forEach((btn, index) => {
        const token = player.tokens[index];
        
        if (token.status === 'home' && diceValue === 6) {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.title = 'Move out of home';
        } else if (token.status === 'board') {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.title = `Move ${diceValue} steps`;
        } else {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.title = 'Cannot move this token';
        }
    });
}

// Chat Functions
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.textContent = text;
    elements.chatMessages.appendChild(messageDiv);
    scrollChatToBottom();
}

function addChatMessage(chatData) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${chatData.playerId === playerId ? 'you' : 'other'}`;
    
    messageDiv.innerHTML = `
        <strong style="color: ${chatData.playerColor || '#fff'}">
            ${chatData.playerName}:
        </strong>
        <span>${chatData.message}</span>
        <br>
        <small>${formatTime(chatData.timestamp)}</small>
    `;
    
    elements.chatMessages.appendChild(messageDiv);
    scrollChatToBottom();
}

function scrollChatToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Board Drawing
function drawLudoBoard() {
    const canvas = document.getElementById('ludoBoard');
    const ctx = canvas.getContext('2d');
    const size = 500;
    const cellSize = size / 15;
    
    // Clear canvas
    ctx.clearRect(0, 0, size, size);
    
    // Draw board background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    // Draw grid lines
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 15; i++) {
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, size);
        ctx.stroke();
        
        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(size, i * cellSize);
        ctx.stroke();
    }
    
    // Draw colored homes
    drawHome(ctx, 1, 1, cellSize, '#ff595e'); // Red
    drawHome(ctx, 10, 1, cellSize, '#4cc9f0'); // Green
    drawHome(ctx, 1, 10, cellSize, '#ffca3a'); // Yellow
    drawHome(ctx, 10, 10, cellSize, '#8ac926'); // Blue
    
    // Draw center
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(6 * cellSize, 6 * cellSize, 3 * cellSize, 3 * cellSize);
    
    // Draw paths
    drawPaths(ctx, cellSize);
    
    // Draw tokens if game state exists
    if (gameState) {
        updateBoard();
    }
}

function drawHome(ctx, x, y, size, color) {
    ctx.fillStyle = color + '40'; // Add transparency
    ctx.fillRect(x * size, y * size, 4 * size, 4 * size);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x * size, y * size, 4 * size, 4 * size);
    
    // Draw star in center
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((x + 2) * size, (y + 2) * size, size / 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawPaths(ctx, cellSize) {
    const pathColor = '#333';
    ctx.strokeStyle = pathColor;
    ctx.lineWidth = 2;
    
    // Draw outer path
    ctx.strokeRect(5 * cellSize, 0, 5 * cellSize, 15 * cellSize);
    ctx.strokeRect(0, 5 * cellSize, 15 * cellSize, 5 * cellSize);
    
    // Draw safe zones
    const safeZones = [
        [6, 1], [8, 1], [1, 6], [1, 8], // Red
        [13, 6], [13, 8], [6, 13], [8, 13], // Green
        [6, 1], [8, 1], [1, 6], [1, 8], // Yellow (reusing positions)
        [13, 6], [13, 8], [6, 13], [8, 13]  // Blue (reusing positions)
    ];
    
    ctx.fillStyle = '#000';
    safeZones.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x * cellSize, y * cellSize, cellSize / 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

function updateBoard() {
    if (!gameState) return;
    
    const canvas = document.getElementById('ludoBoard');
    const ctx = canvas.getContext('2d');
    const size = 500;
    const cellSize = size / 15;
    
    // Clear tokens
    drawLudoBoard();
    
    // Draw tokens
    gameState.players.forEach(player => {
        player.tokens.forEach((token, index) => {
            if (token.status === 'board' || token.status === 'finished') {
                drawToken(ctx, player, token, index, cellSize);
            } else if (token.status === 'home') {
                drawHomeToken(ctx, player, index, cellSize);
            }
        });
    });
}

function drawToken(ctx, player, token, tokenIndex, cellSize) {
    // Calculate position based on token position
    let x, y;
    
    // This is simplified - you'll need proper path calculation
    const positions = {
        red: [[7, 2], [8, 2], [7, 3], [8, 3]],
        green: [[12, 7], [13, 7], [12, 8], [13, 8]],
        yellow: [[2, 12], [3, 12], [2, 13], [3, 13]],
        blue: [[7, 12], [8, 12], [7, 13], [8, 13]]
    };
    
    const colorPositions = positions[player.color] || positions.red;
    const pos = colorPositions[tokenIndex % 4];
    
    x = pos[0] * cellSize;
    y = pos[1] * cellSize;
    
    // Draw token
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(x, y, cellSize * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Add border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Token number
    ctx.fillStyle = '#fff';
    ctx.font = `${cellSize * 0.3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tokenIndex + 1, x, y);
}

function drawHomeToken(ctx, player, tokenIndex, cellSize) {
    const homePositions = {
        red: [[2, 2], [3, 2], [2, 3], [3, 3]],
        green: [[11, 2], [12, 2], [11, 3], [12, 3]],
        yellow: [[2, 11], [3, 11], [2, 12], [3, 12]],
        blue: [[11, 11], [12, 11], [11, 12], [12, 12]]
    };
    
    const positions = homePositions[player.color] || homePositions.red;
    const pos = positions[tokenIndex % 4];
    
    const x = pos[0] * cellSize;
    const y = pos[1] * cellSize;
    
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(x, y, cellSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
}

// Utility Functions
function copyRoomId() {
    if (currentRoom) {
        navigator.clipboard.writeText(currentRoom)
            .then(() => {
                alert('Room ID copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
            });
    }
}

function showWinner(winnerId) {
    const winner = gameState.players.find(p => p.id === winnerId);
    elements.winnerMessage.textContent = `${winner.name} wins the game! 🎉`;
    elements.winnerModal.classList.remove('hidden');
}

function closeModal() {
    elements.winnerModal.classList.add('hidden');
}

function resetGame() {
    elements.roomInfo.classList.add('hidden');
    elements.roomStatus.textContent = 'Not in a room';
    elements.playerCount.textContent = '0';
    elements.playersCount.textContent = '0';
    elements.gameStatusText.textContent = 'Waiting...';
    elements.turnIndicator.textContent = 'Waiting for players...';
    elements.rollDiceBtn.disabled = true;
    elements.readyBtn.disabled = false;
    elements.chatInput.disabled = true;
    
    // Reset board
    drawLudoBoard();
    
    addSystemMessage('Left the room');
}

function setupEventListeners() {
    // Enter key in chat
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Enter key in player name
    document.getElementById('playerName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createRoom();
        }
    });
    
    // Enter key in room ID
    document.getElementById('joinRoomId').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinRoom();
        }
    });
    
    // Dice click
    elements.diceElement.addEventListener('click', () => {
        if (elements.rollDiceBtn.disabled === false) {
            rollDice();
        }
    });
}
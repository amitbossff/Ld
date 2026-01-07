import { db, ref, set, update, onValue } from "./firebase.js";

/* ================== VARIABLES ================== */
let roomCode = "";
let myPlayer = -1;

// 52-step Ludo path (13x13 grid index)
const PATH = [
  6,7,8,9,10,23,36,49,62,75,88,101,114,
  115,116,117,118,119,106,93,80,67,54,41,28,
  15,14,13,12,11,24,37,50,63,76,89,102,
  103,104,105,120,121,122,109,96,83,70,57,44,31,18
];

// Safe cells (no kill)
const SAFE = [0,8,13,21,26,34,39,47];

// Game state
let state = {
  turn: 0,
  dice: 0,
  players: 0,
  tokens: {
    0: [-1, -1, -1, -1],
    1: [-1, -1, -1, -1],
    2: [-1, -1, -1, -1],
    3: [-1, -1, -1, -1]
  }
};

/* ================== BOARD CREATE ================== */
const board = document.getElementById("board");
for (let i = 0; i < 169; i++) {
  const cell = document.createElement("div");
  cell.className = "cell";
  board.appendChild(cell);
}

/* ================== CREATE ROOM ================== */
window.createRoom = function () {
  roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
  myPlayer = 0;

  document.getElementById("roomCodeText").innerText =
    "Room Code: " + roomCode;

  document.getElementById("game").style.display = "block";

  state.players = 1;
  state.turn = 0;
  state.dice = 0;

  set(ref(db, "rooms/" + roomCode), state);
  listenRoom();
};

/* ================== JOIN ROOM ================== */
window.joinRoom = function () {
  roomCode = document.getElementById("roomInput").value;
  if (!roomCode) return alert("Enter Room Code");

  const roomRef = ref(db, "rooms/" + roomCode);

  onValue(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        alert("Room not found");
        return;
      }

      const data = snap.val();
      if (data.players >= 4) {
        alert("Room Full");
        return;
      }

      myPlayer = data.players;

      update(roomRef, {
        players: data.players + 1
      });

      document.getElementById("game").style.display = "block";
      document.getElementById("roomCodeText").innerText =
        "Joined Room: " + roomCode;

      listenRoom();
    },
    { once: true }
  );
};

/* ================== LISTEN ROOM ================== */
function listenRoom() {
  onValue(ref(db, "rooms/" + roomCode), (snap) => {
    if (!snap.val()) return;
    state = snap.val();
    render();
  });
}

/* ================== ROLL DICE ================== */
window.rollDice = function () {
  if (state.turn !== myPlayer) {
    alert("Not your turn");
    return;
  }

  const d = Math.floor(Math.random() * 6) + 1;
  state.dice = d;

  update(ref(db, "rooms/" + roomCode), state);
};

/* ================== MOVE TOKEN ================== */
function moveToken(player, index) {
  if (state.turn !== myPlayer) return;
  if (state.dice === 0) return;

  let pos = state.tokens[player][index];

  // Open token
  if (pos === -1) {
    if (state.dice !== 6) return;
    state.tokens[player][index] = 0;
  } else {
    let next = pos + state.dice;
    if (next >= PATH.length) return;
    state.tokens[player][index] = next;
    checkKill(player, next);
  }

  // Turn handling
  if (state.dice !== 6) {
    state.turn = (state.turn + 1) % 4;
  }

  state.dice = 0;
  update(ref(db, "rooms/" + roomCode), state);
}

/* ================== KILL LOGIC ================== */
function checkKill(player, pos) {
  if (SAFE.includes(pos)) return;

  Object.keys(state.tokens).forEach((p) => {
    if (+p === player) return;
    state.tokens[p].forEach((tp, i) => {
      if (tp === pos) {
        state.tokens[p][i] = -1; // back to home
      }
    });
  });
}

/* ================== RENDER ================== */
function render() {
  document.getElementById("dice").innerText =
    "Dice: " + state.dice;

  document.getElementById("turn").innerText =
    "Turn: Player " + state.turn;

  document.querySelectorAll(".cell").forEach((c) => (c.innerHTML = ""));

  Object.keys(state.tokens).forEach((p) => {
    state.tokens[p].forEach((pos, idx) => {
      if (pos >= 0) {
        const cell = document.querySelectorAll(".cell")[PATH[pos]];
        const token = document.createElement("div");
        token.className =
          "token " + ["red", "green", "yellow", "blue"][p];
        token.onclick = () => moveToken(+p, idx);
        cell.appendChild(token);
      }
    });
  });
}

import { db, ref, set, update, onValue } from "./firebase.js";

let roomCode = "";
let myPlayer = -1;

/* ===== PATH POSITIONS (same as before) ===== */
const PATH_POS = [
  {x:150,y:15},{x:175,y:15},{x:200,y:15},{x:225,y:15},{x:250,y:15},
  {x:250,y:40},{x:250,y:65},{x:250,y:90},{x:250,y:115},{x:250,y:140},
  {x:250,y:165},{x:250,y:190},{x:250,y:215},

  {x:225,y:215},{x:200,y:215},{x:175,y:215},{x:150,y:215},{x:125,y:215},
  {x:125,y:190},{x:125,y:165},{x:125,y:140},{x:125,y:115},{x:125,y:90},{x:125,y:65},

  {x:125,y:40},{x:100,y:40},{x:75,y:40},{x:50,y:40},{x:25,y:40},
  {x:25,y:65},{x:25,y:90},{x:25,y:115},{x:25,y:140},{x:25,y:165},{x:25,y:190},

  {x:50,y:190},{x:75,y:190},{x:100,y:190},{x:100,y:165},{x:100,y:140},
  {x:100,y:115},{x:100,y:90},{x:100,y:65},{x:100,y:40}
];

/* ===== SAFE CELLS ===== */
const SAFE = [0,8,13,21,26,34,39,47];

/* ===== START INDEX (FIX 🔥) ===== */
const START_INDEX = {
  0: 0,    // Red
  1: 13,   // Green
  2: 26,   // Yellow
  3: 39    // Blue
};

/* ===== GAME STATE ===== */
let state = {
  turn: 0,
  dice: 0,
  players: 0,
  tokens: {
    0: [-1,-1,-1,-1],
    1: [-1,-1,-1,-1],
    2: [-1,-1,-1,-1],
    3: [-1,-1,-1,-1]
  }
};

/* ===== CREATE ROOM ===== */
window.createRoom = () => {
  roomCode = Math.random().toString(36).substring(2,7).toUpperCase();
  myPlayer = 0;

  document.getElementById("roomCodeText").innerText =
    "Room Code: " + roomCode;

  document.getElementById("game").style.display = "block";

  state.players = 1;
  set(ref(db,"rooms/"+roomCode), state);
  listenRoom();
};

/* ===== JOIN ROOM ===== */
window.joinRoom = () => {
  roomCode = document.getElementById("roomInput").value;
  if(!roomCode) return alert("Enter Room Code");

  const roomRef = ref(db,"rooms/"+roomCode);
  onValue(roomRef, snap=>{
    if(!snap.exists()) return alert("Room not found");
    const d = snap.val();
    if(d.players >= 4) return alert("Room Full");

    myPlayer = d.players;
    update(roomRef,{players:d.players+1});

    document.getElementById("game").style.display = "block";
    document.getElementById("roomCodeText").innerText =
      "Joined: " + roomCode;

    listenRoom();
  },{once:true});
};

/* ===== LISTEN ROOM ===== */
function listenRoom(){
  onValue(ref(db,"rooms/"+roomCode),snap=>{
    if(!snap.val()) return;
    state = snap.val();
    render();
  });
}

/* ===== ROLL DICE ===== */
window.rollDice = () => {
  if(state.turn !== myPlayer) return alert("Wait your turn");
  state.dice = Math.floor(Math.random()*6)+1;
  update(ref(db,"rooms/"+roomCode),state);
};

/* ===== MOVE TOKEN (FIXED) ===== */
async function moveToken(p,i){
  if(state.turn !== myPlayer || state.dice === 0) return;

  let pos = state.tokens[p][i];

  // OPEN TOKEN
  if(pos === -1){
    if(state.dice !== 6) return;
    state.tokens[p][i] = START_INDEX[p];
    render();
  } else {
    for(let s=0; s<state.dice; s++){
      await sleep(180);
      state.tokens[p][i] = (state.tokens[p][i] + 1) % PATH_POS.length;
      render();
    }
    checkKill(p, state.tokens[p][i]);
  }

  if(state.dice !== 6){
    state.turn = (state.turn + 1) % 4;
  }

  state.dice = 0;
  update(ref(db,"rooms/"+roomCode),state);
}

/* ===== KILL ===== */
function checkKill(player,pos){
  if(SAFE.includes(pos)) return;
  Object.keys(state.tokens).forEach(p=>{
    if(+p === player) return;
    state.tokens[p].forEach((tp,i)=>{
      if(tp === pos){
        state.tokens[p][i] = -1;
      }
    });
  });
}

/* ===== RENDER ===== */
function render(){
  document.getElementById("dice").innerText = "Dice: " + state.dice;
  document.getElementById("turn").innerText = "Turn: Player " + state.turn;

  document.querySelectorAll(".token").forEach(t=>t.remove());

  Object.keys(state.tokens).forEach(p=>{
    state.tokens[p].forEach((pos,i)=>{
      if(pos >= 0){
        const t = document.createElement("div");
        t.className = "token " + ["red","green","yellow","blue"][p];
        t.style.left = PATH_POS[pos].x + "px";
        t.style.top  = PATH_POS[pos].y + "px";
        t.onclick = () => moveToken(+p,i);
        document.getElementById("board").appendChild(t);
      }
    });
  });
}

/* ===== UTIL ===== */
const sleep = ms => new Promise(r=>setTimeout(r,ms));
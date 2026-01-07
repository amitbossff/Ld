import { db, ref, set, update, onValue } from "./firebase.js";

let roomCode="";
let myPlayer=Math.floor(Math.random()*4);

// REAL PATH (52 steps)
const PATH=[
6,7,8,9,10,23,36,49,62,75,88,101,114,
115,116,117,118,119,106,93,80,67,54,41,28,
15,14,13,12,11,24,37,50,63,76,89,102,
103,104,105,120,121,122,109,96,83,70,57,44,31,18
];

// Safe cells ⭐
const SAFE=[0,8,13,21,26,34,39,47];

// Game state
let state={
  turn:0,
  dice:0,
  tokens:{
    0:[-1,-1,-1,-1],
    1:[-1,-1,-1,-1],
    2:[-1,-1,-1,-1],
    3:[-1,-1,-1,-1]
  }
};

// Build board
const board=document.getElementById("board");
for(let i=0;i<169;i++){
  let d=document.createElement("div");
  d.className="cell";
  board.appendChild(d);
}

window.joinRoom=function(){
  roomCode=document.getElementById("room").value;
  if(!roomCode) return alert("Enter room code");
  document.getElementById("game").style.display="block";

  const roomRef=ref(db,"rooms/"+roomCode);
  set(roomRef,state);

  onValue(roomRef,(snap)=>{
    if(!snap.val()) return;
    state=snap.val();
    render();
  });
}

window.rollDice=function(){
  if(state.turn!==myPlayer) return alert("Wait your turn");

  let d=Math.floor(Math.random()*6)+1;
  document.getElementById("dice").classList.add("dice-anim");
  setTimeout(()=>document.getElementById("dice").classList.remove("dice-anim"),400);

  state.dice=d;
  update(ref(db,"rooms/"+roomCode),state);
}

function moveToken(p,idx){
  if(state.turn!==myPlayer || state.dice===0) return;

  let pos=state.tokens[p][idx];

  if(pos===-1){
    if(state.dice!==6) return;
    state.tokens[p][idx]=0;
  }else{
    let next=pos+state.dice;
    if(next<PATH.length){
      state.tokens[p][idx]=next;
      checkKill(p,next);
    }
  }

  if(state.dice!==6){
    state.turn=(state.turn+1)%4;
  }

  state.dice=0;
  update(ref(db,"rooms/"+roomCode),state);
}

function checkKill(player,pos){
  if(SAFE.includes(pos)) return;
  Object.keys(state.tokens).forEach(p=>{
    if(+p===player) return;
    state.tokens[p].forEach((tp,i)=>{
      if(tp===pos){
        state.tokens[p][i]=-1;
      }
    });
  });
}

function render(){
  document.getElementById("dice").innerText="Dice: "+state.dice;
  document.getElementById("turn").innerText="Turn: Player "+state.turn;

  document.querySelectorAll(".cell").forEach(c=>c.innerHTML="");

  Object.keys(state.tokens).forEach(p=>{
    state.tokens[p].forEach((pos,idx)=>{
      if(pos>=0){
        let cell=document.querySelectorAll(".cell")[PATH[pos]];
        let t=document.createElement("div");
        t.className="token "+["red","green","yellow","blue"][p];
        t.onclick=()=>moveToken(+p,idx);
        cell.appendChild(t);
      }
    });
  });
}
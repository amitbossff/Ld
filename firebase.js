import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

export { db, ref, set, update, onValue };

const firebaseConfig = {
  apiKey: "AIzaSyAA1DAEu6KmaLTHw1EuUPJko58AOsITz0k",
  authDomain: "amit-a7b1f.firebaseapp.com",
  databaseURL: "https://amit-a7b1f-default-rtdb.firebaseio.com",
  projectId: "amit-a7b1f",
  storageBucket: "amit-a7b1f.firebasestorage.app",
  messagingSenderId: "875229760738",
  appId: "1:875229760738:web:3981228866e3e8fe00e2bb"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
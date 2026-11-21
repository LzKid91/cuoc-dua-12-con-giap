import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAnEM_f1OcJ4LcBJC7d_ly6G6M_F5Ime1c",
  authDomain: "board-game-aa1dd.firebaseapp.com",
  databaseURL: "https://board-game-aa1dd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "board-game-aa1dd",
  storageBucket: "board-game-aa1dd.firebasestorage.app",
  messagingSenderId: "403489793349",
  appId: "1:403489793349:web:29fee494bfdc29f41fca2c",
  measurementId: "G-SYV6JD3N7L"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

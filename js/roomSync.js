import { db } from './firebaseConfig.js';
import {
  ref, set, get, update, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { ZODIACS } from './mapData.js';

const PAWN_COLORS = [
  '#D32F2F', '#1976D2', '#388E3C', '#7B1FA2',
  '#F57C00', '#0097A7', '#C2185B', '#5D4037',
  '#303F9F', '#AFB42B', '#E64A19', '#455A64'
];

export function getLocalPlayerId() {
  let id = localStorage.getItem('zodiac_player_id');
  if (!id) {
    id = 'P_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('zodiac_player_id', id);
  }
  return id;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createRoom(playerName) {
  const roomCode = generateRoomCode();
  const playerId = getLocalPlayerId();
  const zodiacIndex = Math.floor(Math.random() * ZODIACS.length);

  const initialPublic = {
    hostId: playerId,
    status: 'lobby',
    clockHour: 3,
    players: {
      [playerId]: {
        id: playerId,
        name: playerName || 'Người chơi 1',
        zodiac: ZODIACS[zodiacIndex],
        color: PAWN_COLORS[0],
        hexId: 'XUAN:2,-4',
        hp: 3,
        order: 1
      }
    }
  };

  await set(ref(db, `rooms/${roomCode}/public`), initialPublic);
  await set(ref(db, `rooms/${roomCode}/private/${playerId}`), {
    hiddenChoice: 'A',
    hand: []
  });

  return { roomCode, playerId };
}

export async function joinRoom(roomCode, playerName) {
  const code = roomCode.trim().toUpperCase();
  if (code.length !== 4) throw new Error('Mã phòng phải gồm đúng 4 ký tự!');

  const snap = await get(ref(db, `rooms/${code}/public`));
  if (!snap.exists()) throw new Error('Không tìm thấy mã phòng này!');

  const pub = snap.val();
  const playerId = getLocalPlayerId();
  const players = pub.players || {};

  if (!players[playerId]) {
    const usedZodiacs = new Set(Object.values(players).map(p => p.zodiac));
    const available = ZODIACS.filter(z => !usedZodiacs.has(z));
    if (available.length === 0) throw new Error('Phòng đã đủ 12 Con Giáp!');

    const chosenZodiac = available[Math.floor(Math.random() * available.length)];
    const count = Object.keys(players).length;
    const startHexes = ['XUAN:0,-4', 'XUAN:1,-4', 'XUAN:2,-4', 'XUAN:3,-4', 'XUAN:4,-4'];

    await set(ref(db, `rooms/${code}/public/players/${playerId}`), {
      id: playerId,
      name: playerName || `Người chơi ${count + 1}`,
      zodiac: chosenZodiac,
      color: PAWN_COLORS[count % PAWN_COLORS.length],
      hexId: startHexes[count % startHexes.length],
      hp: 3,
      order: count + 1
    });

    await set(ref(db, `rooms/${code}/private/${playerId}`), {
      hiddenChoice: 'A',
      hand: []
    });
  }

  return { roomCode: code, playerId };
}

export function subscribeRoom(roomCode, onPublicChange) {
  const pubRef = ref(db, `rooms/${roomCode}/public`);
  return onValue(pubRef, (snap) => {
    if (snap.exists()) onPublicChange(snap.val());
  });
}

export function syncMovePawn(roomCode, playerId, newHexId) {
  return update(ref(db, `rooms/${roomCode}/public/players/${playerId}`), {
    hexId: newHexId
  });
}

export function syncClockHour(roomCode, newHour) {
  return update(ref(db, `rooms/${roomCode}/public`), {
    clockHour: newHour
  });
}

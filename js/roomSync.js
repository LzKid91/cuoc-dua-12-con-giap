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

export function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : Object.values(val);
}

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

function makePlayerObj(id, name, zodiac, color, isBot = false) {
  return {
    id,
    name,
    zodiac,
    color,
    isBot,
    hexId: null,
    hp: 3,
    cooldownTD: 0,
    cooldownHidden: 0,
    hiddenUses: 0,
    hiddenRevealed: false,
    revealedVariant: null,
    savedSkill: null,
    handCount: 0,
    claimedStations: [],
    pendingSelf: [],
    gateProgress: 0,
    statusFlags: {}
  };
}

export async function createRoom(playerName) {
  const roomCode = generateRoomCode();
  const playerId = getLocalPlayerId();
  const zodiac = ZODIACS[Math.floor(Math.random() * ZODIACS.length)];

  const initialPublic = {
    hostId: playerId,
    status: 'lobby', // lobby | draft | playing | finished
    clockHour: 3,
    round: 1,
    direction: 1, // 1: thuận, -1: ngược
    reverseUntilPlayerId: null,
    reverseRoundsLeft: 0,
    blizzardRoundsLeft: 0,
    roundEventTriggered: false,
    turnsInRound: 0,
    lastThienZodiac: null,
    turnOrder: [],
    currentTurnIdx: 0,
    draftOrder: [],
    draftIdx: 0,
    supportDeck: [],
    supportDiscard: [],
    eventDeck: [],
    traps: [],
    lastEvent: null,
    winnerId: null,
    turn: null,
    combat: null,
    callout: null,
    logs: ['Phòng đã được tạo. Chọn biến thể Ẩn A/B rồi bấm Bắt đầu ván đấu!'],
    players: {
      [playerId]: makePlayerObj(playerId, playerName || 'Chủ phòng', zodiac, PAWN_COLORS[0], false)
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
    if (pub.status !== 'lobby') throw new Error('Ván đấu đã bắt đầu, không thể vào thêm!');
    const usedZodiacs = new Set(Object.values(players).map(p => p.zodiac));
    const available = ZODIACS.filter(z => !usedZodiacs.has(z));
    if (available.length === 0) throw new Error('Phòng đã đủ 12 Con Giáp!');

    const chosenZodiac = available[Math.floor(Math.random() * available.length)];
    const count = Object.keys(players).length;
    const pObj = makePlayerObj(playerId, playerName || `Người chơi ${count + 1}`, chosenZodiac, PAWN_COLORS[count % PAWN_COLORS.length], false);

    await set(ref(db, `rooms/${code}/public/players/${playerId}`), pObj);
    await set(ref(db, `rooms/${code}/private/${playerId}`), {
      hiddenChoice: 'A',
      hand: []
    });
  }

  return { roomCode: code, playerId };
}

export async function addBotToRoom(roomCode) {
  const snap = await get(ref(db, `rooms/${roomCode}/public`));
  if (!snap.exists()) return;
  const pub = snap.val();
  if (pub.status !== 'lobby') return;

  const players = pub.players || {};
  const usedZodiacs = new Set(Object.values(players).map(p => p.zodiac));
  const available = ZODIACS.filter(z => !usedZodiacs.has(z));
  if (available.length === 0) throw new Error('Đã đủ 12 Con Giáp!');

  const chosenZodiac = available[Math.floor(Math.random() * available.length)];
  const count = Object.keys(players).length;
  const botId = 'BOT_' + Math.random().toString(36).substring(2, 7);
  const botObj = makePlayerObj(botId, `Bot ${chosenZodiac}`, chosenZodiac, PAWN_COLORS[count % PAWN_COLORS.length], true);

  await set(ref(db, `rooms/${roomCode}/public/players/${botId}`), botObj);
  await set(ref(db, `rooms/${roomCode}/private/${botId}`), {
    hiddenChoice: Math.random() < 0.5 ? 'A' : 'B',
    hand: []
  });
}

export function normalizePublicState(state) {
  if (!state) return null;
  state.turnOrder = toArray(state.turnOrder);
  state.draftOrder = toArray(state.draftOrder);
  state.supportDeck = toArray(state.supportDeck);
  state.supportDiscard = toArray(state.supportDiscard);
  state.eventDeck = toArray(state.eventDeck);
  state.traps = toArray(state.traps);
  state.logs = toArray(state.logs);
  if (state.turn) {
    state.turn.dice = toArray(state.turn.dice);
    state.turn.clockIndices = toArray(state.turn.clockIndices);
    state.turn.combatTargets = toArray(state.turn.combatTargets);
    state.turn.bonusMp = state.turn.bonusMp || 0;
    state.turn.moveSum = state.turn.moveSum || 0;
  }
  if (state.players) {
    for (const pid of Object.keys(state.players)) {
      const p = state.players[pid];
      if (p) {
        p.claimedStations = toArray(p.claimedStations);
        p.pendingSelf = toArray(p.pendingSelf);
        // Phòng cũ chưa có checkpoint được xem như đã qua cổng; ván v3.1 mới bắt đầu 0/12.
        if (!Number.isInteger(p.gateProgress)) p.gateProgress = state.mapVersion === '3.1' ? 0 : 12;
        p.gateProgress = Math.max(0, Math.min(12, p.gateProgress));
        p.statusFlags = p.statusFlags || {};
      }
    }
  }
  return state;
}

export function subscribePublic(roomCode, onChange) {
  return onValue(ref(db, `rooms/${roomCode}/public`), (snap) => {
    if (snap.exists()) {
      const raw = snap.val();
      onChange(normalizePublicState(raw));
    }
  });
}

export function subscribePrivate(roomCode, playerId, onChange) {
  return onValue(ref(db, `rooms/${roomCode}/private/${playerId}`), (snap) => {
    if (snap.exists()) onChange(snap.val());
  });
}

export async function getPrivateData(roomCode, playerId) {
  const snap = await get(ref(db, `rooms/${roomCode}/private/${playerId}`));
  return snap.exists() ? snap.val() : { hiddenChoice: 'A', hand: [] };
}

export async function savePublicState(roomCode, newState) {
  await set(ref(db, `rooms/${roomCode}/public`), newState);
}

// Subscribe to Realtime Database's connection monitor.
export function subscribeConnection(onChange) {
  return onValue(ref(db, '.info/connected'), (snap) => {
    onChange(snap.val() === true);
  });
}

// Write only the specified public-state fields instead of replacing the
// entire room state during a simple turn transition.
export async function savePublicStatePatch(roomCode, patch) {
  await update(ref(db, `rooms/${roomCode}/public`), patch);
}

export async function savePrivateData(roomCode, playerId, data) {
  await set(ref(db, `rooms/${roomCode}/private/${playerId}`), data);
}

export async function setHiddenChoice(roomCode, playerId, choice) {
  await update(ref(db, `rooms/${roomCode}/private/${playerId}`), { hiddenChoice: choice });
}

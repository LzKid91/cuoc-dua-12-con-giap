import { buildBoardGraph, getReachableHexes, getChallengeZone, TERRAIN_META, ZODIACS } from './mapData.js';
import { BoardRenderer } from './boardRenderer.js';
import { createRoom, joinRoom, subscribeRoom, syncMovePawn, syncClockHour } from './roomSync.js';

const graph = buildBoardGraph();
let currentRoom = null;
let myPlayerId = null;
let roomState = null;
let currentMp = 7;

const roomBadge = document.getElementById('roomBadge');
const lobbyControls = document.getElementById('lobbyControls');
const gameControls = document.getElementById('gameControls');
const playerListEl = document.getElementById('playerList');
const hexInfoEl = document.getElementById('hexInfo');
const clockReadout = document.getElementById('clockReadout');

const renderer = new BoardRenderer(
  document.getElementById('gameBoard'),
  graph,
  async (hexId) => {
    const node = graph.nodes[hexId];
    const meta = TERRAIN_META[node.terrain];

    if (!currentRoom || !roomState) {
      hexInfoEl.innerHTML = `<strong>${meta.label}</strong> (${meta.passable ? meta.cost + ' MP' : 'Cấm đi'})<br/>Cách Đích: ${node.distToFinish === Infinity ? 'Không đi được' : node.distToFinish + ' ô'}.`;
      return;
    }

    const me = roomState.players?.[myPlayerId];
    if (!me) return;

    const { reachable } = getReachableHexes(graph, me.hexId, currentMp);
    if (reachable.has(hexId)) {
      await syncMovePawn(currentRoom, myPlayerId, hexId);
    } else {
      hexInfoEl.innerHTML = `<strong>${meta.label}</strong> (${meta.passable ? meta.cost + ' MP' : 'Cấm đi'})<br/>Cách Đích: ${node.distToFinish === Infinity ? 'Không đi được' : node.distToFinish + ' ô'}.`;
    }
  }
);

function enterRoom(roomCode, playerId) {
  currentRoom = roomCode;
  myPlayerId = playerId;
  roomBadge.textContent = `Phòng: ${roomCode}`;
  lobbyControls.style.display = 'none';
  gameControls.style.display = 'flex';

  subscribeRoom(roomCode, (pubData) => {
    roomState = pubData;
    renderState();
  });
}

function renderState() {
  if (!roomState) return;
  const players = roomState.players || {};
  renderer.drawAllPawns(players);

  const hr = roomState.clockHour || 3;
  renderer.setClockHour(hr);
  const z = ZODIACS[(hr - 1) % 12];
  clockReadout.textContent = `Đồng hồ: ${hr}h (${z} – ${hr <= 12 ? 'Thiên' : 'Địa'})`;

  const me = players[myPlayerId];
  if (me) {
    const { reachable } = getReachableHexes(graph, me.hexId, currentMp);
    const challenge = getChallengeZone(graph, me.hexId);
    renderer.highlightHexes(me.hexId, reachable, challenge);
    const node = graph.nodes[me.hexId];
    const meta = TERRAIN_META[node.terrain];
    hexInfoEl.innerHTML = `
      <strong>Vị trí của bạn (${me.zodiac}):</strong> ${meta.label}<br/>
      <strong>Cách Đích:</strong> ${node.distToFinish} ô | <strong>Tầm đi (${currentMp} MP):</strong> ${reachable.size} ô<br/>
      <strong>Vùng Khiêu Chiến:</strong> ${challenge.size} ô (viền đứt đỏ)
    `;
  }

  const sorted = Object.values(players).sort(
    (a, b) => graph.nodes[a.hexId].distToFinish - graph.nodes[b.hexId].distToFinish
  );
  playerListEl.innerHTML = sorted.map((p, i) => `
    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;">
      <span><strong style="color:${p.color}">#${i + 1} ${p.zodiac}</strong> – ${p.name} ${p.id === myPlayerId ? '(Bạn)' : ''}</span>
      <span>❤️${p.hp} | Đích: ${graph.nodes[p.hexId].distToFinish}</span>
    </div>
  `).join('');
}

document.getElementById('btnCreateRoom').addEventListener('click', async () => {
  try {
    const name = document.getElementById('playerNameInput').value.trim();
    const { roomCode, playerId } = await createRoom(name);
    enterRoom(roomCode, playerId);
  } catch (err) {
    alert('Lỗi tạo phòng Firebase: ' + err.message);
  }
});

document.getElementById('btnJoinRoom').addEventListener('click', async () => {
  const name = document.getElementById('playerNameInput').value.trim();
  const code = document.getElementById('roomCodeInput').value.trim();
  try {
    const { roomCode, playerId } = await joinRoom(code, name);
    enterRoom(roomCode, playerId);
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('mpSlider').addEventListener('input', (e) => {
  currentMp = Number(e.target.value);
  document.getElementById('mpValue').textContent = currentMp;
  renderState();
});

document.getElementById('btnSpinClock').addEventListener('click', async () => {
  if (!currentRoom || !roomState) return;
  const roll = Math.floor(Math.random() * 6) + 1;
  const nextHr = ((roomState.clockHour - 1 + roll) % 24) + 1;
  await syncClockHour(currentRoom, nextHr);
});

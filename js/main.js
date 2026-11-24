import {
  buildBoardGraph, getReachableHexes, getChallengeZone,
  TERRAIN_META, ZODIACS, START_HEXES
} from './mapData.js';
import { SUPPORT_CARD_DEFS, ZODIAC_DATA } from './cardsData.js';
import { BoardRenderer } from './boardRenderer.js';
import {
  createRoom, joinRoom, addBotToRoom, subscribePublic,
  subscribePrivate, setHiddenChoice, toArray
} from './roomSync.js';
import {
  startGame, pickStartHex, rollFourDice, rerollSelectedDice,
  confirmDiceSplit, bendClockCard, proceedToStep4, chooseLinhKhi,
  playSupportCard, discardCardFromHand, declareHiddenSkill,
  submitCallOut, resolveCallOutNoCaller, calculateCurrentMp,
  proceedToStep5, executeMove, chooseCombatTarget,
  useCombatWeaponCard, combatPeace, combatYield, resolveCombatRoll,
  runBotStep
} from './gameEngine.js';

const graph = buildBoardGraph();
let currentRoom = null;
let myPlayerId = null;
let pubState = null;
let privState = { hiddenChoice: 'A', hand: [] };
let selectedClockDice = [0, 1];
let rerollPickIndices = [];
let rerollMode = null; // null | { type: 'CARD', cardIndex } | { type: 'SKILL' }

const $ = (id) => document.getElementById(id);

const renderer = new BoardRenderer($('gameBoard'), graph, async (hexId) => {
  const node = graph.nodes[hexId];
  const meta = TERRAIN_META[node.terrain];

  if (!currentRoom || !pubState) {
    $('hexInfo').innerHTML = `<strong>${meta.label}</strong> (${meta.passable ? meta.cost + ' MP' : 'Cấm đi'}) | Cách Đích: ${node.distToFinish} ô.`;
    return;
  }

  // 1. Giai đoạn Chọn Ngược vị trí xuất phát
  if (pubState.status === 'draft') {
    const drafterId = toArray(pubState.draftOrder)[pubState.draftIdx];
    if (drafterId === myPlayerId && START_HEXES.includes(hexId)) {
      await pickStartHex(currentRoom, pubState, myPlayerId, hexId);
    }
    return;
  }

  // 2. Giai đoạn Bước 5: Chỉ di chuyển khi tới lượt mình & bấm vào ô viền xanh hợp lệ
  if (pubState.status === 'playing' && pubState.turn?.phase === 'STEP5_MOVE' && pubState.turn.playerId === myPlayerId) {
    const me = pubState.players[myPlayerId];
    const mp = calculateCurrentMp(pubState, graph);
    const extraCost = pubState.blizzardRoundsLeft > 0 ? 1 : 0;
    const { reachable } = getReachableHexes(graph, me.hexId, mp, {
      extraCost,
      flatCostOne: pubState.turn.flatCostOne
    });
    if (reachable.has(hexId)) {
      try {
        await executeMove(currentRoom, pubState, graph, hexId);
      } catch (error) {
        alert(error?.message || 'Không thể thực hiện di chuyển. Hãy thử chọn ô bằng danh sách bên dưới.');
      }
      return;
    }
  }

  // Mặc định chỉ hiển thị thông tin ô (không tự ý di chuyển!)
  $('hexInfo').innerHTML = `
    <strong>${meta.label}</strong> (${meta.passable ? meta.cost + ' MP' : 'Cấm đi'})<br/>
    Mã ô: <code>${node.id}</code> | Cách Đích: <strong>${node.distToFinish === Infinity ? '—' : node.distToFinish + ' ô'}</strong>
  `;
});

// Delegate this dynamic control at document level so panel re-renders cannot
// detach its click handler. Give immediate feedback and expose transition errors.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('#btnToStep5');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  if (button.dataset.processing === 'true') return;

  button.dataset.processing = 'true';
  button.disabled = true;
  button.textContent = 'Đang chuyển sang Bước 5...';

  try {
    if (!currentRoom || !pubState) {
      throw new Error('Chưa đồng bộ được dữ liệu phòng. Hãy tải lại trang rồi thử lại.');
    }
    await proceedToStep5(currentRoom, pubState, graph);
  } catch (error) {
    console.error('[STEP4 → STEP5] Không thể chuyển bước:', error);
    button.disabled = false;
    button.dataset.processing = 'false';
    button.textContent = '▶ Sang Bước 5: Di chuyển';
    alert(error?.message || 'Không thể chuyển sang Bước 5. Mở Console (F12) để xem chi tiết.');
  }
});

function enterRoom(roomCode, playerId) {
  currentRoom = roomCode;
  myPlayerId = playerId;
  $('roomBadge').textContent = `Phòng: ${roomCode}`;
  $('lobbyBar').style.display = 'none';
  $('roomInfoBar').style.display = 'flex';

  subscribePublic(roomCode, (data) => {
    pubState = data;
    renderAll();
  });
  subscribePrivate(roomCode, playerId, (data) => {
    privState = data || { hiddenChoice: 'A', hand: [] };
    renderHand();
    renderActionPanel();
  });
}

function renderAll() {
  if (!pubState) return;
  const players = pubState.players || {};
  const activeId = pubState.status === 'playing' ? pubState.turn?.playerId
                 : (pubState.status === 'draft' ? toArray(pubState.draftOrder)[pubState.draftIdx] : null);

  renderer.drawAllPawns(players, activeId);
  renderer.drawTraps(toArray(pubState.traps));
  renderer.setClockHour(pubState.clockHour || 3);

  const hr = pubState.clockHour || 3;
  const z = ZODIACS[(hr - 1) % 12];
  $('clockReadout').textContent = `Vòng ${pubState.round || 1} | ⏰ ${hr}h (${z} – ${hr <= 12 ? 'Thiên' : 'Địa'}) | Chiều: ${pubState.direction === -1 ? 'Ngược ↺' : 'Thuận ↻'}`;

  // Highlight bản đồ theo đúng pha
  const me = players[myPlayerId];
  let reachable = new Set();
  let challenge = new Set();
  let selectedHex = me?.hexId || null;

  if (pubState.status === 'draft') {
    const drafterId = toArray(pubState.draftOrder)[pubState.draftIdx];
    if (drafterId === myPlayerId) reachable = new Set(START_HEXES);
  } else if (pubState.status === 'playing' && me?.hexId) {
    challenge = getChallengeZone(graph, me.hexId);
    if (pubState.turn?.phase === 'STEP5_MOVE' && pubState.turn.playerId === myPlayerId) {
      const mp = calculateCurrentMp(pubState, graph);
      const extraCost = pubState.blizzardRoundsLeft > 0 ? 1 : 0;
      reachable = getReachableHexes(graph, me.hexId, mp, {
        extraCost,
        flatCostOne: pubState.turn.flatCostOne
      }).reachable;
    }
  }
  renderer.highlightHexes(selectedHex, reachable, challenge);

  renderPlayerList();
  renderActionPanel();
  renderHand();
  renderLogs();
  renderCalloutBanner();
}

function renderPlayerList() {
  const players = Object.values(pubState.players || {});
  players.sort((a, b) => {
    const da = a.hexId ? graph.nodes[a.hexId].distToFinish : 999;
    const db = b.hexId ? graph.nodes[b.hexId].distToFinish : 999;
    return da - db;
  });

  const activeId = pubState.turn?.playerId;
  $('playerList').innerHTML = players.map((p, idx) => {
    const dist = p.hexId ? graph.nodes[p.hexId].distToFinish : '—';
    const isMe = p.id === myPlayerId;
    const isTurn = pubState.status === 'playing' && p.id === activeId;
    const cd = p.cooldownTD > 0 ? '⏳Hồi chiêu' : '✅Sẵn sàng';
    const hiddenTag = p.hiddenRevealed ? `Ẩn ${p.revealedVariant}` : 'Ẩn: ?';
    return `
      <div class="player-row ${isTurn ? 'active-turn' : ''}">
        <div>
          <strong style="color:${p.color}">#${idx + 1} ${p.zodiac}</strong> ${p.name} ${isMe ? '<b>(Bạn)</b>' : ''} ${isTurn ? '⭐' : ''}
          <div class="sub-meta">${cd} | ${hiddenTag} | 🃏${p.handCount || 0}</div>
        </div>
        <div class="right-meta">
          <span>❤️${p.hp}</span><br/>
          <small>Đích: ${dist}</small>
        </div>
      </div>
    `;
  }).join('');
}

function renderActionPanel() {
  const panel = $('actionPanel');
  if (!pubState) return;
  const players = pubState.players || {};
  const me = players[myPlayerId];
  const isHost = pubState.hostId === myPlayerId;

  // 0. Màn hình kết thúc
  if (pubState.status === 'finished') {
    const w = players[pubState.winnerId];
    panel.innerHTML = `
      <div class="banner-win">🏆 <strong>${w?.zodiac} (${w?.name})</strong> ĐÃ CHẠM TỚI THIÊN ĐÌNH VÀ CHIẾN THẮNG!</div>
      ${isHost ? '<button id="btnRestartGame" class="btn-green" style="width:100%;margin-top:8px;">Chơi ván mới</button>' : ''}
    `;
    $('btnRestartGame')?.addEventListener('click', () => startGame(currentRoom, pubState));
    return;
  }

  // 1. Sảnh chờ (Lobby)
  if (pubState.status === 'lobby') {
    const zInfo = me ? ZODIAC_DATA[me.zodiac] : null;
    panel.innerHTML = `
      <p><strong>Sảnh chờ (${Object.keys(players).length}/12 người)</strong></p>
      ${zInfo ? `
        <div class="secret-box">
          <div>Con Giáp của bạn: <strong>${me.zodiac}</strong> (Giờ ${zInfo.hours[0]}h / ${zInfo.hours[1]}h)</div>
          <div style="margin:6px 0;font-size:0.82rem;">Chọn bí mật Kỹ năng Ẩn (chỉ mình bạn thấy):</div>
          <div class="btn-row">
            <button id="pickA" class="${privState.hiddenChoice === 'A' ? 'btn-active' : 'btn-muted'}">A: ${zInfo.hiddenA.name}</button>
            <button id="pickB" class="${privState.hiddenChoice === 'B' ? 'btn-active' : 'btn-muted'}">B: ${zInfo.hiddenB.name}</button>
          </div>
          <small style="display:block;margin-top:5px;color:#5d4037;">
            ${privState.hiddenChoice === 'A' ? zInfo.hiddenA.desc : zInfo.hiddenB.desc}
          </small>
        </div>
      ` : ''}
      ${isHost ? `
        <div class="btn-row" style="margin-top:10px;">
          <button id="btnAddBot" class="btn-muted">+ Thêm Bot Test</button>
          <button id="btnStartGame" class="btn-green">▶ Bắt đầu ván đấu</button>
        </div>
      ` : '<p style="margin-top:8px;font-style:italic;">Đang chờ chủ phòng bấm Bắt đầu...</p>'}
    `;
    $('pickA')?.addEventListener('click', () => setHiddenChoice(currentRoom, myPlayerId, 'A'));
    $('pickB')?.addEventListener('click', () => setHiddenChoice(currentRoom, myPlayerId, 'B'));
    $('btnAddBot')?.addEventListener('click', async () => {
      try { await addBotToRoom(currentRoom); } catch (e) { alert(e.message); }
    });
    $('btnStartGame')?.addEventListener('click', () => startGame(currentRoom, pubState));
    return;
  }

  // 2. Chọn Ngược vị trí xuất phát
  if (pubState.status === 'draft') {
    const drafterId = toArray(pubState.draftOrder)[pubState.draftIdx];
    const drafter = players[drafterId];
    panel.innerHTML = `
      <p><strong>📍 Chọn Ngược vị trí xuất phát</strong></p>
      <p style="margin-top:6px;">
        ${drafterId === myPlayerId
          ? '👉 <strong>Tới lượt bạn!</strong> Hãy bấm vào 1 trong 5 ô <strong>XP (viền xanh)</strong> ở đáy Mùa Xuân.'
          : `Đang chờ <strong>${drafter?.zodiac} (${drafter?.name})</strong> chọn ô xuất phát...`}
      </p>
      ${isHost && drafter?.isBot ? '<button id="btnBotStep" style="margin-top:8px;width:100%;">🤖 Cho Bot chọn ô</button>' : ''}
    `;
    $('btnBotStep')?.addEventListener('click', () => runBotStep(currentRoom, pubState, graph));
    return;
  }

  // 3. Đang chơi — 5 Bước lượt
  const turn = pubState.turn;
  const active = players[turn.playerId];
  const isMyTurn = turn.playerId === myPlayerId;
  const canBotAct = isHost && active?.isBot;

  let html = `<div class="turn-header">Lượt của: <strong style="color:${active.color}">${active.zodiac} (${active.name})</strong></div>`;
  if (pubState.lastEvent) {
    html += `<div class="event-pill">⚡ Sự kiện gần nhất: <strong>${pubState.lastEvent.name}</strong> — ${pubState.lastEvent.desc}</div>`;
  }

  if (canBotAct) {
    html += `<button id="btnBotStep" style="width:100%;margin-top:8px;background:#455a64;">🤖 Thực hiện bước tiếp theo cho ${active.zodiac}</button>`;
    panel.innerHTML = html;
    $('btnBotStep').addEventListener('click', () => runBotStep(currentRoom, pubState, graph));
    return;
  }

  // Giao chiến 1v1 (cả 2 bên đều thấy nút)
  if (turn.phase === 'COMBAT_1V1' && pubState.combat) {
    const c = pubState.combat;
    const atk = players[c.attackerId], def = players[c.defenderId];
    const inCombat = myPlayerId === c.attackerId || myPlayerId === c.defenderId;
    html += `
      <div class="combat-box">
        <strong>⚔️ GIAO CHIẾN 1v1 (${c.season})</strong><br/>
        ${atk.zodiac} (+${c.atkBonus}) <strong>VS</strong> ${def.zodiac} (+${c.defBonus})
        ${inCombat ? `
          <div class="btn-row" style="margin-top:8px;">
            <button id="btnCombatRoll">🎲 Tung 2d6 Giao chiến</button>
            ${c.season !== 'THU' ? '<button id="btnPeace" class="btn-green">🕊️ Hòa bình</button>' : ''}
            <button id="btnYield" class="btn-muted">🏳️ Nhường</button>
          </div>
          <small style="display:block;margin-top:4px;">Bạn có thể bấm dùng lá <b>Vũ Khí Bí Mật (+3)</b> ở mục Thẻ trên tay trước khi tung!</small>
        ` : '<p style="margin-top:6px;">Đang chờ 2 bên phân định Giao chiến...</p>'}
      </div>
    `;
    panel.innerHTML = html;
    $('btnCombatRoll')?.addEventListener('click', () => resolveCombatRoll(currentRoom, pubState, graph));
    $('btnPeace')?.addEventListener('click', async () => { try { await combatPeace(currentRoom, pubState, graph, myPlayerId); } catch (e) { alert(e.message); } });
    $('btnYield')?.addEventListener('click', () => combatYield(currentRoom, pubState, graph, myPlayerId));
    return;
  }

  if (turn.phase === 'COMBAT_MELEE' && pubState.combat) {
    html += `
      <div class="combat-box">
        <strong>⚔️ HỖN CHIẾN ${pubState.combat.participants.length} NGƯỜI!</strong>
        ${isMyTurn ? '<button id="btnMeleeRoll" style="width:100%;margin-top:8px;">🎲 Tung 2d6 Phân Định Hỗn Chiến</button>' : '<p>Đang chờ phân định Hỗn chiến...</p>'}
      </div>
    `;
    panel.innerHTML = html;
    $('btnMeleeRoll')?.addEventListener('click', () => resolveCombatRoll(currentRoom, pubState, graph));
    return;
  }

  if (!isMyTurn) {
    html += `<p style="margin-top:8px;">Đang ở pha <strong>${phaseLabel(turn.phase)}</strong>. Chờ ${active.zodiac} thao tác...</p>`;
    panel.innerHTML = html;
    return;
  }

  // ---- Bảng điều khiển riêng cho NGƯỜI ĐANG ĐI LƯỢT ----
  if (turn.phase === 'STEP1_ROLL') {
    html += `
      <p style="margin:6px 0;"><strong>Bước 1:</strong> Tung 4 viên xúc xắc dùng chung.</p>
      <button id="btnRoll4d6" style="width:100%;">🎲 Tung 4 Xúc Xắc (4d6)</button>
    `;
  } else if (turn.phase === 'STEP2_SPLIT') {
    const dice = toArray(turn.dice);
    if (selectedClockDice.length !== 2) selectedClockDice = [0, 1];
    const moveIdx = [0, 1, 2, 3].filter(i => !selectedClockDice.includes(i));
    const cSum = dice[selectedClockDice[0]] + dice[selectedClockDice[1]];
    const mSum = dice[moveIdx[0]] + dice[moveIdx[1]];
    const hasFreeReroll = toArray(me.pendingSelf).includes('HOI_THIEN') && !turn.rerolledFree;

    html += `
      <p style="margin:6px 0;"><strong>Bước 2:</strong> ${rerollMode ? 'Chọn 1–2 viên muốn TUNG LẠI rồi bấm xác nhận:' : 'Bấm chọn đúng <b>2 viên Quay Kim (đỏ)</b>; 2 viên còn lại là <b>Di Chuyển MP (xanh)</b>:'}</p>
      <div class="dice-row">
        ${dice.map((val, idx) => {
          const isClock = selectedClockDice.includes(idx);
          const isReroll = rerollPickIndices.includes(idx);
          const cls = rerollMode ? (isReroll ? 'die-reroll' : '') : (isClock ? 'die-clock' : 'die-move');
          return `<button class="die-btn ${cls}" data-idx="${idx}">${val}<small>${rerollMode ? (isReroll ? 'Lại' : '') : (isClock ? 'Kim' : 'MP')}</small></button>`;
        }).join('')}
      </div>
      <div style="font-size:0.84rem;margin:6px 0;">
        ⏰ Quay kim: <strong>+${cSum}h</strong> &nbsp;|&nbsp; 🏃 Di chuyển: <strong>${mSum} MP</strong>
      </div>
      ${rerollMode ? `
        <div class="btn-row">
          <button id="btnDoReroll" class="btn-green">Xác nhận tung lại</button>
          <button id="btnCancelReroll" class="btn-muted">Hủy</button>
        </div>
      ` : `
        <div class="btn-row">
          <button id="btnConfirmSplit" class="btn-green">✔ Xác nhận & Quay Kim</button>
          ${hasFreeReroll ? '<button id="btnFreeReroll">🐷 Phúc Lộc (Tung lại)</button>' : ''}
        </div>
      `}
    `;
  } else if (turn.phase === 'STEP3_CLOCK') {
    const hr = pubState.clockHour;
    const z = ZODIACS[(hr - 1) % 12];
    html += `
      <p style="margin:6px 0;"><strong>Bước 3:</strong> Kim đã dừng tại <strong>${hr}h (${z} – ${hr <= 12 ? 'Thiên' : 'Địa'})</strong>.</p>
      <small style="display:block;margin-bottom:8px;">Nếu muốn dùng thẻ <b>Bẻ Kim Đồng Hồ</b>, hãy bấm ở mục Thẻ trên tay trước khi tiếp tục.</small>
      <button id="btnToStep4" class="btn-green" style="width:100%;">▶ Tiếp tục sang Bước 4 (Hiệu ứng giờ)</button>
    `;
  } else if (turn.phase === 'STEP4_ACTION') {
    html += `<p style="margin:6px 0;"><strong>Bước 4:</strong> Hiệu ứng giờ đã xử lý. Bạn có thể dùng Thẻ Bước 4 (${turn.cardsUsed}/2 thẻ) hoặc Kỹ năng Ẩn.</p>`;
    if (turn.linhKhiPending) {
      html += `
        <div class="linhkhi-box">
          <strong>✨ Chọn Linh Khí Thời Gian:</strong>
          <div class="btn-row" style="margin-top:6px;">
            <button id="lkMp" class="btn-green">+1 MP</button>
            <button id="lkPlus">Kim +1h</button>
            <button id="lkMinus">Kim -1h</button>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="btn-row" style="margin-top:6px;">
          <button type="button" id="btnToStep5" class="btn-green">▶ Sang Bước 5: Di chuyển</button>
          ${me.hiddenUses < 2 && me.cooldownHidden === 0 ? '<button id="btnUseHidden">👁️ Dùng Kỹ năng Ẩn</button>' : ''}
        </div>
      `;
    }
  } else if (turn.phase === 'STEP5_MOVE') {
    const mp = calculateCurrentMp(pubState, graph);
    const extraCost = pubState.blizzardRoundsLeft > 0 ? 1 : 0;
    const { reachable, bestCost } = getReachableHexes(graph, me.hexId, mp, {
      extraCost,
      flatCostOne: turn.flatCostOne
    });
    const moveOptions = [...reachable]
      .map(hexId => {
        const node = graph.nodes[hexId];
        return { id: hexId, node, cost: bestCost[hexId] };
      })
      .sort((a, b) => a.node.distToFinish - b.node.distToFinish || a.cost - b.cost);
    html += `
      <p style="margin:6px 0;"><strong>Bước 5 – Di chuyển:</strong> Bạn có <strong>${mp} MP</strong> và <strong>${moveOptions.length} ô có thể đến</strong>. Bấm ô viền xanh trên bản đồ để di chuyển.</p>
      <details class="move-fallback">
        <summary>Không bấm được ô trên bản đồ? Chọn đích tại đây (${moveOptions.length} ô)</summary>
        <div class="move-option-list">
          ${moveOptions.length ? moveOptions.map(option => {
            const meta = TERRAIN_META[option.node.terrain];
            return `<button type="button" class="move-option-btn" data-hex-id="${option.id}">
              <strong>${meta.label}</strong>
              <small>${option.id} · Chi phí đường đi: ${option.cost} MP · Cách đích: ${option.node.distToFinish} ô</small>
            </button>`;
          }).join('') : '<p class="move-empty">Không tìm thấy ô hợp lệ để di chuyển. Hãy kiểm tra vị trí quân cờ và nhật ký lượt.</p>'}
        </div>
      </details>
      <div class="btn-row">
        <button id="btnStayStill" class="btn-muted">Đứng yên (0 ô)</button>
        ${me.hiddenUses < 2 && me.cooldownHidden === 0 ? '<button id="btnUseHidden">👁️ Dùng Kỹ năng Ẩn</button>' : ''}
      </div>
    `;
  } else if (turn.phase === 'COMBAT_CHOOSE') {
    html += `<p style="margin:6px 0;"><strong>Chọn 1 đối thủ để Giao chiến 1v1:</strong></p><div class="btn-row">`;
    for (const tid of toArray(turn.combatTargets)) {
      const t = players[tid];
      html += `<button class="pick-target-btn" data-tid="${tid}">⚔️ Đánh ${t.zodiac} (${t.name})</button>`;
    }
    html += `</div>`;
  }

  panel.innerHTML = html;

  // Bind events cho bảng hành động
  $('btnRoll4d6')?.addEventListener('click', () => rollFourDice(currentRoom, pubState));
  document.querySelectorAll('.die-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (rerollMode) {
        if (rerollPickIndices.includes(idx)) rerollPickIndices = rerollPickIndices.filter(x => x !== idx);
        else if (rerollPickIndices.length < 2) rerollPickIndices.push(idx);
      } else {
        if (selectedClockDice.includes(idx)) {
          selectedClockDice = selectedClockDice.filter(x => x !== idx);
        } else {
          if (selectedClockDice.length >= 2) selectedClockDice.shift();
          selectedClockDice.push(idx);
        }
      }
      renderActionPanel();
    });
  });
  $('btnFreeReroll')?.addEventListener('click', () => {
    rerollMode = { type: 'SKILL' };
    rerollPickIndices = [];
    renderActionPanel();
  });
  $('btnCancelReroll')?.addEventListener('click', () => {
    rerollMode = null;
    rerollPickIndices = [];
    renderActionPanel();
  });
  $('btnDoReroll')?.addEventListener('click', async () => {
    if (rerollPickIndices.length === 0) return alert('Chọn ít nhất 1 viên xúc xắc!');
    const mode = rerollMode;
    const picks = [...rerollPickIndices];
    rerollMode = null;
    rerollPickIndices = [];
    try {
      await rerollSelectedDice(currentRoom, pubState, picks, mode.type === 'SKILL', mode.cardIndex);
    } catch (e) { alert(e.message); }
  });
  $('btnConfirmSplit')?.addEventListener('click', () => {
    if (selectedClockDice.length !== 2) return alert('Hãy chọn đúng 2 viên cho nhóm Quay Kim!');
    confirmDiceSplit(currentRoom, pubState, selectedClockDice);
  });
  $('btnToStep4')?.addEventListener('click', () => proceedToStep4(currentRoom, pubState, graph));
  $('lkMp')?.addEventListener('click', () => chooseLinhKhi(currentRoom, pubState, 'MP'));
  $('lkPlus')?.addEventListener('click', () => chooseLinhKhi(currentRoom, pubState, 'CLOCK_PLUS'));
  $('lkMinus')?.addEventListener('click', () => chooseLinhKhi(currentRoom, pubState, 'CLOCK_MINUS'));
  $('btnStayStill')?.addEventListener('click', async () => {
    try {
      await executeMove(currentRoom, pubState, graph, me.hexId);
    } catch (error) {
      alert(error?.message || 'Không thể kết thúc bước di chuyển.');
    }
  });
  document.querySelectorAll('.move-option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetHexId = btn.dataset.hexId;
      try {
        await executeMove(currentRoom, pubState, graph, targetHexId);
      } catch (error) {
        alert(error?.message || 'Không thể di chuyển tới ô đã chọn.');
      }
    });
  });
  $('btnUseHidden')?.addEventListener('click', async () => {
    try { await declareHiddenSkill(currentRoom, pubState, graph, myPlayerId); } catch (e) { alert(e.message); }
  });
  document.querySelectorAll('.pick-target-btn').forEach(btn => {
    btn.addEventListener('click', () => chooseCombatTarget(currentRoom, pubState, graph, btn.dataset.tid));
  });
}

function renderHand() {
  const handEl = $('handPanel');
  if (!pubState || !myPlayerId) return;
  const hand = toArray(privState.hand);
  const me = pubState.players?.[myPlayerId];
  const turn = pubState.turn;
  const isMyTurn = turn?.playerId === myPlayerId;

  if (hand.length === 0) {
    handEl.innerHTML = '<small style="color:#6d4c41;">Chưa có Thẻ Hỗ Trợ trên tay (đi qua Trạm +1 / +2 Thẻ để rút).</small>';
    return;
  }

  let overWarn = hand.length > 4 ? '<div class="warn-bar">⚠️ Bạn đang cầm quá 4 thẻ! Hãy bấm nút 🗑️ bỏ bớt cho còn 4 lá.</div>' : '';
  handEl.innerHTML = overWarn + hand.map((cardId, idx) => {
    const def = SUPPORT_CARD_DEFS[cardId];
    if (!def) return '';
    let actionBtn = '';
    if (cardId === 'DOI_VAN' && isMyTurn && turn.phase === 'STEP2_SPLIT') {
      actionBtn = `<button class="card-use-btn" data-act="DOI_VAN" data-idx="${idx}">Dùng</button>`;
    } else if (cardId === 'BE_KIM' && isMyTurn && turn.phase === 'STEP3_CLOCK') {
      actionBtn = `<button class="card-use-btn" data-act="BE_KIM_P" data-idx="${idx}">+1h</button><button class="card-use-btn" data-act="BE_KIM_M" data-idx="${idx}">-1h</button>`;
    } else if (cardId === 'VU_KHI' && pubState.combat?.type === '1V1' && (pubState.combat.attackerId === myPlayerId || pubState.combat.defenderId === myPlayerId)) {
      actionBtn = `<button class="card-use-btn" data-act="VU_KHI" data-idx="${idx}">+3 Điểm</button>`;
    } else if ((def.timing === 'STEP4' && isMyTurn && turn.phase === 'STEP4_ACTION') || (def.timing === 'STEP5' && isMyTurn && turn.phase === 'STEP5_MOVE')) {
      actionBtn = `<button class="card-use-btn" data-act="NORMAL" data-idx="${idx}">Dùng</button>`;
    }
    return `
      <div class="hand-card">
        <div>
          <strong>${def.name}</strong> <span class="tag">${def.timing}</span>
          <div class="card-desc">${def.desc}</div>
        </div>
        <div class="card-actions">
          ${actionBtn}
          <button class="card-drop-btn" data-idx="${idx}" title="Bỏ thẻ">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  handEl.querySelectorAll('.card-use-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;
      try {
        if (act === 'DOI_VAN') {
          rerollMode = { type: 'CARD', cardIndex: idx };
          rerollPickIndices = [];
          renderActionPanel();
        } else if (act === 'BE_KIM_P') {
          await bendClockCard(currentRoom, pubState, 1, idx);
        } else if (act === 'BE_KIM_M') {
          await bendClockCard(currentRoom, pubState, -1, idx);
        } else if (act === 'VU_KHI') {
          await useCombatWeaponCard(currentRoom, pubState, myPlayerId, idx);
        } else {
          await playSupportCard(currentRoom, pubState, graph, myPlayerId, idx);
        }
      } catch (e) { alert(e.message); }
    });
  });

  handEl.querySelectorAll('.card-drop-btn').forEach(btn => {
    btn.addEventListener('click', () => discardCardFromHand(currentRoom, pubState, myPlayerId, Number(btn.dataset.idx)));
  });
}

function renderCalloutBanner() {
  const box = $('calloutBanner');
  if (!pubState?.callout) {
    box.style.display = 'none';
    return;
  }
  const c = pubState.callout;
  const owner = pubState.players[c.ownerId];
  const me = pubState.players[myPlayerId];
  const canCall = me && myPlayerId !== c.ownerId && me.hp >= 2;
  const zInfo = ZODIAC_DATA[owner.zodiac];

  box.style.display = 'block';
  box.innerHTML = `
    <strong>👁️ ${owner.zodiac} (${owner.name}) kích hoạt Kỹ năng Ẩn!</strong>
    <div style="font-size:0.83rem;margin:4px 0;"><em>${zInfo.riddle}</em></div>
    <div style="font-size:0.8rem;">A: ${zInfo.hiddenA.name} | B: ${zInfo.hiddenB.name}</div>
    <div class="btn-row" style="margin-top:8px;">
      ${canCall ? `
        <button id="btnCallA">🚨 Call Out: A</button>
        <button id="btnCallB">🚨 Call Out: B</button>
      ` : ''}
      <button id="btnSkipCall" class="btn-muted">Không ai Call Out → Kích hoạt</button>
    </div>
  `;
  $('btnCallA')?.addEventListener('click', () => submitCallOut(currentRoom, pubState, graph, myPlayerId, 'A'));
  $('btnCallB')?.addEventListener('click', () => submitCallOut(currentRoom, pubState, graph, myPlayerId, 'B'));
  $('btnSkipCall')?.addEventListener('click', () => resolveCallOutNoCaller(currentRoom, pubState, graph));
}

function renderLogs() {
  const logs = toArray(pubState.logs);
  $('logPanel').innerHTML = logs.slice(0, 14).map(l => `<div class="log-line">${l}</div>`).join('');
}

function phaseLabel(ph) {
  const map = {
    STEP1_ROLL: 'Bước 1 (Tung 4d6)',
    STEP2_SPLIT: 'Bước 2 (Chia xúc xắc)',
    STEP3_CLOCK: 'Bước 3 (Quay đồng hồ)',
    STEP4_ACTION: 'Bước 4 (Kỹ năng & Thẻ)',
    STEP5_MOVE: 'Bước 5 (Di chuyển)',
    COMBAT_CHOOSE: 'Chọn mục tiêu Giao chiến',
    COMBAT_1V1: 'Giao chiến 1v1',
    COMBAT_MELEE: 'Hỗn chiến'
  };
  return map[ph] || ph;
}

// Modal Bảng tra cứu 12 Con Giáp công khai
function buildGuideModal() {
  $('guideBody').innerHTML = ZODIACS.map(z => {
    const d = ZODIAC_DATA[z];
    return `
      <div class="guide-item">
        <h4>${z} (Giờ ${d.hours[0]}h / ${d.hours[1]}h – Đắc địa: ${d.season})</h4>
        <div><b>Thiên – ${d.thien.name}</b> [${d.thien.type}]: ${d.thien.desc}</div>
        <div><b>Địa – ${d.dia.name}</b> [${d.dia.type}]: ${d.dia.desc}</div>
        <div style="color:#6a1b9a;margin-top:3px;"><b>Ẩn A – ${d.hiddenA.name}:</b> ${d.hiddenA.desc}</div>
        <div style="color:#00695c;"><b>Ẩn B – ${d.hiddenB.name}:</b> ${d.hiddenB.desc}</div>
      </div>
    `;
  }).join('');
}

$('btnCreateRoom').addEventListener('click', async () => {
  try {
    const { roomCode, playerId } = await createRoom($('playerNameInput').value.trim());
    enterRoom(roomCode, playerId);
  } catch (e) { alert('Lỗi tạo phòng: ' + e.message); }
});

$('btnJoinRoom').addEventListener('click', async () => {
  try {
    const { roomCode, playerId } = await joinRoom($('roomCodeInput').value.trim(), $('playerNameInput').value.trim());
    enterRoom(roomCode, playerId);
  } catch (e) { alert(e.message); }
});

$('btnOpenGuide').addEventListener('click', () => { $('guideModal').style.display = 'flex'; });
$('btnCloseGuide').addEventListener('click', () => { $('guideModal').style.display = 'none'; });
buildGuideModal();

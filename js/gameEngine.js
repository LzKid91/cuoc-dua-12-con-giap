import {
  ZODIACS, SEASON_BONUS_ZODIACS, START_HEXES, TERRAIN_META,
  ALL_CHECKPOINTS, SEASON_ORDER,
  getHexDistance, getReachableHexes, reconstructPath,
  getChallengeZone, computePushBackHex, computeAdvanceHex, computeIceSlide
} from './mapData.js';
import {
  SUPPORT_CARD_DEFS, EVENT_CARDS, ZODIAC_DATA,
  createShuffledSupportDeck, createShuffledEventDeck, shuffle
} from './cardsData.js';
import {
  toArray, savePublicState, savePublicStatePatch, getPrivateData, savePrivateData
} from './roomSync.js';

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function cloneState(s) {
  const c = JSON.parse(JSON.stringify(s));
  c.turnOrder = toArray(c.turnOrder);
  c.draftOrder = toArray(c.draftOrder);
  c.supportDeck = toArray(c.supportDeck);
  c.supportDiscard = toArray(c.supportDiscard);
  c.eventDeck = toArray(c.eventDeck);
  c.traps = toArray(c.traps);
  c.logs = toArray(c.logs);
  for (const p of Object.values(c.players || {})) {
    p.claimedStations = toArray(p.claimedStations);
    p.pendingSelf = toArray(p.pendingSelf);
    // Phòng cũ từ v3.0 được mở khóa checkpoint để không làm hỏng ván đang diễn ra.
    if (!Number.isInteger(p.gateProgress)) p.gateProgress = c.mapVersion === '3.1' ? 0 : 12;
    p.gateProgress = Math.max(0, Math.min(12, p.gateProgress));
    p.statusFlags = p.statusFlags || {};
  }
  return c;
}

function addLog(state, msg) {
  state.logs.unshift(`[V${state.round}] ${msg}`);
  if (state.logs.length > 35) state.logs.length = 35;
}

function seasonRankForPlayer(graph, hexId, gateProgress = 0) {
  const node = graph.nodes[hexId];
  if (!node) return -1;
  const directRank = SEASON_ORDER.indexOf(node.season);
  if (directRank >= 0) return directRank;
  if (node.season === 'BRIDGE' && node.endpoints?.length === 2) {
    const ranks = node.endpoints
      .map(id => SEASON_ORDER.indexOf(graph.nodes[id]?.season))
      .filter(rank => rank >= 0)
      .sort((a, b) => a - b);
    if (ranks.length === 2) return gateProgress >= (ranks[1] * 3) ? ranks[1] : ranks[0];
  }
  return -1;
}

function planSkillRelocation(state, graph, player, targetHexId) {
  const fromHexId = player?.hexId;
  const fromNode = graph.nodes[fromHexId];
  const toNode = graph.nodes[targetHexId];
  if (!player || !fromNode || !toNode || !TERRAIN_META[toNode.terrain]?.passable) {
    return { allowed: false, reason: 'Vị trí dịch chuyển không hợp lệ.' };
  }

  let nextProgress = Math.max(0, Math.min(12, Number(player.gateProgress) || 0));
  let skippedCheckpoint = null;
  let reachedCheckpoint = null;
  const fromRank = seasonRankForPlayer(graph, fromHexId, nextProgress);
  const toRank = seasonRankForPlayer(graph, targetHexId, nextProgress);

  // Dịch chuyển tiến sang mùa sau chỉ được bỏ qua tối đa 1 cổng còn thiếu.
  if (toRank > fromRank && fromRank >= 0) {
    const required = toRank * 3;
    const missing = Math.max(0, required - nextProgress);
    if (missing > 1) {
      return {
        allowed: false,
        reason: `Không thể dịch chuyển tới ${SEASON_ORDER[toRank]}: còn phải hoàn thành ${missing} checkpoint trước đó (mỗi lần dịch chuyển chỉ bỏ qua tối đa 1).`
      };
    }
    if (missing === 1) {
      skippedCheckpoint = ALL_CHECKPOINTS[nextProgress] || null;
      nextProgress += 1;
    }
  } else if (
    toRank === fromRank &&
    fromRank >= 0 &&
    toNode.distToFinish < fromNode.distToFinish &&
    nextProgress < (fromRank + 1) * 3 &&
    toNode.checkpointIndex !== nextProgress
  ) {
    // Dịch chuyển tiến trong cùng mùa có thể bỏ qua đúng 1 checkpoint kế tiếp.
    skippedCheckpoint = ALL_CHECKPOINTS[nextProgress] || null;
    nextProgress += 1;
  }

  // Đáp xuống đúng checkpoint kế tiếp vẫn được ghi nhận như chạm cổng,
  // không tính là một checkpoint bị bỏ qua.
  if (toNode.checkpointIndex === nextProgress) {
    reachedCheckpoint = ALL_CHECKPOINTS[nextProgress] || null;
    nextProgress += 1;
  }

  if (targetHexId === graph.finishId && nextProgress < 12) {
    return { allowed: false, reason: 'Thiên Đình chỉ mở sau khi hoàn thành đủ 12 checkpoint.' };
  }

  return { allowed: true, nextProgress, skippedCheckpoint, reachedCheckpoint };
}

function applySkillRelocation(state, graph, player, targetHexId, reason = 'Dịch chuyển') {
  const plan = planSkillRelocation(state, graph, player, targetHexId);
  if (!plan.allowed) {
    addLog(state, `⛔ ${reason} của ${player?.zodiac || 'người chơi'} không thể thực hiện: ${plan.reason}`);
    return false;
  }
  player.hexId = targetHexId;
  player.gateProgress = plan.nextProgress;
  if (targetHexId === graph.finishId && plan.nextProgress === 12) {
    state.status = 'finished';
    state.winnerId = player.id;
    addLog(state, `🏆 CHIẾN THẮNG! ${player.zodiac} dùng ${reason} hoàn thành 12 checkpoint và chạm Thiên Đình!`);
  }
  if (plan.skippedCheckpoint) {
    addLog(state, `🌀 ${player.zodiac} dùng ${reason}, bỏ qua 1 checkpoint: ${plan.skippedCheckpoint.name} (${player.gateProgress}/12).`);
  }
  if (plan.reachedCheckpoint) {
    addLog(state, `🏁 ${player.zodiac} chạm ${plan.reachedCheckpoint.name}! Tiến độ ${player.gateProgress}/12.`);
  }
  return true;
}

function applySkillSwap(state, graph, player, target, reason = 'Hoán đổi') {
  if (!player || !target) return false;
  const playerPlan = planSkillRelocation(state, graph, player, target.hexId);
  const targetPlan = planSkillRelocation(state, graph, target, player.hexId);
  if (!playerPlan.allowed || !targetPlan.allowed) {
    const failed = !playerPlan.allowed ? playerPlan : targetPlan;
    addLog(state, `⛔ ${reason} không thể thực hiện: ${failed.reason}`);
    return false;
  }

  const playerHex = player.hexId;
  player.hexId = target.hexId;
  target.hexId = playerHex;
  player.gateProgress = playerPlan.nextProgress;
  target.gateProgress = targetPlan.nextProgress;

  for (const [moved, plan] of [[player, playerPlan], [target, targetPlan]]) {
    if (plan.skippedCheckpoint) {
      addLog(state, `🌀 ${moved.zodiac} dùng ${reason}, bỏ qua 1 checkpoint: ${plan.skippedCheckpoint.name} (${moved.gateProgress}/12).`);
    }
    if (plan.reachedCheckpoint) {
      addLog(state, `🏁 ${moved.zodiac} chạm ${plan.reachedCheckpoint.name}! Tiến độ ${moved.gateProgress}/12.`);
    }
  }
  return true;
}

function applySkillAdvance(state, graph, player, steps, reason = 'Kỹ năng tiến bước') {
  const targetHexId = computeAdvanceHex(graph, player.hexId, steps);
  return applySkillRelocation(state, graph, player, targetHexId, reason);
}

function getRankings(state, graph) {
  const list = Object.values(state.players).map(p => ({
    id: p.id,
    dist: p.hexId ? graph.nodes[p.hexId].distToFinish : 999
  }));
  list.sort((a, b) => a.dist - b.dist);
  const bestDist = list[0]?.dist ?? 999;
  const worstDist = list[list.length - 1]?.dist ?? 0;
  return {
    sorted: list,
    leaders: list.filter(x => x.dist === bestDist).map(x => x.id),
    lastPlace: list.filter(x => x.dist === worstDist).map(x => x.id),
    bestDist
  };
}

async function drawSupportCards(roomCode, state, playerId, count) {
  const priv = await getPrivateData(roomCode, playerId);
  const hand = toArray(priv.hand);
  const drawnNames = [];

  for (let i = 0; i < count; i++) {
    if (state.supportDeck.length === 0) {
      if (state.supportDiscard.length === 0) break;
      state.supportDeck = shuffle(state.supportDiscard);
      state.supportDiscard = [];
      addLog(state, '🔄 Xáo lại chồng bỏ thành chồng Thẻ Hỗ Trợ mới.');
    }
    const cardId = state.supportDeck.pop();
    hand.push(cardId);
    drawnNames.push(SUPPORT_CARD_DEFS[cardId]?.name || cardId);
  }

  // Nếu vượt quá 4 lá trên tay, tự bỏ lá thừa cũ nhất cho Bot, hoặc giữ tạm để người chơi chọn bỏ
  const p = state.players[playerId];
  while (hand.length > 4 && p.isBot) {
    state.supportDiscard.push(hand.shift());
  }

  p.handCount = hand.length;
  await savePrivateData(roomCode, playerId, { ...priv, hand });
  return drawnNames;
}

async function discardAllHand(roomCode, state, playerId) {
  const priv = await getPrivateData(roomCode, playerId);
  const hand = toArray(priv.hand);
  for (const c of hand) state.supportDiscard.push(c);
  state.players[playerId].handCount = 0;
  await savePrivateData(roomCode, playerId, { ...priv, hand: [] });
}

async function stealRandomCard(roomCode, state, thiefId, victimId) {
  const vPriv = await getPrivateData(roomCode, victimId);
  const vHand = toArray(vPriv.hand);
  if (vHand.length === 0) return null;

  const idx = Math.floor(Math.random() * vHand.length);
  const [stolen] = vHand.splice(idx, 1);
  state.players[victimId].handCount = vHand.length;
  await savePrivateData(roomCode, victimId, { ...vPriv, hand: vHand });

  const tPriv = await getPrivateData(roomCode, thiefId);
  const tHand = toArray(tPriv.hand);
  tHand.push(stolen);
  while (tHand.length > 4 && state.players[thiefId].isBot) {
    state.supportDiscard.push(tHand.shift());
  }
  state.players[thiefId].handCount = tHand.length;
  await savePrivateData(roomCode, thiefId, { ...tPriv, hand: tHand });
  return SUPPORT_CARD_DEFS[stolen]?.name || stolen;
}

function healHp(state, graph, playerId, amount) {
  const p = state.players[playerId];
  const season = p.hexId ? graph.nodes[p.hexId].season : 'XUAN';
  const mult = season === 'XUAN' ? 2 : 1; // Mùa Xuân: Sinh sôi nhân đôi hồi phục
  const before = p.hp;
  p.hp = Math.min(3, p.hp + amount * mult);
  return p.hp - before;
}

async function applyDamage(roomCode, state, graph, playerId, reason) {
  const p = state.players[playerId];
  p.hp = Math.max(0, p.hp - 1);
  addLog(state, `💔 ${p.zodiac} (${p.name}) mất 1 Mệnh Bài (${reason}) → còn ${p.hp}❤️.`);

  // Chốt 1A: Cơ chế Trọng Thương khi về 0 Mệnh Bài
  if (p.hp <= 0) {
    const newHex = computePushBackHex(graph, p.hexId, 4, true);
    p.hexId = newHex;
    await discardAllHand(roomCode, state, playerId);
    p.hp = 2;
    addLog(state, `🚑 TRỌNG THƯƠNG! ${p.zodiac} lùi 4 ô (không qua cầu), mất hết thẻ trên tay và hồi lại 2❤️.`);
  }
}

function placeTrap(state, hexId, type, ownerId) {
  // Cầu Dài là tuyến an toàn, không thể đặt bẫy.
  if (hexId.startsWith('BRIDGE:') && hexId.endsWith('_L')) return false;
  // Cầu Ngắn chỉ chứa tối đa 1 token bẫy.
  if (hexId.startsWith('BRIDGE:')) {
    state.traps = state.traps.filter(t => t.hexId !== hexId);
  }
  state.traps.push({ id: 'T_' + Date.now() + Math.random().toString(36).slice(2, 5), hexId, type, ownerId });
  while (state.traps.length > 4) state.traps.shift();
  return true;
}

function initNewTurn(state) {
  const activeId = state.turnOrder[state.currentTurnIdx];
  const p = state.players[activeId];

  // Đầu lượt: giảm hồi chiêu & xóa cờ lượt cũ
  if (p.cooldownTD > 0) p.cooldownTD -= 1;
  if (p.cooldownHidden > 0) p.cooldownHidden -= 1;
  if (p.statusFlags.immuneUntilNextTurn) delete p.statusFlags.immuneUntilNextTurn;
  if (p.statusFlags.guardBonus) delete p.statusFlags.guardBonus;
  if (p.statusFlags.danRoarBonus) delete p.statusFlags.danRoarBonus;
  if (p.statusFlags.dauSafeCallout) delete p.statusFlags.dauSafeCallout;

  // Nếu Thìn Thiên [Toàn cục] đảo chiều quay về đúng chủ nhân thì kết thúc & bắt đầu hồi chiêu
  if (state.reverseUntilPlayerId === activeId) {
    state.direction = 1;
    state.reverseUntilPlayerId = null;
    p.cooldownTD = 1;
    addLog(state, `🌀 Hô Mưa Gọi Gió kết thúc khi lượt quay lại ${p.zodiac}; chiều đi trở về bình thường.`);
  }

  state.turn = {
    playerId: activeId,
    phase: 'STEP1_ROLL',
    dice: [],
    clockIndices: [],
    clockSum: 0,
    moveSum: 0,
    bonusMp: 0,
    doubleMp: false,
    flatCostOne: false,
    ignoreThuLock: false,
    ignoreLava: false,
    ignoreTraps: false,
    bendedClock: false,
    cardsUsed: 0,
    rerolledFree: false,
    linhKhiPending: false,
    lavaPenaltyPending: false,
    movedHexesCount: 0,
    combatTargets: []
  };
  state.combat = null;
  state.callout = null;
}

// =====================================================================
// 1. BẮT ĐẦU VÁN ĐẤU & CHỌN NGƯỢC VỊ TRÍ XUẤT PHÁT (DRAFT)
// =====================================================================
export async function startGame(roomCode, rawState) {
  const state = cloneState(rawState);
  const playerIds = Object.keys(state.players);
  if (playerIds.length < 1) throw new Error('Cần ít nhất 1 người chơi!');

  for (const pid of playerIds) {
    const p = state.players[pid];
    p.hexId = null;
    p.hp = 3;
    p.cooldownTD = 0;
    p.cooldownHidden = 0;
    p.hiddenUses = 0;
    p.hiddenRevealed = false;
    p.revealedVariant = null;
    p.handCount = 0;
    p.claimedStations = [];
    p.pendingSelf = [];
    p.statusFlags = {};
    const priv = await getPrivateData(roomCode, pid);
    await savePrivateData(roomCode, pid, { hiddenChoice: priv.hiddenChoice || 'A', hand: [] });
  }
  state.lastEvent = null;
  state.winnerId = null;
  state.combat = null;
  state.mapVersion = '3.1';
  for (const p of Object.values(state.players)) p.gateProgress = 0;
  state.callout = null;

  // Tung xúc xắc sắp thứ tự lượt
  const rolls = playerIds.map(id => ({ id, roll: rollDie() + rollDie() + Math.random() * 0.01 }));
  rolls.sort((a, b) => b.roll - a.roll);
  state.turnOrder = rolls.map(r => r.id);
  state.draftOrder = [...state.turnOrder].reverse(); // Chọn Ngược: người đi cuối chọn ô trước
  state.draftIdx = 0;

  state.supportDeck = createShuffledSupportDeck();
  state.supportDiscard = [];
  state.eventDeck = createShuffledEventDeck();
  state.traps = [];
  state.round = 1;
  state.direction = 1;
  state.roundEventTriggered = false;
  state.turnsInRound = 0;
  state.status = 'draft';

  const orderNames = state.turnOrder.map((id, i) => `${i + 1}.${state.players[id].zodiac}`).join(' → ');
  addLog(state, `🎲 Thứ tự đi lượt: ${orderNames}.`);
  addLog(state, `📍 Giai đoạn Chọn Ngược vị trí: ${state.players[state.draftOrder[0]].zodiac} chọn ô XP trước!`);

  await savePublicState(roomCode, state);
}

export async function pickStartHex(roomCode, rawState, playerId, hexId) {
  const state = cloneState(rawState);
  if (state.status !== 'draft') return;
  if (state.draftOrder[state.draftIdx] !== playerId) return;
  if (!START_HEXES.includes(hexId)) return;

  state.players[playerId].hexId = hexId;
  addLog(state, `📍 ${state.players[playerId].zodiac} xuất phát tại ${hexId}.`);
  state.draftIdx += 1;

  if (state.draftIdx >= state.draftOrder.length) {
    state.status = 'playing';
    state.currentTurnIdx = 0;
    initNewTurn(state);
    addLog(state, `🏁 Cuộc đua bắt đầu! Lượt của ${state.players[state.turn.playerId].zodiac}.`);
  }

  await savePublicState(roomCode, state);
}

// =====================================================================
// 2. BƯỚC 1 – TUNG 4D6 & BƯỚC 2 – CHIA 2 QUAY KIM / 2 MP
// =====================================================================
export async function rollFourDice(roomCode, rawState) {
  const state = cloneState(rawState);
  if (!state.turn || state.turn.phase !== 'STEP1_ROLL') return;

  const p = state.players[state.turn.playerId];
  state.turn.dice = [rollDie(), rollDie(), rollDie(), rollDie()];
  state.turn.clockIndices = [0, 1];
  state.turn.phase = 'STEP2_SPLIT';
  addLog(state, `🎲 ${p.zodiac} tung 4d6 ra [${state.turn.dice.join(', ')}].`);
  await savePublicState(roomCode, state);
}

export async function rerollSelectedDice(roomCode, rawState, indices, useFreeSkill = false, cardIndex = null) {
  const state = cloneState(rawState);
  if (!state.turn || state.turn.phase !== 'STEP2_SPLIT') return;
  if (!indices || indices.length === 0 || indices.length > 2) return;

  const pid = state.turn.playerId;
  const p = state.players[pid];

  if (useFreeSkill) {
    if (!p.pendingSelf.includes('HOI_THIEN') || state.turn.rerolledFree) return;
    p.pendingSelf = p.pendingSelf.filter(x => x !== 'HOI_THIEN');
    state.turn.rerolledFree = true;
    addLog(state, `✨ ${p.zodiac} dùng Phúc Lộc tung lại ${indices.length} viên xúc xắc!`);
  } else {
    if (state.turn.cardsUsed >= 2) throw new Error('Đã dùng tối đa 2 Thẻ Hỗ Trợ lượt này!');
    const priv = await getPrivateData(roomCode, pid);
    const hand = toArray(priv.hand);
    if (hand[cardIndex] !== 'DOI_VAN') return;
    hand.splice(cardIndex, 1);
    state.supportDiscard.push('DOI_VAN');
    p.handCount = hand.length;
    state.turn.cardsUsed += 1;
    await savePrivateData(roomCode, pid, { ...priv, hand });
    addLog(state, `🃏 ${p.zodiac} dùng Đổi Vận tung lại ${indices.length} viên xúc xắc!`);
  }

  for (const idx of indices) {
    state.turn.dice[idx] = rollDie();
  }
  addLog(state, `🎲 Xúc xắc mới: [${state.turn.dice.join(', ')}].`);
  await savePublicState(roomCode, state);
}

export async function confirmDiceSplit(roomCode, rawState, clockIndices) {
  const state = cloneState(rawState);
  if (!state.turn || state.turn.phase !== 'STEP2_SPLIT') return;
  if (!clockIndices || clockIndices.length !== 2) return;

  const dice = state.turn.dice;
  const moveIndices = [0, 1, 2, 3].filter(i => !clockIndices.includes(i));
  const clockSum = dice[clockIndices[0]] + dice[clockIndices[1]];
  const moveSum = dice[moveIndices[0]] + dice[moveIndices[1]];
  const isMovePair = dice[moveIndices[0]] === dice[moveIndices[1]];

  state.turn.clockIndices = clockIndices;
  state.turn.clockSum = clockSum;
  state.turn.moveSum = moveSum;
  state.turn.isMovePair = isMovePair;

  // Bước 3: Quay kim đồng hồ ngay
  state.clockHour = ((state.clockHour - 1 + clockSum) % 24) + 1;
  state.turn.phase = 'STEP3_CLOCK';

  const hrZodiac = ZODIACS[(state.clockHour - 1) % 12];
  const hrKind = state.clockHour <= 12 ? 'Thiên' : 'Địa';
  addLog(state, `⏰ Kim quay +${clockSum}h → dừng tại ${state.clockHour}h (${hrZodiac} – ${hrKind}). Nhóm Di chuyển: ${moveSum} MP.`);

  await savePublicState(roomCode, state);
}

// Bẻ Kim Đồng Hồ ở Bước 3
export async function bendClockCard(roomCode, rawState, delta, cardIndex) {
  const state = cloneState(rawState);
  if (!state.turn || state.turn.phase !== 'STEP3_CLOCK') return;
  if (state.turn.cardsUsed >= 2) throw new Error('Đã dùng tối đa 2 Thẻ Hỗ Trợ lượt này!');

  const pid = state.turn.playerId;
  const priv = await getPrivateData(roomCode, pid);
  const hand = toArray(priv.hand);
  if (hand[cardIndex] !== 'BE_KIM') return;
  hand.splice(cardIndex, 1);
  state.supportDiscard.push('BE_KIM');
  state.players[pid].handCount = hand.length;
  state.turn.cardsUsed += 1;
  await savePrivateData(roomCode, pid, { ...priv, hand });

  state.clockHour = ((state.clockHour - 1 + delta + 24) % 24) + 1;
  state.turn.bendedClock = true;
  addLog(state, `🃏 ${state.players[pid].zodiac} dùng Bẻ Kim Đồng Hồ (${delta > 0 ? '+1h' : '-1h'}) → ${state.clockHour}h (không kích hoạt vạch mới).`);
  await savePublicState(roomCode, state);
}

// =====================================================================
// 3. BƯỚC 4 – KÍCH HOẠT GIỜ ĐỒNG HỒ, SỰ KIỆN & LINH KHÍ THỜI GIAN
// =====================================================================
async function triggerEventCard(roomCode, state, graph, actorId) {
  if (state.eventDeck.length === 0) state.eventDeck = createShuffledEventDeck();
  const evId = state.eventDeck.pop();
  const ev = EVENT_CARDS.find(e => e.id === evId);
  state.lastEvent = ev;
  state.roundEventTriggered = true;
  addLog(state, `⚡ SỰ KIỆN: ${ev.name} — ${ev.desc}`);

  const playersArr = Object.values(state.players);
  const { leaders, lastPlace } = getRankings(state, graph);

  switch (evId) {
    case 'NHAT_THUC':
      state.clockHour = ((state.clockHour - 1 - 6 + 24) % 24) + 1;
      break;
    case 'NGUYET_THUC':
      for (const p of playersArr) p.cooldownTD = 0;
      break;
    case 'KHE_NUT': {
      const extra = rollDie();
      if (state.turn) state.turn.bonusMp += extra;
      addLog(state, `⚡ Khe Nứt Thời Gian cộng thêm +${extra} MP!`);
      break;
    }
    case 'MUA_LOC':
      for (const p of playersArr) {
        const s = graph.nodes[p.hexId]?.season;
        if (s === 'XUAN' || s === 'HA') await drawSupportCards(roomCode, state, p.id, 1);
      }
      break;
    case 'THIEN_THACH':
      for (const p of playersArr) {
        const t = graph.nodes[p.hexId]?.terrain;
        if (['xuan_plain', 'ha_plain', 'thu_plain', 'dong_plain'].includes(t)) {
          p.hexId = computePushBackHex(graph, p.hexId, 2, false);
        }
      }
      break;
    case 'BAO_TUYET':
      state.blizzardRoundsLeft = 1;
      break;
    case 'HUYET_CHIEN': {
      const leaderDist = graph.nodes[state.players[leaders[0]].hexId].distToFinish;
      for (const lid of lastPlace) {
        if (leaders.includes(lid)) continue;
        const p = state.players[lid];
        const diff = Math.max(0, graph.nodes[p.hexId].distToFinish - leaderDist - 1);
        const steps = Math.min(6, diff);
        if (steps > 0) applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, steps), 'Huyết Chiến');
      }
      break;
    }
    case 'THOI_KHONG':
      if (state.direction === -1) {
        state.direction = 1;
        state.reverseUntilPlayerId = null;
        state.reverseRoundsLeft = 0;
      } else {
        state.direction = -1;
        state.reverseRoundsLeft = 1;
      }
      break;
    case 'DAI_XA':
      for (const p of playersArr) {
        if (p.hp === 1) healHp(state, graph, p.id, 1);
      }
      break;
    case 'CUONG_PHONG':
      for (const p of playersArr) {
        applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, 2), 'Cuồng Phong');
        if (p.hexId === graph.finishId) {
          state.status = 'finished';
          state.winnerId = p.id;
        }
      }
      break;
    case 'SUONG_MU_HL': {
      const order = state.turnOrder;
      if (order.length >= 2) {
        const hands = {};
        for (const id of order) hands[id] = toArray((await getPrivateData(roomCode, id)).hand);
        const passed = {};
        for (let i = 0; i < order.length; i++) {
          const fromId = order[i];
          const toId = order[(i + 1) % order.length];
          if (hands[fromId].length > 0) {
            const idx = Math.floor(Math.random() * hands[fromId].length);
            passed[toId] = hands[fromId].splice(idx, 1)[0];
          }
        }
        for (const id of order) {
          if (passed[id]) hands[id].push(passed[id]);
          const priv = await getPrivateData(roomCode, id);
          state.players[id].handCount = hands[id].length;
          await savePrivateData(roomCode, id, { ...priv, hand: hands[id] });
        }
      }
      break;
    }
    case 'THIEN_LOI':
      for (const lid of leaders) {
        const p = state.players[lid];
        p.hexId = computePushBackHex(graph, p.hexId, 3, false);
      }
      break;
  }
}

async function triggerZodiacClockSkill(roomCode, state, graph, owner, isThien) {
  const z = owner.zodiac;
  const info = isThien ? ZODIAC_DATA[z].thien : ZODIAC_DATA[z].dia;
  addLog(state, `🌟 Kích hoạt ${z} (${isThien ? 'Thiên' : 'Địa'}): ${info.name} — ${info.desc}`);

  if (isThien && z !== 'Thìn' && z !== 'Thân') {
    state.lastThienZodiac = z;
  }

  // Các kỹ năng [Tự thân] lưu vào pendingSelf
  if (info.type === 'Tự thân') {
    const key = `${z}_${isThien ? 'THIEN' : 'DIA'}`;
    if (z === 'Hợi' && isThien) {
      if (!owner.pendingSelf.includes('HOI_THIEN')) owner.pendingSelf.push('HOI_THIEN');
    } else if (z === 'Tỵ' && isThien) {
      // Lột xác xóa debuff và rút 1 thẻ ngay
      delete owner.statusFlags.poisoned;
      await drawSupportCards(roomCode, state, owner.id, 1);
    } else {
      if (!owner.pendingSelf.includes(key)) owner.pendingSelf.push(key);
    }
    owner.cooldownTD = 1;
    return;
  }

  // Các kỹ năng [Tức thời] và [Toàn cục]
  const others = Object.values(state.players).filter(o => o.id !== owner.id && !o.statusFlags.immuneUntilNextTurn);
  const nearest = [...others].sort((a, b) => getHexDistance(graph, owner.hexId, a.hexId) - getHexDistance(graph, owner.hexId, b.hexId))[0];

  if (z === 'Tý' && isThien) {
    owner.statusFlags.immuneUntilNextTurn = true;
  } else if (z === 'Sửu' && !isThien) {
    for (const o of others) {
      if (getHexDistance(graph, owner.hexId, o.hexId) <= 1) {
        o.hexId = computePushBackHex(graph, o.hexId, 1, false);
      }
    }
  } else if (z === 'Dần' && isThien) {
    let cleared = 0;
    for (const o of others) {
      if (o.pendingSelf.length > 0) {
        cleared += o.pendingSelf.length;
        o.pendingSelf = [];
      }
    }
    if (cleared === 0) owner.statusFlags.danRoarBonus = 2;
  } else if (z === 'Mão' && isThien) {
    if (nearest && graph.nodes[nearest.hexId].distToFinish < graph.nodes[owner.hexId].distToFinish) {
      if (applySkillSwap(state, graph, owner, nearest, 'Ảo Ảnh')) {
        addLog(state, `🐇 Mão hoán đổi vị trí với ${nearest.zodiac}!`);
      }
    }
  } else if (z === 'Thìn' && isThien) {
    if (state.direction === -1) {
      state.direction = 1;
      state.reverseUntilPlayerId = null;
      state.reverseRoundsLeft = 0;
      owner.cooldownTD = 1;
    } else {
      state.direction = -1;
      state.reverseUntilPlayerId = owner.id;
      return; // [Toàn cục] chưa đặt hồi chiêu đến khi quay lại Thìn
    }
  } else if (z === 'Thìn' && !isThien) {
    if (!placeTrap(state, owner.hexId, 'VUNG_CAM', owner.id)) addLog(state, '🛡️ Cầu Dài an toàn: không thể đặt Vùng Cấm tại đây.');
  } else if (z === 'Tỵ' && !isThien) {
    if (!placeTrap(state, owner.hexId, 'DOC', owner.id)) addLog(state, '🛡️ Cầu Dài an toàn: không thể đặt Bẫy Độc tại đây.');
  } else if (z === 'Mùi' && isThien) {
    applySkillRelocation(state, graph, owner, computeAdvanceHex(graph, owner.hexId, 1), 'Cầu Nguyện');
    if (nearest) applySkillRelocation(state, graph, nearest, computeAdvanceHex(graph, nearest.hexId, 1), 'Cầu Nguyện');
  } else if (z === 'Thân' && isThien) {
    if (state.lastThienZodiac && state.lastThienZodiac !== 'Thìn') {
      addLog(state, `🐒 Thân sao chép kỹ năng Thiên của ${state.lastThienZodiac}!`);
      const fakeOwner = { ...owner, zodiac: state.lastThienZodiac };
      await triggerZodiacClockSkill(roomCode, state, graph, fakeOwner, true);
      owner.hexId = fakeOwner.hexId;
      owner.gateProgress = fakeOwner.gateProgress;
      owner.statusFlags = fakeOwner.statusFlags;
      owner.pendingSelf = fakeOwner.pendingSelf;
    } else if (state.turn.playerId === owner.id) {
      state.turn.bonusMp += 2;
    }
  } else if (z === 'Thân' && !isThien) {
    if (nearest) {
      const stolen = await stealRandomCard(roomCode, state, owner.id, nearest.id);
      if (stolen) addLog(state, `🐒 Thân trộm được [${stolen}] từ ${nearest.zodiac}!`);
      else {
        nearest.hexId = computePushBackHex(graph, nearest.hexId, 1, false);
        addLog(state, `🐒 ${nearest.zodiac} không có thẻ nên bị Thân đẩy lùi 1 ô!`);
      }
    }
  } else if (z === 'Dậu' && isThien) {
    state.clockHour = ((state.clockHour - 1 + 1) % 24) + 1;
    await drawSupportCards(roomCode, state, owner.id, 1);
  } else if (z === 'Dậu' && !isThien) {
    const count = state.traps.length;
    state.traps = [];
    const steps = Math.max(1, Math.min(3, count));
    applySkillRelocation(state, graph, owner, computeAdvanceHex(graph, owner.hexId, steps), 'Gáy Sáng');
  } else if (z === 'Tuất' && isThien) {
    applySkillRelocation(state, graph, owner, computeAdvanceHex(graph, owner.hexId, 2), 'Trung Nghĩa');
  } else if (z === 'Tuất' && !isThien) {
    owner.statusFlags.guardBonus = 3;
  }

  owner.cooldownTD = 1;
}

export async function proceedToStep4(roomCode, rawState, graph) {
  const state = cloneState(rawState);
  if (!state.turn || state.turn.phase !== 'STEP3_CLOCK') return;

  state.turn.phase = 'STEP4_ACTION';

  if (!state.turn.bendedClock) {
    const hrZodiac = ZODIACS[(state.clockHour - 1) % 12];
    const isThien = state.clockHour <= 12;
    const owner = Object.values(state.players).find(p => p.zodiac === hrZodiac);

    if (owner) {
      if (owner.cooldownTD > 0) {
        addLog(state, `⏳ ${owner.zodiac} đang hồi chiêu Thiên/Địa — không kích hoạt.`);
      } else {
        const info = isThien ? ZODIAC_DATA[owner.zodiac].thien : ZODIAC_DATA[owner.zodiac].dia;
        if (owner.isBot) {
          // Bot tự quyết: nếu chiêu Tự thân mà không phải lượt của Bot, lưu lại cho vòng sau
          if (info.type === 'Tự thân' && state.turn.playerId !== owner.id) {
            owner.savedSkill = { isThien, zodiac: owner.zodiac, name: info.name, type: info.type, desc: info.desc };
            addLog(state, `💾 ${owner.zodiac} (Bot) quyết định GIỮ LẠI kỹ năng ${isThien ? 'Thiên' : 'Địa'} [${info.name}] cho vòng sau!`);
          } else {
            await triggerZodiacClockSkill(roomCode, state, graph, owner, isThien);
          }
        } else {
          // Người chơi được lựa chọn: Sử dụng luôn hoặc Giữ lại cho vòng sau
          state.pendingSkillChoice = {
            playerId: owner.id,
            zodiac: owner.zodiac,
            isThien,
            name: info.name,
            type: info.type,
            desc: info.desc
          };
          addLog(state, `⏰ Vào giờ ${owner.zodiac} (${isThien ? 'Thiên' : 'Địa'} – ${info.name})! ${owner.zodiac} có thể chọn DÙNG LUÔN hoặc GIỮ LẠI cho vòng sau.`);
        }
      }
    } else {
      // Giờ Trống
      if (!state.roundEventTriggered) {
        await triggerEventCard(roomCode, state, graph, state.turn.playerId);
      } else {
        // Chốt 3A: Linh Khí Thời Gian
        state.turn.linhKhiPending = true;
        addLog(state, `✨ Giờ Trống (đã có Sự Kiện vòng này) → ${state.players[state.turn.playerId].zodiac} nhận Linh Khí Thời Gian!`);
      }
    }
  }

  await savePublicState(roomCode, state);
}

// Giải quyết lựa chọn của con giáp khi vào giờ: Dùng luôn hoặc Giữ lại cho vòng sau
export async function resolveSkillChoice(roomCode, rawState, graph, choice) {
  const state = cloneState(rawState);
  if (!state.pendingSkillChoice) return;
  const sc = state.pendingSkillChoice;
  const owner = state.players[sc.playerId];
  if (!owner) return;

  const isThien = sc.isThien;
  const z = sc.zodiac;
  const name = sc.name;

  if (choice === 'USE') {
    delete state.pendingSkillChoice;
    addLog(state, `⚡ ${owner.zodiac} (${owner.name}) chọn SỬ DỤNG LUÔN kỹ năng [${name}]!`);
    await triggerZodiacClockSkill(roomCode, state, graph, owner, isThien);
  } else if (choice === 'SAVE') {
    owner.savedSkill = { isThien, zodiac: z, name: sc.name, type: sc.type, desc: sc.desc };
    delete state.pendingSkillChoice;
    addLog(state, `💾 ${owner.zodiac} (${owner.name}) đã GIỮ LẠI kỹ năng ${isThien ? 'Thiên' : 'Địa'} [${name}] cho vòng sau (không cần quay vào giờ nữa)!`);
  } else if (choice === 'KEEP_OLD') {
    delete state.pendingSkillChoice;
    addLog(state, `👌 ${owner.zodiac} giữ nguyên kỹ năng đang lưu trữ [${owner.savedSkill?.name}].`);
  }

  await savePublicState(roomCode, state);
}

// Kích hoạt kỹ năng Thiên/Địa đã lưu trữ từ trước
export async function useSavedSkill(roomCode, rawState, graph, playerId) {
  const state = cloneState(rawState);
  const p = state.players[playerId];
  if (!p) throw new Error('Không tìm thấy người chơi!');
  if (!p.savedSkill) throw new Error('Bạn không có kỹ năng nào đang được giữ!');
  if (p.cooldownTD > 0) throw new Error('Kỹ năng Thiên/Địa đang hồi chiêu!');

  const saved = p.savedSkill;
  delete p.savedSkill;

  addLog(state, `✨ ${p.zodiac} (${p.name}) KÍCH HOẠT KỸ NĂNG ĐÃ GIỮ: ${saved.isThien ? 'Thiên' : 'Địa'} [${saved.name}]!`);

  // Nếu đang ở Bước 5 của chính mình và là kỹ năng Tự thân, áp dụng trực tiếp hiệu ứng
  const isMyStep5 = state.turn && state.turn.playerId === playerId && state.turn.phase === 'STEP5_MOVE';
  if (isMyStep5 && saved.type === 'Tự thân') {
    applySelfSkillEffectInStep5(state, graph, p, saved.zodiac, saved.isThien);
    p.cooldownTD = 1;
  } else {
    await triggerZodiacClockSkill(roomCode, state, graph, p, saved.isThien);
  }

  await savePublicState(roomCode, state);
}

function applySelfSkillEffectInStep5(state, graph, p, zodiac, isThien) {
  if (zodiac === 'Sửu' && isThien) {
    const rankings = getRankings(state, graph);
    const isLast = rankings.lastPlace.includes(p.id);
    const leaderDist = graph.nodes[rankings.leaders[0]]?.distToFinish ?? 0;
    const myDist = graph.nodes[p.hexId]?.distToFinish ?? 0;
    const bonus = (isLast || (myDist - leaderDist >= 4)) ? 3 : 1;
    state.turn.bonusMp += bonus;
    addLog(state, `🐂 Sửu kích hoạt Thiên Mệnh (+${bonus} MP)!`);
  } else if (zodiac === 'Ngọ' && isThien) {
    if (state.turn.isMovePair) {
      state.turn.bonusMp += 4;
      addLog(state, `🐎 Ngọ kích hoạt Thiên Mã (đôi xúc xắc → +4 MP)!`);
    } else {
      addLog(state, `🐎 Ngọ dùng Thiên Mã nhưng nhóm Di chuyển không phải xúc xắc đôi.`);
    }
  } else if (zodiac === 'Ngọ' && !isThien) {
    state.turn.flatCostOne = true;
    state.turn.ignoreThuLock = true;
    state.turn.ignoreLava = true;
    state.turn.ignoreTraps = true;
    addLog(state, `🐎 Ngọ kích hoạt Nước Đại (mọi ô 1 MP, xuyên bẫy)!`);
  } else if (zodiac === 'Tý' && !isThien) {
    const others = Object.values(state.players).filter(o => o.id !== p.id);
    const myDist = graph.nodes[p.hexId]?.distToFinish ?? 999;
    const ahead = others.filter(o => (graph.nodes[o.hexId]?.distToFinish ?? 999) < myDist)
      .sort((a, b) => getHexDistance(graph, p.hexId, a.hexId) - getHexDistance(graph, p.hexId, b.hexId));
    if (ahead[0] && getHexDistance(graph, p.hexId, ahead[0].hexId) <= 5) {
      const target = ahead[0];
      const jumpHex = computePushBackHex(graph, target.hexId, 1, false);
      applySkillRelocation(state, graph, p, jumpHex, 'Đào Hang');
      addLog(state, `🐀 Tý kích hoạt Đào Hang nhảy tới sau lưng ${target.zodiac}!`);
    }
  } else if (zodiac === 'Mão' && !isThien) {
    state.turn.bonusMp += 2;
    addLog(state, `🐇 Mão kích hoạt Nhảy Bật (+2 MP)!`);
  } else if (zodiac === 'Dần' && !isThien) {
    state.turn.danHuntActive = true;
    addLog(state, `🐅 Dần kích hoạt Vồ Mồi (lao tới đối thủ trong 2 ô với +2 điểm)!`);
  } else if (zodiac === 'Tỵ' && isThien) {
    delete p.statusFlags.poisoned;
    addLog(state, `🐍 Tỵ Lột Xác xóa bỏ độc và hiệu ứng bất lợi!`);
  } else if (zodiac === 'Hợi' && !isThien) {
    p.pendingSelf = toArray(p.pendingSelf);
    if (!p.pendingSelf.includes('Hợi_DIA')) p.pendingSelf.push('Hợi_DIA');
    addLog(state, `🐷 Hợi kích hoạt An Nhàn (hồi 1❤️ nếu đi ≤ 2 ô hoặc đứng yên).`);
  } else if (zodiac === 'Mùi' && !isThien) {
    p.pendingSelf = toArray(p.pendingSelf);
    if (!p.pendingSelf.includes('Mùi_DIA')) p.pendingSelf.push('Mùi_DIA');
    addLog(state, `🐑 Mùi kích hoạt Bầy Đàn (rút 1 Thẻ nếu dừng cạnh người khác).`);
  }
}

export async function chooseLinhKhi(roomCode, rawState, choice) {
  const state = cloneState(rawState);
  if (!state.turn || !state.turn.linhKhiPending) return;
  const p = state.players[state.turn.playerId];
  state.turn.linhKhiPending = false;

  if (choice === 'MP') {
    state.turn.bonusMp += 1;
    addLog(state, `✨ ${p.zodiac} chọn Linh Khí: +1 MP lượt này.`);
  } else {
    const delta = choice === 'CLOCK_PLUS' ? 1 : -1;
    state.clockHour = ((state.clockHour - 1 + delta + 24) % 24) + 1;
    addLog(state, `✨ ${p.zodiac} chọn Linh Khí: xoay kim ${delta > 0 ? '+1h' : '-1h'} → ${state.clockHour}h.`);
  }
  await savePublicState(roomCode, state);
}

// =====================================================================
// 4. DÙNG THẺ HỖ TRỢ (BƯỚC 4 & BƯỚC 5) + BỎ THẺ KHI QUÁ 4 LÁ
// =====================================================================
export async function playSupportCard(roomCode, rawState, graph, playerId, cardIndex, targetId = null) {
  const state = cloneState(rawState);
  const turn = state.turn;
  if (!turn || turn.playerId !== playerId) throw new Error('Không phải lượt của bạn!');
  if (turn.cardsUsed >= 2) throw new Error('Mỗi lượt chỉ được dùng tối đa 2 Thẻ Hỗ Trợ!');

  const priv = await getPrivateData(roomCode, playerId);
  const hand = toArray(priv.hand);
  const cardId = hand[cardIndex];
  const def = SUPPORT_CARD_DEFS[cardId];
  if (!def) return;

  const p = state.players[playerId];
  const others = Object.values(state.players).filter(o => o.id !== playerId && !o.statusFlags.immuneUntilNextTurn);

  const isActionCard = ['THAN_HANH', 'GIO_MUA', 'HOI_SINH', 'DICH_CHUYEN', 'CAM_BAY', 'KHOA_CHIEU', 'DOAT_BAO'].includes(cardId)
    || ['STEP4', 'STEP5', 'ACTION'].includes(def.timing);

  if (isActionCard) {
    if (turn.phase !== 'STEP4_ACTION' && turn.phase !== 'STEP5_MOVE') {
      throw new Error(`Thẻ ${def.name} chỉ dùng trong lượt của bạn ở Bước 4 hoặc Bước 5!`);
    }
  } else if (def.timing === 'STEP2' && turn.phase !== 'STEP2_SPLIT') {
    throw new Error(`Thẻ ${def.name} chỉ dùng ở Bước 2!`);
  } else if (def.timing === 'STEP3' && turn.phase !== 'STEP3_CLOCK') {
    throw new Error(`Thẻ ${def.name} chỉ dùng ở Bước 3!`);
  }

  let msg = `🃏 ${p.zodiac} dùng ${def.name}: `;
  if (cardId === 'THAN_HANH') {
    turn.bonusMp += 3;
    msg += '+3 MP lượt này!';
  } else if (cardId === 'GIO_MUA') {
    turn.flatCostOne = true;
    turn.ignoreThuLock = true;
    turn.ignoreLava = true;
    msg += 'bỏ qua mọi bất lợi địa hình/Mùa trong lượt này!';
  } else if (cardId === 'HOI_SINH') {
    const healed = healHp(state, graph, playerId, 1);
    msg += `hồi +${healed}❤️ (hiện ${p.hp}❤️).`;
  } else if (cardId === 'CAM_BAY') {
    if (!placeTrap(state, p.hexId, 'CAM_BAY', playerId)) {
      throw new Error('Cầu Dài là tuyến an toàn, không thể đặt Cạm Bẫy Gai tại đây!');
    }
    msg += 'đặt Cạm Bẫy Gai tại ô đang đứng!';
  } else if (cardId === 'DICH_CHUYEN') {
    const valid = others.filter(o => getHexDistance(graph, p.hexId, o.hexId) <= 3);
    const target = valid.find(o => o.id === targetId) || valid[0];
    if (!target) throw new Error('Không có ai trong phạm vi 3 ô để hoán đổi!');
    if (!applySkillSwap(state, graph, p, target, 'Dịch Chuyển Ngắn')) {
      throw new Error('Hoán đổi bị chặn vì có thể bỏ qua quá 1 checkpoint. Hãy chọn đối thủ khác hoặc đi qua cổng còn thiếu.');
    }
    msg += `hoán đổi vị trí với ${target.zodiac}!`;
  } else if (cardId === 'KHOA_CHIEU') {
    const target = others.find(o => o.id === targetId) || others[0];
    if (!target) throw new Error('Không có mục tiêu hợp lệ!');
    target.cooldownTD += 1;
    msg += `khóa hồi chiêu Thiên/Địa của ${target.zodiac} thêm 1 vòng!`;
  } else if (cardId === 'DOAT_BAO') {
    const mySeason = graph.nodes[p.hexId].season;
    const valid = others.filter(o => graph.nodes[o.hexId].season === mySeason && o.handCount > 0);
    const target = valid.find(o => o.id === targetId) || valid[0];
    if (!target) throw new Error('Không có đối thủ nào cùng Mùa đang cầm thẻ!');
    const stolen = await stealRandomCard(roomCode, state, playerId, target.id);
    msg += `cướp [${stolen}] từ ${target.zodiac}!`;
  } else {
    throw new Error('Thẻ này dùng ở thời điểm khác (tung xúc xắc, quay kim hoặc giao chiến).');
  }

  hand.splice(cardIndex, 1);
  state.supportDiscard.push(cardId);
  p.handCount = hand.length;
  turn.cardsUsed += 1;
  await savePrivateData(roomCode, playerId, { ...priv, hand });

  addLog(state, msg);
  await savePublicState(roomCode, state);
}

export async function discardCardFromHand(roomCode, rawState, playerId, cardIndex) {
  const state = cloneState(rawState);
  const priv = await getPrivateData(roomCode, playerId);
  const hand = toArray(priv.hand);
  if (cardIndex < 0 || cardIndex >= hand.length) return;
  const [removed] = hand.splice(cardIndex, 1);
  state.supportDiscard.push(removed);
  state.players[playerId].handCount = hand.length;
  await savePrivateData(roomCode, playerId, { ...priv, hand });
  addLog(state, `🗑️ ${state.players[playerId].zodiac} bỏ lá ${SUPPORT_CARD_DEFS[removed]?.name}.`);
  await savePublicState(roomCode, state);
}

// =====================================================================
// 5. KỸ NĂNG ẨN & CỬA SỔ CALL OUT (5 GIÂY)
// =====================================================================
export async function declareHiddenSkill(roomCode, rawState, graph, playerId) {
  const state = cloneState(rawState);
  const p = state.players[playerId];
  if (p.hiddenUses >= 2) throw new Error('Đã hết 2 lần dùng Kỹ năng Ẩn trong ván!');
  if (p.cooldownHidden > 0) throw new Error('Kỹ năng Ẩn đang hồi chiêu!');

  const priv = await getPrivateData(roomCode, playerId);
  const variant = priv.hiddenChoice || 'A';

  // Nếu thẻ còn úp và có đối thủ là người thật còn ≥ 2 HP -> mở cửa sổ Call Out!
  const humanOpponents = Object.values(state.players).filter(o => o.id !== playerId && !o.isBot && o.hp >= 2);
  if (!p.hiddenRevealed && humanOpponents.length > 0) {
    state.callout = {
      ownerId: playerId,
      secretVariant: variant,
      status: 'OPEN', // OPEN | COUNTER_CHECK
      callerId: null,
      guess: null,
      expiresAt: Date.now() + 8000
    };
    addLog(state, `👁️ ${p.zodiac} tuyên bố KÍCH HOẠT KỸ NĂNG ẨN! Cả bàn có thể hô Call Out (A hoặc B)!`);
    await savePublicState(roomCode, state);
    return;
  }

  // Lần dùng thứ 2 (đã lật ngửa) hoặc không có người đủ điều kiện Call Out -> kích hoạt luôn
  await executeHiddenSkillEffect(roomCode, state, graph, playerId, variant);
  await savePublicState(roomCode, state);
}

export async function submitCallOut(roomCode, rawState, graph, callerId, guessVariant) {
  const state = cloneState(rawState);
  if (!state.callout || state.callout.status !== 'OPEN') return;
  const caller = state.players[callerId];
  if (!caller || caller.hp < 2 || callerId === state.callout.ownerId) return;

  const ownerId = state.callout.ownerId;
  const owner = state.players[ownerId];

  // Kiểm tra chủ nhân có Sương Mù Che Mắt không
  const ownerPriv = await getPrivateData(roomCode, ownerId);
  const ownerHand = toArray(ownerPriv.hand);
  const fogIdx = ownerHand.indexOf('SUONG_MU');
  if (fogIdx !== -1) {
    ownerHand.splice(fogIdx, 1);
    state.supportDiscard.push('SUONG_MU');
    owner.handCount = ownerHand.length;
    await savePrivateData(roomCode, ownerId, { ...ownerPriv, hand: ownerHand });
    addLog(state, `🌫️ ${owner.zodiac} tự động phản kích bằng Sương Mù Che Mắt! Hủy Call Out của ${caller.zodiac}, thẻ Ẩn không bị lộ!`);
    const secretV = state.callout.secretVariant;
    state.callout = null;
    await executeHiddenSkillEffect(roomCode, state, graph, ownerId, secretV, true);
    await savePublicState(roomCode, state);
    return;
  }

  const correct = (guessVariant === state.callout.secretVariant);
  owner.hiddenRevealed = true;
  owner.revealedVariant = state.callout.secretVariant;
  owner.hiddenUses += 1;
  owner.cooldownHidden = 1;

  if (correct) {
    addLog(state, `🎯 CALL OUT THÀNH CÔNG! ${caller.zodiac} đoán đúng Biến thể ${guessVariant} của ${owner.zodiac}! Kỹ năng bị vô hiệu hóa!`);
    await applyDamage(roomCode, state, graph, ownerId, 'Bị Call Out trúng');
    if (caller.statusFlags.dauSafeCallout) {
      await stealRandomCard(roomCode, state, callerId, ownerId);
      applySkillRelocation(state, graph, caller, computeAdvanceHex(graph, caller.hexId, 1), 'Phá Án');
    }
    state.callout = null;
  } else {
    addLog(state, `❌ CALL OUT SAI! ${owner.zodiac} thực chất cầm Biến thể ${state.callout.secretVariant}!`);
    if (caller.statusFlags.dauSafeCallout) {
      addLog(state, `🐓 ${caller.zodiac} được Phá Án bảo vệ, không mất Mệnh Bài!`);
      delete caller.statusFlags.dauSafeCallout;
    } else {
      await applyDamage(roomCode, state, graph, callerId, 'Đoán sai Call Out');
    }
    const secretV = state.callout.secretVariant;
    state.callout = null;
    await executeHiddenSkillEffect(roomCode, state, graph, ownerId, secretV, false, true);
  }
  await savePublicState(roomCode, state);
}

export async function resolveCallOutNoCaller(roomCode, rawState, graph) {
  const state = cloneState(rawState);
  if (!state.callout) return;
  const { ownerId, secretVariant } = state.callout;
  state.callout = null;
  await executeHiddenSkillEffect(roomCode, state, graph, ownerId, secretVariant);
  await savePublicState(roomCode, state);
}

async function executeHiddenSkillEffect(roomCode, state, graph, playerId, variant, keepHidden = false, alreadyCounted = false) {
  const p = state.players[playerId];
  const z = p.zodiac;
  const info = variant === 'A' ? ZODIAC_DATA[z].hiddenA : ZODIAC_DATA[z].hiddenB;

  if (!alreadyCounted) {
    p.hiddenUses += 1;
    p.cooldownHidden = 1;
    if (!keepHidden) {
      p.hiddenRevealed = true;
      p.revealedVariant = variant;
    }
  }

  addLog(state, `🔥 KỸ NĂNG ẨN [${z} – ${variant}: ${info.name}] kích hoạt!`);
  const others = Object.values(state.players).filter(o => o.id !== playerId);
  const { leaders } = getRankings(state, graph);
  const nearest = [...others].sort((a, b) => getHexDistance(graph, p.hexId, a.hexId) - getHexDistance(graph, p.hexId, b.hexId))[0];

  if (z === 'Tý') {
    if (variant === 'A') {
      p.statusFlags.combatBonusOnce = 4;
      applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, 2), 'Ám Sát');
    } else {
      applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, 3), 'Ké Bóng');
    }
  } else if (z === 'Sửu') {
    if (variant === 'A') p.statusFlags.combatBonusOnce = Math.min(4, (3 - p.hp) * 2 + 2);
    else p.statusFlags.suuCounter = true;
  } else if (z === 'Dần') {
    if (variant === 'A') p.statusFlags.combatBonusOnce = 5;
    else if (state.turn?.playerId === playerId) state.turn.bonusMp += 4;
  } else if (z === 'Mão') {
    if (variant === 'A') p.statusFlags.maoCancelCombat = true;
    else if (nearest) {
      const target = others.find(o => {
        const d = getHexDistance(graph, p.hexId, o.hexId);
        return d >= 2 && d <= 4;
      }) || nearest;
      if (!applySkillSwap(state, graph, p, target, 'Huyễn Ảnh')) {
        addLog(state, '⛔ Huyễn Ảnh không thể bỏ qua quá 1 checkpoint; vị trí được giữ nguyên.');
      }
    }
  } else if (z === 'Thìn') {
    const mySeason = graph.nodes[p.hexId].season;
    if (variant === 'A') {
      for (const o of others) {
        if (graph.nodes[o.hexId].season === mySeason) {
          o.hexId = computePushBackHex(graph, o.hexId, 2, false);
          if (o.hp > 1) await applyDamage(roomCode, state, graph, o.id, 'Thiên Phạt của Thìn');
        }
      }
    } else {
      for (const o of others) {
        if (graph.nodes[o.hexId].season !== mySeason) {
          o.hexId = computePushBackHex(graph, o.hexId, 2, false);
        }
      }
      state.direction *= -1;
    }
  } else if (z === 'Tỵ') {
    if (variant === 'A') p.statusFlags.tyYieldPoison = true;
    else p.statusFlags.tyFangCombat = true;
  } else if (z === 'Ngọ') {
    if (variant === 'A') {
      if (state.turn?.playerId === playerId) state.turn.ignoreThuLock = true;
      if (nearest) nearest.hexId = computePushBackHex(graph, nearest.hexId, 2, false);
    } else if (p.hp >= 2 && state.turn?.playerId === playerId) {
      p.hp -= 1;
      state.turn.doubleMp = true;
    }
  } else if (z === 'Mùi') {
    if (variant === 'A') {
      for (const lid of leaders) {
        if (lid !== playerId) await applyDamage(roomCode, state, graph, lid, 'Đồng Minh Kẻ Yếu của Mùi');
      }
    } else {
      applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, 2), 'Cộng Hưởng Bầy Đàn');
      if (nearest) applySkillRelocation(state, graph, nearest, computeAdvanceHex(graph, nearest.hexId, 2), 'Cộng Hưởng Bầy Đàn');
    }
  } else if (z === 'Thân') {
    if (variant === 'A') {
      p.statusFlags.combatBonusOnce = 3;
      if (nearest) await stealRandomCard(roomCode, state, playerId, nearest.id);
    } else {
      p.statusFlags.combatBonusOnce = 4;
    }
  } else if (z === 'Dậu') {
    if (variant === 'A') {
      p.statusFlags.dauSafeCallout = true;
      applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, 1), 'Phá Án');
    } else {
      await drawSupportCards(roomCode, state, playerId, 1);
      const hiddenTarget = others.find(o => !o.hiddenRevealed);
      if (hiddenTarget) {
        const hp = await getPrivateData(roomCode, hiddenTarget.id);
        addLog(state, `☀️ Ánh Sáng Sự Thật soi thấu: ${hiddenTarget.zodiac} đang cầm Biến thể ${hp.hiddenChoice}!`);
      }
    }
  } else if (z === 'Tuất') {
    if (variant === 'A') {
      for (const o of others) {
        if (getHexDistance(graph, p.hexId, o.hexId) <= 1) {
          await applyDamage(roomCode, state, graph, o.id, 'Phục Kích Biên Giới của Tuất');
          o.hexId = computePushBackHex(graph, o.hexId, 1, false);
        }
      }
    } else {
      for (const o of others) {
        if (getHexDistance(graph, p.hexId, o.hexId) <= 2) {
          o.hexId = computePushBackHex(graph, o.hexId, 2, false);
        }
      }
    }
  } else if (z === 'Hợi') {
    if (variant === 'A') {
      healHp(state, graph, playerId, 1);
      p.statusFlags.hoiSleepShield = true;
    } else {
      p.statusFlags.hoiSleepSteal = true;
      applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, 1), 'Mộng Du');
    }
  }
}

// =====================================================================
// 6. BƯỚC 5 – TÍNH MP CHÍNH XÁC, DI CHUYỂN & HIỆU ỨNG ĐỊA HÌNH / BẪY
// =====================================================================
export function calculateCurrentMp(state, graph) {
  if (!state || !state.turn) return 0;
  const p = state.players?.[state.turn.playerId];
  if (!p) return 0;
  let mp = (state.turn.moveSum || 0) + (state.turn.bonusMp || 0);

  // Mùa Đắc Địa (+1 MP)
  const season = graph?.nodes?.[p.hexId]?.season;
  if (season && SEASON_BONUS_ZODIACS[season]?.includes(p.zodiac)) {
    mp += 1;
  }
  // Nọc Độc (-3 MP)
  if (p.statusFlags?.poisoned) {
    mp = Math.max(1, mp - 3);
  }
  if (state.turn.doubleMp) {
    mp *= 2;
  }
  return Math.max(1, mp);
}

export async function proceedToStep5(roomCode, rawState, graph) {
  const state = cloneState(rawState);
  if (!state.turn) {
    throw new Error('Không tìm thấy lượt hiện tại trong dữ liệu phòng. Hãy tải lại phòng.');
  }
  if (state.turn.phase !== 'STEP4_ACTION') {
    throw new Error(`Trạng thái lượt đã thay đổi (hiện tại: ${state.turn.phase}). Hãy chờ đồng bộ rồi thử lại.`);
  }
  if (state.turn.linhKhiPending) {
    throw new Error('Hãy chọn một hiệu ứng Linh Khí Thời Gian trước khi sang Bước 5!');
  }
  if (state.pendingSkillChoice) {
    throw new Error('Chờ quyết định Dùng luôn hay Giữ lại kỹ năng giờ con giáp!');
  }

  const p = state.players[state.turn.playerId];
  if (!p) {
    throw new Error('Không tìm thấy người chơi đang giữ lượt. Hãy tải lại phòng.');
  }
  p.pendingSelf = toArray(p.pendingSelf);
  p.claimedStations = toArray(p.claimedStations);
  p.statusFlags = p.statusFlags || {};

  // Áp dụng các kỹ năng [Tự thân] đang chờ của chủ nhân
  if (p.pendingSelf.includes('Sửu_THIEN')) {
    const { lastPlace, bestDist } = getRankings(state, graph);
    const myDist = graph.nodes[p.hexId]?.distToFinish ?? 999;
    const bonus = (lastPlace.includes(p.id) || myDist - bestDist >= 4) ? 3 : 1;
    state.turn.bonusMp = (state.turn.bonusMp || 0) + bonus;
    addLog(state, `🐂 Thiên Mệnh kích hoạt: Sửu nhận +${bonus} MP!`);
  }
  if (p.pendingSelf.includes('Ngọ_THIEN') && state.turn.isMovePair) {
    state.turn.bonusMp = (state.turn.bonusMp || 0) + 4;
    addLog(state, `🐎 Thiên Mã kích hoạt (nhóm Di chuyển ra đôi): Ngọ nhận +4 MP!`);
  }
  if (p.pendingSelf.includes('Ngọ_DIA')) {
    state.turn.flatCostOne = true;
    state.turn.ignoreTraps = true;
    state.turn.ignoreLava = true;
    state.turn.ignoreThuLock = true;
    addLog(state, `🐎 Nước Đại kích hoạt: Ngọ đi xuyên bẫy và mọi địa hình tốn 1 MP!`);
  }
  if (p.pendingSelf.includes('Tý_DIA')) {
    // Đào Hang: nhảy tới sau lưng người gần nhất phía trước (tối đa 5 ô)
    const myDist = graph.nodes[p.hexId]?.distToFinish ?? 999;
    const ahead = Object.values(state.players)
      .filter(o => o.id !== p.id && (graph.nodes[o.hexId]?.distToFinish ?? 999) < myDist)
      .sort((a, b) => (graph.nodes[b.hexId]?.distToFinish ?? 999) - (graph.nodes[a.hexId]?.distToFinish ?? 999))[0];
    if (ahead) {
      const aheadDist = graph.nodes[ahead.hexId]?.distToFinish ?? 999;
      const steps = Math.min(5, Math.max(1, myDist - aheadDist - 1));
      applySkillRelocation(state, graph, p, computeAdvanceHex(graph, p.hexId, steps), 'Đào Hang');
      addLog(state, `🐀 Đào Hang kích hoạt: Tý nhảy tiến +${steps} ô bám đuôi ${ahead.zodiac}!`);
    }
  }

  if (p.pendingSelf.includes('Mão_DIA')) {
    const nearCount = Object.values(state.players).filter(o => o.id !== p.id && getHexDistance(graph, p.hexId, o.hexId) <= 3).length;
    if (nearCount > 0) {
      state.turn.bonusMp = (state.turn.bonusMp || 0) + nearCount * 2;
      addLog(state, `🐇 Nhảy Bật kích hoạt: Mão nhận +${nearCount * 2} MP!`);
    }
  }
  if (p.pendingSelf.includes('Dần_DIA')) {
    p.statusFlags.combatBonusOnce = (p.statusFlags.combatBonusOnce || 0) + 2;
    addLog(state, `🐯 Vồ Mồi sẵn sàng: Dần nhận +2 điểm nếu giao chiến lượt này!`);
  }
  // Xóa các pendingSelf đã dùng (giữ lại Hợi Địa / Mùi Địa kiểm tra cuối di chuyển)
  p.pendingSelf = p.pendingSelf.filter(x => ['Hợi_DIA', 'Mùi_DIA'].includes(x));
  state.turn.phase = 'STEP5_MOVE';
  addLog(state, `➡️ ${p.zodiac} đã chuyển sang Bước 5 – Di chuyển (${calculateCurrentMp(state, graph)} MP).`);

  console.info('[STEP4 → STEP5] Prepared transition; writing turn/player patch to Firebase.', {
    roomCode,
    playerId: p.id,
    phase: state.turn.phase,
    mp: calculateCurrentMp(state, graph)
  });
  await savePublicStatePatch(roomCode, {
    turn: state.turn,
    logs: state.logs,
    [`players/${p.id}`]: p
  });
  console.info('[STEP4 → STEP5] Firebase acknowledged the STEP5_MOVE transition.', {
    roomCode,
    playerId: p.id
  });
  return state;
}

export async function executeMove(roomCode, rawState, graph, targetHexId) {
  const state = cloneState(rawState);
  if (!state.turn || state.turn.phase !== 'STEP5_MOVE') return;

  const pid = state.turn.playerId;
  const p = state.players[pid];
  const startHexId = p?.hexId;
  if (!p || !graph.nodes[startHexId]) {
    throw new Error('Không xác định được vị trí hiện tại của quân cờ. Hãy tải lại phòng và kiểm tra trạng thái người chơi.');
  }
  if (!graph.nodes[targetHexId]) {
    throw new Error('Ô đích không tồn tại trên bản đồ. Hãy chọn một ô viền xanh.');
  }
  const others = Object.values(state.players).filter(o => o.id !== pid);

  let finalHex = startHexId;
  let movedSteps = 0;

  if (targetHexId !== startHexId) {
    const mp = calculateCurrentMp(state, graph);
    const extraCost = state.blizzardRoundsLeft > 0 ? 1 : 0;
    const { reachable, pathByHex } = getReachableHexes(graph, startHexId, mp, {
      extraCost,
      flatCostOne: state.turn.flatCostOne,
      gateProgress: p.gateProgress ?? 12
    });
    if (!reachable.has(targetHexId)) {
      throw new Error(`Ô ${targetHexId} hiện không nằm trong tầm di chuyển (${mp} MP). Hãy chọn một ô đích đang được viền xanh.`);
    }

    const path = pathByHex[targetHexId] || [];
    if (path.length === 0) {
      throw new Error('Không tìm được đường đi tới ô đã chọn. Hãy thử chọn ô khác.');
    }
    let prevStep = startHexId;

    for (const stepHex of path) {
      finalHex = stepHex;
      movedSteps += 1;
      const node = graph.nodes[stepHex];

      // Ghi nhận checkpoint theo đúng thứ tự khi đi qua từng ô.
      if (node.checkpointIndex === p.gateProgress) {
        const checkpoint = ALL_CHECKPOINTS[p.gateProgress];
        p.gateProgress += 1;
        if (checkpoint) addLog(state, `🏁 ${p.zodiac} vượt ${checkpoint.name}! Tiến độ ${p.gateProgress}/12.`);
      }

      // 1. Trạm Rút Thẻ (đi qua hoặc dừng đều tính 1 lần mỗi ván)
      if ((node.terrain === 'station_sm' || node.terrain === 'station_big') && !p.claimedStations.includes(stepHex)) {
        const qty = node.terrain === 'station_big' ? 2 : 1;
        p.claimedStations.push(stepHex);
        const cards = await drawSupportCards(roomCode, state, pid, qty);
        addLog(state, `🎁 ${p.zodiac} qua Trạm Rút Thẻ nhận ${cards.length} lá!`);
      }

      // 2. Token Bẫy
      const trapIdx = state.traps.findIndex(t => t.hexId === stepHex && t.ownerId !== pid);
      if (trapIdx !== -1 && !state.turn.ignoreTraps && node.terrain !== 'bridge_long') {
        const [trap] = state.traps.splice(trapIdx, 1);
        if (trap.type === 'DOC') {
          p.statusFlags.poisoned = true;
          addLog(state, `☠️ ${p.zodiac} dẫm phải Bẫy Độc! Lượt sau bị -3 MP.`);
        } else {
          addLog(state, `🪤 ${p.zodiac} dẫm phải ${trap.type === 'VUNG_CAM' ? 'Vùng Cấm' : 'Cạm Bẫy Gai'} và bị chặn đứng!`);
          break;
        }
      }

      // 3. Mùa Thu: đi ngang qua Vùng Khiêu Chiến 1 ô bị khóa chân giao chiến
      if (node.season === 'THU' && !state.turn.ignoreThuLock) {
        const blockedBy = others.find(o => !o?.statusFlags?.immuneUntilNextTurn && getHexDistance(graph, stepHex, o.hexId) <= 1);
        if (blockedBy) {
          addLog(state, `🍁 Mùa Thu Khóa Chân! ${p.zodiac} bị ${blockedBy.zodiac} chặn lại giao chiến!`);
          break;
        }
      }

      // 4. Ô Lửa Mùa Hạ (bỏ 1 thẻ hoặc đẩy lùi 1 ô)
      if (node.terrain === 'lava' && !state.turn.ignoreLava) {
        const priv = await getPrivateData(roomCode, pid);
        const hand = toArray(priv.hand);
        if (hand.length > 0) {
          const dropped = hand.pop();
          state.supportDiscard.push(dropped);
          p.handCount = hand.length;
          await savePrivateData(roomCode, pid, { ...priv, hand });
          addLog(state, `🔥 ${p.zodiac} bước vào Ô Lửa, bị thiêu rụi 1 Thẻ Hỗ Trợ!`);
        } else {
          finalHex = prevStep;
          addLog(state, `🔥 ${p.zodiac} không có thẻ khi bước vào Ô Lửa nên bị hất lùi lại 1 ô!`);
          break;
        }
      }

      // 5. Đích Thiên Đình — yêu cầu đủ 12 checkpoint.
      if (stepHex === graph.finishId) {
        if ((p.gateProgress || 0) < 12) {
          finalHex = prevStep;
          addLog(state, `🚧 ${p.zodiac} chưa thể vào Thiên Đình vì còn thiếu checkpoint (${p.gateProgress || 0}/12)!`);
          break;
        }
        p.hexId = stepHex;
        state.status = 'finished';
        state.winnerId = pid;
        addLog(state, `🏆 CHIẾN THẮNG! ${p.zodiac} (${p.name}) là người đầu tiên chạm tới Thiên Đình!`);
        await savePublicState(roomCode, state);
        return;
      }

      prevStep = stepHex;
    }

    // 6. Băng Trơn (Mùa Đông): trượt thêm 1 ô theo hướng đi vào
    if (graph.nodes[finalHex].terrain === 'ice') {
      const slid = computeIceSlide(graph, prevStep, finalHex);
      if (slid !== finalHex) {
        const slideNode = graph.nodes[slid];
        if (slideNode.checkpointIndex !== undefined && slideNode.checkpointIndex > (p.gateProgress || 0)) {
          addLog(state, `🚧 Băng Trơn đưa ${p.zodiac} tới checkpoint chưa mở; cú trượt bị dừng lại.`);
        } else {
          if (slideNode.checkpointIndex === (p.gateProgress || 0)) {
            const checkpoint = ALL_CHECKPOINTS[p.gateProgress || 0];
            p.gateProgress = (p.gateProgress || 0) + 1;
            if (checkpoint) addLog(state, `🏁 ${p.zodiac} trượt qua ${checkpoint.name}! Tiến độ ${p.gateProgress}/12.`);
          }
          if (slid === graph.finishId && (p.gateProgress || 0) < 12) {
            addLog(state, `🚧 Băng Trơn không thể đưa ${p.zodiac} vào Thiên Đình khi chưa đủ 12 checkpoint.`);
          } else {
            finalHex = slid;
            addLog(state, `❄️ Băng Trơn! ${p.zodiac} trượt thẳng thêm 1 ô!`);
          }
        }
        if (finalHex === graph.finishId) {
          p.hexId = finalHex;
          state.status = 'finished';
          state.winnerId = pid;
          addLog(state, `🏆 CHIẾN THẮNG! ${p.zodiac} trượt băng về thẳng Thiên Đình!`);
          await savePublicState(roomCode, state);
          return;
        }
      }
    }
  }

  p.hexId = finalHex;
  state.turn.movedHexesCount = movedSteps;
  if (p.statusFlags) delete p.statusFlags.poisoned; // Hết độc sau khi đã chịu phạt ở lượt này

  // Kiểm tra kỹ năng [Tự thân] cuối di chuyển (Hợi Địa, Mùi Địa)
  if (p.pendingSelf.includes('Hợi_DIA')) {
    p.pendingSelf = p.pendingSelf.filter(x => x !== 'Hợi_DIA');
    if (movedSteps <= 2) {
      const h = healHp(state, graph, pid, 1);
      addLog(state, `🐷 An Nhàn kích hoạt (đi ${movedSteps} ô): Hợi hồi +${h}❤️!`);
    }
  }
  if (p.pendingSelf.includes('Mùi_DIA')) {
    p.pendingSelf = p.pendingSelf.filter(x => x !== 'Mùi_DIA');
    const nearSomeone = others.some(o => getHexDistance(graph, finalHex, o.hexId) <= 1);
    if (nearSomeone) {
      await drawSupportCards(roomCode, state, pid, 1);
      addLog(state, `🐐 Bầy Đàn kích hoạt: Mùi rút thêm 1 Thẻ Hỗ Trợ!`);
    }
  }

  // Kiểm tra Hỗn chiến (≥ 3 người cùng 1 ô)
  const sameHexIds = Object.values(state.players).filter(x => x.hexId === finalHex).map(x => x.id);
  if (sameHexIds.length >= 3) {
    state.turn.phase = 'COMBAT_MELEE';
    state.combat = {
      type: 'MELEE',
      participants: sameHexIds,
      resolved: false
    };
    addLog(state, `⚔️ HỖN CHIẾN ${sameHexIds.length} NGƯỜI tại cùng một ô!`);
    await savePublicState(roomCode, state);
    return;
  }

  // Kiểm tra Vùng Khiêu Chiến (1 ô mặc định, 2 ô Mùa Hạ)
  const zone = getChallengeZone(graph, finalHex);
  const targets = others.filter(o =>
    !o?.statusFlags?.immuneUntilNextTurn && (o.hexId === finalHex || zone.has(o.hexId))
  );

  if (targets.length === 1) {
    await startCombat1v1(roomCode, state, graph, pid, targets[0].id);
    if (state.turn.phase === 'STEP5_END') {
      await finishTurnInternal(roomCode, state, graph);
    }
  } else if (targets.length > 1) {
    state.turn.phase = 'COMBAT_CHOOSE';
    state.turn.combatTargets = targets.map(t => t.id);
    addLog(state, `⚔️ ${p.zodiac} lọt vào Vùng Khiêu Chiến của ${targets.length} đối thủ — hãy chọn 1 mục tiêu giao chiến!`);
  } else {
    await finishTurnInternal(roomCode, state, graph);
  }

  await savePublicState(roomCode, state);
}

async function startCombat1v1(roomCode, state, graph, attackerId, defenderId) {
  const atk = state.players[attackerId];
  const def = state.players[defenderId];
  const season = graph.nodes[atk.hexId].season;

  // Kiểm tra lá chắn hủy giao chiến từ Mão A / Hợi A / Hợi B (cấm phòng thủ ở Mùa Hạ)
  if (season !== 'HA' && def?.statusFlags?.maoCancelCombat) {
    if (def.statusFlags) delete def.statusFlags.maoCancelCombat;
    atk.hexId = computePushBackHex(graph, atk.hexId, 2, false);
    addLog(state, `🐇 Thế Thân kích hoạt! Hủy Giao chiến và đẩy ${atk.zodiac} lùi 2 ô!`);
    state.turn.phase = 'STEP5_END';
    return;
  }
  if (season !== 'HA' && def?.statusFlags?.hoiSleepShield) {
    if (def.statusFlags) delete def.statusFlags.hoiSleepShield;
    atk.hexId = computePushBackHex(graph, atk.hexId, 1, false);
    addLog(state, `🐷 Giấc Ngủ Vàng hủy Giao chiến và đẩy ${atk.zodiac} lùi 1 ô!`);
    state.turn.phase = 'STEP5_END';
    return;
  }
  if (season !== 'HA' && def?.statusFlags?.hoiSleepSteal) {
    if (def.statusFlags) delete def.statusFlags.hoiSleepSteal;
    const stolen = await stealRandomCard(roomCode, state, defenderId, attackerId);
    addLog(state, `🐷 Mộng Du hủy Giao chiến${stolen ? ` và cướp [${stolen}] từ ${atk.zodiac}` : ''}!`);
    state.turn.phase = 'STEP5_END';
    return;
  }

  state.turn.phase = 'COMBAT_1V1';
  state.combat = {
    type: '1V1',
    attackerId,
    defenderId,
    season,
    atkBonus: (atk?.statusFlags?.combatBonusOnce || 0) + (atk?.statusFlags?.danRoarBonus || 0),
    defBonus: (def?.statusFlags?.combatBonusOnce || 0) + (def?.statusFlags?.guardBonus || 0),
    atkUsedCard: false,
    defUsedCard: false,
    peaceProposedBy: null
  };
  if (atk?.statusFlags) delete atk.statusFlags.combatBonusOnce;
  if (def?.statusFlags) delete def.statusFlags.combatBonusOnce;
  addLog(state, `⚔️ GIAO CHIẾN 1v1: ${atk.zodiac} vs ${def.zodiac}!`);
}

export async function chooseCombatTarget(roomCode, rawState, graph, targetId) {
  const state = cloneState(rawState);
  if (!state.turn || state.turn.phase !== 'COMBAT_CHOOSE') return;
  await startCombat1v1(roomCode, state, graph, state.turn.playerId, targetId);
  if (state.turn.phase === 'STEP5_END') {
    await finishTurnInternal(roomCode, state, graph);
  }
  await savePublicState(roomCode, state);
}

export async function useCombatWeaponCard(roomCode, rawState, playerId, cardIndex) {
  const state = cloneState(rawState);
  if (!state.combat || state.combat.type !== '1V1') return;
  const isAtk = state.combat.attackerId === playerId;
  const isDef = state.combat.defenderId === playerId;
  if (!isAtk && !isDef) return;

  const priv = await getPrivateData(roomCode, playerId);
  const hand = toArray(priv.hand);
  if (hand[cardIndex] !== 'VU_KHI') return;
  hand.splice(cardIndex, 1);
  state.supportDiscard.push('VU_KHI');
  state.players[playerId].handCount = hand.length;
  await savePrivateData(roomCode, playerId, { ...priv, hand });

  if (isAtk) state.combat.atkBonus += 3;
  else state.combat.defBonus += 3;
  addLog(state, `🗡️ ${state.players[playerId].zodiac} rút Vũ Khí Bí Mật (+3 điểm giao chiến)!`);
  await savePublicState(roomCode, state);
}

export async function combatPeace(roomCode, rawState, graph, playerId) {
  const state = cloneState(rawState);
  if (!state.combat || state.combat.type !== '1V1') return;
  if (state.combat.season === 'THU') throw new Error('Mùa Thu cấm Hòa bình — bắt buộc giao chiến!');
  addLog(state, `🕊️ Hai bên đồng ý HÒA BÌNH, bỏ qua giao chiến.`);
  state.combat = null;
  await finishTurnInternal(roomCode, state, graph);
  await savePublicState(roomCode, state);
}

export async function combatYield(roomCode, rawState, graph, playerId) {
  const state = cloneState(rawState);
  if (!state.combat || state.combat.type !== '1V1') return;
  const loserId = playerId;
  const winnerId = loserId === state.combat.attackerId ? state.combat.defenderId : state.combat.attackerId;
  const loser = state.players[loserId];
  const winner = state.players[winnerId];

  addLog(state, `🏳️ ${loser.zodiac} tuyên bố NHƯỜNG trước ${winner.zodiac}!`);
  await applyDamage(roomCode, state, graph, loserId, 'Nhường trong giao chiến');

  if (loser.statusFlags.tyYieldPoison) {
    delete loser.statusFlags.tyYieldPoison;
    addLog(state, `🐍 Độc Tâm kích hoạt! ${loser.zodiac} không bị đẩy lùi; ${winner.zodiac} trúng độc (-1❤️ và -3 MP lượt sau)!`);
    await applyDamage(roomCode, state, graph, winnerId, 'Độc Tâm của Tỵ');
    winner.statusFlags.poisoned = true;
  } else if (state.combat.season !== 'THU') {
    loser.hexId = computePushBackHex(graph, loser.hexId, 1, false);
  }

  state.combat = null;
  await finishTurnInternal(roomCode, state, graph);
  await savePublicState(roomCode, state);
}

export async function resolveCombatRoll(roomCode, rawState, graph) {
  const state = cloneState(rawState);
  if (!state.combat) return;

  if (state.combat.type === 'MELEE') {
    const scores = state.combat.participants.map(id => ({ id, total: rollDie() + rollDie() }));
    scores.sort((a, b) => b.total - a.total);
    const high = scores[0].total;
    const low = scores[scores.length - 1].total;
    const winners = scores.filter(s => s.total === high);
    const losers = scores.filter(s => s.total === low);

    addLog(state, `⚔️ Kết quả Hỗn chiến: ${scores.map(s => `${state.players[s.id].zodiac}(${s.total})`).join(' - ')}`);
    for (const w of winners) {
      const winner = state.players[w.id];
      const step = winners.length > 1 ? 1 : 2;
      applySkillRelocation(state, graph, winner, computeAdvanceHex(graph, winner.hexId, step), 'Thắng Hỗn Chiến');
    }
    if (high !== low) {
      for (const l of losers) {
        await applyDamage(roomCode, state, graph, l.id, 'Thua Hỗn chiến');
        if (graph.nodes[state.players[l.id].hexId].season !== 'THU') {
          state.players[l.id].hexId = computePushBackHex(graph, state.players[l.id].hexId, 1, false);
        }
      }
    }
    state.combat = null;
    await finishTurnInternal(roomCode, state, graph);
    await savePublicState(roomCode, state);
    return;
  }

  // 1v1 Combat
  const { attackerId, defenderId, atkBonus, defBonus, season } = state.combat;
  let rA, rD, tA, tD;
  do {
    rA = rollDie() + rollDie();
    rD = rollDie() + rollDie();
    tA = rA + atkBonus;
    tD = rD + defBonus;
  } while (tA === tD);

  const winnerId = tA > tD ? attackerId : defenderId;
  const loserId = tA > tD ? defenderId : attackerId;
  const atk = state.players[attackerId];
  const def = state.players[defenderId];
  const loser = state.players[loserId];
  const winner = state.players[winnerId];

  addLog(state, `⚔️ Kết quả 1v1: ${atk.zodiac} (${rA}+${atkBonus}=${tA}) vs ${def.zodiac} (${rD}+${defBonus}=${tD}) → ${winner.zodiac} thắng!`);

  // Tự động kiểm tra Hộ Thân Phù của bên thua (trừ Mùa Hạ cấm phòng thủ)
  let blockedByTalisman = false;
  if (season !== 'HA') {
    const lPriv = await getPrivateData(roomCode, loserId);
    const lHand = toArray(lPriv.hand);
    const idx = lHand.indexOf('HO_THAN');
    if (idx !== -1) {
      lHand.splice(idx, 1);
      state.supportDiscard.push('HO_THAN');
      loser.handCount = lHand.length;
      await savePrivateData(roomCode, loserId, { ...lPriv, hand: lHand });
      blockedByTalisman = true;
      addLog(state, `🛡️ ${loser.zodiac} kích hoạt Hộ Thân Phù chặn mất Mệnh Bài!`);
    }
  }

  if (!blockedByTalisman) {
    await applyDamage(roomCode, state, graph, loserId, `Thua giao chiến trước ${winner.zodiac}`);
  }

  // Kiểm tra Sửu B (Phản Lực Trâu Điên)
  if (loser.statusFlags.suuCounter) {
    delete loser.statusFlags.suuCounter;
    applySkillRelocation(state, graph, loser, computeAdvanceHex(graph, loser.hexId, 1), 'Phản Lực Trâu Điên');
    winner.hexId = computePushBackHex(graph, winner.hexId, 2, false);
    addLog(state, `🐂 Phản Lực Trâu Điên! ${loser.zodiac} tiến +1 ô và hất ${winner.zodiac} lùi 2 ô!`);
  } else if (season !== 'THU') {
    loser.hexId = computePushBackHex(graph, loser.hexId, 1, false);
  }

  state.combat = null;
  await finishTurnInternal(roomCode, state, graph);
  await savePublicState(roomCode, state);
}

async function finishTurnInternal(roomCode, state, graph) {
  if (state.status === 'finished') return;
  const n = state.turnOrder.length;
  state.turnsInRound += 1;

  // Kiểm tra kết thúc vòng đấu
  if (state.turnsInRound >= n) {
    state.turnsInRound = 0;
    if (!state.roundEventTriggered) {
      addLog(state, `🌙 Hết vòng ${state.round} chưa có Sự Kiện → tự rút 1 Thẻ Sự Kiện áp dụng đầu vòng sau!`);
      await triggerEventCard(roomCode, state, graph, state.turnOrder[0]);
    }
    state.round += 1;
    state.roundEventTriggered = false;
    if (state.blizzardRoundsLeft > 0) state.blizzardRoundsLeft -= 1;
    if (state.reverseRoundsLeft > 0) {
      state.reverseRoundsLeft -= 1;
      if (state.reverseRoundsLeft === 0 && !state.reverseUntilPlayerId) {
        state.direction = 1;
        addLog(state, `🌀 Thời Không Đảo Lộn kết thúc — chiều đi trở về bình thường.`);
      }
    }
  }

  state.currentTurnIdx = (state.currentTurnIdx + state.direction + n) % n;
  initNewTurn(state);
}

// Hỗ trợ chạy nhanh 1 lượt cho Bot (khi Host muốn test solo với Bot)
export async function runBotStep(roomCode, rawState, graph) {
  const state = cloneState(rawState);
  if (state.status === 'draft') {
    const pid = state.draftOrder[state.draftIdx];
    if (!state.players[pid]?.isBot) return;
    const occupied = new Set(Object.values(state.players).map(p => p.hexId));
    const free = START_HEXES.filter(h => !occupied.has(h));
    const pick = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : START_HEXES[2];
    await pickStartHex(roomCode, state, pid, pick);
    return;
  }
  if (state.pendingSkillChoice) {
    const sc = state.pendingSkillChoice;
    if (state.players[sc.playerId]?.isBot) {
      const choice = (sc.type === 'Tự thân' && state.turn.playerId !== sc.playerId) ? 'SAVE' : 'USE';
      await resolveSkillChoice(roomCode, state, graph, choice);
      return;
    }
  }

  if (state.status !== 'playing' || !state.turn) return;
  const pid = state.turn.playerId;
  const p = state.players[pid];
  if (!p?.isBot) return;

  if (state.turn.phase === 'STEP1_ROLL') {
    await rollFourDice(roomCode, state);
  } else if (state.turn.phase === 'STEP2_SPLIT') {
    // Bot chia 2 viên lớn nhất cho Di chuyển
    const indexed = state.turn.dice.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    await confirmDiceSplit(roomCode, state, [indexed[0].i, indexed[1].i]);
  } else if (state.turn.phase === 'STEP3_CLOCK') {
    await proceedToStep4(roomCode, state, graph);
  } else if (state.turn.phase === 'STEP4_ACTION') {
    if (state.turn.linhKhiPending) {
      await chooseLinhKhi(roomCode, state, 'MP');
    } else {
      if (p.savedSkill && p.cooldownTD === 0) {
        await useSavedSkill(roomCode, state, graph, pid);
      }
      await proceedToStep5(roomCode, state, graph);
    }
  } else if (state.turn.phase === 'STEP5_MOVE') {
    const mp = calculateCurrentMp(state, graph);
    const extraCost = state.blizzardRoundsLeft > 0 ? 1 : 0;
    const { reachable } = getReachableHexes(graph, p.hexId, mp, {
      extraCost,
      flatCostOne: state.turn.flatCostOne,
      gateProgress: p.gateProgress ?? 12
    });
    let bestHex = p.hexId;
    let bestDist = graph.nodes[p.hexId].distToFinish;
    for (const h of reachable) {
      if (graph.nodes[h].distToFinish < bestDist) {
        bestDist = graph.nodes[h].distToFinish;
        bestHex = h;
      }
    }
    await executeMove(roomCode, state, graph, bestHex);
  } else if (state.turn.phase === 'COMBAT_CHOOSE') {
    await chooseCombatTarget(roomCode, state, graph, state.turn.combatTargets[0]);
  } else if (state.turn.phase === 'COMBAT_1V1' || state.turn.phase === 'COMBAT_MELEE') {
    await resolveCombatRoll(roomCode, state, graph);
  }
}

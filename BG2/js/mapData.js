export const ZODIACS = [
  'Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ',
  'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'
];

export const SEASON_BONUS_ZODIACS = {
  XUAN: ['Dần', 'Mão', 'Thìn'],
  HA:   ['Tỵ', 'Ngọ', 'Mùi'],
  THU:  ['Thân', 'Dậu', 'Tuất'],
  DONG: ['Hợi', 'Tý', 'Sửu']
};

export const SEASONS = {
  XUAN: { name: 'Mùa Xuân', cx: -9.7, cy: -9.0, plain: 'xuan_plain' },
  HA:   { name: 'Mùa Hạ',   cx: -9.7, cy:  9.0, plain: 'ha_plain' },
  THU:  { name: 'Mùa Thu',  cx:  9.7, cy:  9.0, plain: 'thu_plain' },
  DONG: { name: 'Mùa Đông', cx:  9.7, cy: -9.0, plain: 'dong_plain' }
};

export const START_HEXES = ['XUAN:0,-4', 'XUAN:1,-4', 'XUAN:2,-4', 'XUAN:3,-4', 'XUAN:4,-4'];

export const TERRAIN_META = {
  xuan_plain:   { label: 'Đồng bằng Xuân',    cost: 1,  passable: true,  fill: '#DCF0C8', stroke: '#8FB573' },
  ha_plain:     { label: 'Đồng bằng Hạ',      cost: 1,  passable: true,  fill: '#FCE3C2', stroke: '#D49A5E' },
  thu_plain:    { label: 'Đường mòn Thu',     cost: 1,  passable: true,  fill: '#F7DFC4', stroke: '#C99563' },
  dong_plain:   { label: 'Đồng bằng Đông',    cost: 1,  passable: true,  fill: '#E3EEF7', stroke: '#8FAEC7' },
  start:        { label: 'Ô Xuất Phát',       cost: 1,  passable: true,  fill: '#A8DF8E', stroke: '#2E7D32', text: 'XP' },
  river:        { label: 'Sông Suối',         cost: 99, passable: false, fill: '#64B5F6', stroke: '#1E88E5', text: '≈' },
  lava:         { label: 'Ô Lửa',             cost: 1,  passable: true,  fill: '#EF6C4D', stroke: '#B71C1C', text: '▲' },
  forest:       { label: 'Rừng Phong',        cost: 2,  passable: true,  fill: '#C46D3B', stroke: '#7C3A16', text: '2' },
  snow:         { label: 'Tuyết Dày',         cost: 3,  passable: true,  fill: '#B7CEE3', stroke: '#547A9E', text: '3' },
  ice:          { label: 'Băng Trơn',         cost: 1,  passable: true,  fill: '#80DEEA', stroke: '#00838F', text: '»' },
  station_big:  { label: 'Trạm +2 Thẻ',       cost: 1,  passable: true,  fill: '#FFD54F', stroke: '#E65100', text: '+2' },
  station_sm:   { label: 'Trạm +1 Thẻ',       cost: 1,  passable: true,  fill: '#FFE082', stroke: '#EF6C00', text: '+1' },
  bridge_short: { label: 'Cầu Ngắn (Hiểm)',   cost: 1,  passable: true,  fill: '#D88A52', stroke: '#7A2E0E', text: 'CẦU' },
  bridge_long:  { label: 'Cầu Dài (An toàn)', cost: 1,  passable: true,  fill: '#B89B72', stroke: '#5D4037', text: 'CẦU' },
  finish:       { label: 'Thiên Đình (Đích)', cost: 1,  passable: true,  fill: '#FFD700', stroke: '#B8860B', text: '★' }
};

const SQRT3 = Math.sqrt(3);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

function axialToSvg(q, r, cx, cy) {
  const x = cx + SQRT3 * (q + r / 2);
  const yMath = cy + 1.5 * r;
  return { x, y: -yMath };
}

function keyOf(season, q, r) {
  return `${season}:${q},${r}`;
}

export function buildBoardGraph() {
  const nodes = {};

  const special = {
    XUAN: {
      '0,-4': 'start', '1,-4': 'start', '2,-4': 'start', '3,-4': 'start', '4,-4': 'start',
      '0,0': 'station_big', '-3,2': 'station_sm', '2,1': 'station_sm',
      '-2,0': 'river', '-1,0': 'river', '-1,-1': 'river', '1,1': 'river', '2,0': 'river', '1,2': 'river'
    },
    HA: {
      '-2,3': 'station_sm',
      '3,-3': 'lava', '2,-2': 'lava', '1,-1': 'lava', '2,0': 'lava',
      '3,-1': 'lava', '-1,2': 'lava', '0,1': 'lava', '1,2': 'lava'
    },
    THU: {
      '0,0': 'station_sm',
      '-3,0':'forest','-2,0':'forest','-1,0':'forest','1,0':'forest','2,0':'forest',
      '-3,-1':'forest','-2,-1':'forest','-1,-1':'forest','0,-1':'forest','1,-1':'forest',
      '-2,1':'forest','-1,1':'forest','0,1':'forest','1,1':'forest',
      '-1,-2':'forest','0,-2':'forest','1,-2':'forest','0,-3':'forest','-1,-3':'forest',
      '-2,2':'forest','-1,2':'forest','0,2':'forest','-3,1':'forest','-2,-2':'forest'
    },
    DONG: {
      '2,-4': 'finish',
      '-3,3':'snow','-2,3':'snow','-1,3':'snow','-2,2':'snow','-1,2':'snow','0,2':'snow',
      '-2,1':'snow','-1,1':'snow','0,1':'snow','0,0':'snow','-1,0':'snow',
      '1,-1':'snow','1,-2':'snow','0,-1':'snow','1,-3':'snow','2,-3':'snow',
      '1,3':'ice','2,2':'ice','2,1':'ice','3,0':'ice','3,-1':'ice','3,-2':'ice',
      '-3,1':'ice','-2,0':'ice','-1,-1':'ice','0,-2':'ice'
    }
  };

  for (const [season, cfg] of Object.entries(SEASONS)) {
    for (let q = -4; q <= 4; q++) {
      for (let r = -4; r <= 4; r++) {
        if (Math.abs(q + r) > 4) continue;
        const id = keyOf(season, q, r);
        const { x, y } = axialToSvg(q, r, cfg.cx, cfg.cy);
        const terrain = special[season][`${q},${r}`] || cfg.plain;
        nodes[id] = { id, season, q, r, x, y, terrain, neighbors: [], distToFinish: Infinity };
      }
    }
  }

  for (const node of Object.values(nodes)) {
    for (const [dq, dr] of DIRS) {
      const nid = keyOf(node.season, node.q + dq, node.r + dr);
      if (nodes[nid]) node.neighbors.push(nid);
    }
  }

  const bridges = [
    { id: 'BRIDGE:XH_L', a: 'XUAN:-4,4', b: 'HA:0,-4',   terrain: 'bridge_long',  season: 'BRIDGE' },
    { id: 'BRIDGE:XH_S', a: 'XUAN:0,4',  b: 'HA:4,-4',   terrain: 'bridge_short', season: 'BRIDGE' },
    { id: 'BRIDGE:HT_L', a: 'HA:2,2',    b: 'THU:-4,2',  terrain: 'bridge_long',  season: 'BRIDGE' },
    { id: 'BRIDGE:HT_S', a: 'HA:4,-2',   b: 'THU:-2,-2', terrain: 'bridge_short', season: 'BRIDGE' },
    { id: 'BRIDGE:TD_S', a: 'THU:0,-4',  b: 'DONG:-4,4', terrain: 'bridge_short', season: 'BRIDGE' },
    { id: 'BRIDGE:TD_L', a: 'THU:4,-4',  b: 'DONG:0,4',  terrain: 'bridge_long',  season: 'BRIDGE' }
  ];

  for (const br of bridges) {
    const na = nodes[br.a], nb = nodes[br.b];
    nodes[br.id] = {
      id: br.id, season: br.season, q: null, r: null,
      x: (na.x + nb.x) / 2, y: (na.y + nb.y) / 2,
      terrain: br.terrain, neighbors: [br.a, br.b],
      endpoints: [br.a, br.b], distToFinish: Infinity
    };
    na.neighbors.push(br.id);
    nb.neighbors.push(br.id);
  }

  const finishId = 'DONG:2,-4';
  const queue = [finishId];
  nodes[finishId].distToFinish = 0;
  while (queue.length > 0) {
    const cur = nodes[queue.shift()];
    for (const nid of cur.neighbors) {
      const next = nodes[nid];
      if (!TERRAIN_META[next.terrain].passable) continue;
      if (next.distToFinish > cur.distToFinish + 1) {
        next.distToFinish = cur.distToFinish + 1;
        queue.push(nid);
      }
    }
  }

  return { nodes, bridges, finishId };
}

export function getHexDistance(graph, idA, idB) {
  if (idA === idB) return 0;
  const visited = new Map([[idA, 0]]);
  const queue = [idA];
  while (queue.length > 0) {
    const cur = queue.shift();
    const d = visited.get(cur);
    for (const nid of graph.nodes[cur].neighbors) {
      if (!TERRAIN_META[graph.nodes[nid].terrain].passable) continue;
      if (nid === idB) return d + 1;
      if (!visited.has(nid)) {
        visited.set(nid, d + 1);
        queue.push(nid);
      }
    }
  }
  return Infinity;
}

export function getReachableHexes(graph, startId, maxMp, options = {}) {
  const { extraCost = 0, flatCostOne = false } = options;
  const bestCost = { [startId]: 0 };
  const prev = {};
  const pq = [{ id: startId, cost: 0 }];
  const reachable = new Set();

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const { id, cost } = pq.shift();
    if (cost > bestCost[id]) continue;

    for (const nid of graph.nodes[id].neighbors) {
      const target = graph.nodes[nid];
      const meta = TERRAIN_META[target.terrain];
      if (!meta.passable) continue;

      const baseCost = flatCostOne ? 1 : meta.cost;
      const stepCost = Math.max(1, baseCost + extraCost);
      let nextCost = cost + stepCost;

      // Quy tắc Bước Tối Thiểu: từ ô xuất phát luôn bước được tối thiểu 1 ô hợp lệ
      if (id === startId && maxMp >= 1 && stepCost > maxMp) {
        nextCost = maxMp;
      }

      if (nextCost <= maxMp && (bestCost[nid] === undefined || nextCost < bestCost[nid])) {
        bestCost[nid] = nextCost;
        prev[nid] = id;
        reachable.add(nid);
        if (nextCost < maxMp) pq.push({ id: nid, cost: nextCost });
      }
    }
  }
  return { reachable, bestCost, prev };
}

export function reconstructPath(prev, startId, targetId) {
  const path = [];
  let cur = targetId;
  while (cur && cur !== startId) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

export function getChallengeZone(graph, centerId, overrideRadius = null) {
  const center = graph.nodes[centerId];
  const radius = overrideRadius !== null ? overrideRadius : (center.season === 'HA' ? 2 : 1);
  const zone = new Set();
  const visited = new Map([[centerId, 0]]);
  const queue = [centerId];

  while (queue.length > 0) {
    const curId = queue.shift();
    const d = visited.get(curId);
    if (d >= radius) continue;
    for (const nid of graph.nodes[curId].neighbors) {
      if (!TERRAIN_META[graph.nodes[nid].terrain].passable) continue;
      if (!visited.has(nid)) {
        visited.set(nid, d + 1);
        zone.add(nid);
        queue.push(nid);
      }
    }
  }
  return zone;
}

// Đẩy lùi N ô ra xa Đích nhất (stayInSeason = true dùng cho Trọng Thương để không lùi qua cầu)
export function computePushBackHex(graph, startId, steps, stayInSeason = false) {
  let cur = startId;
  const originSeason = graph.nodes[startId].season;
  for (let i = 0; i < steps; i++) {
    const curNode = graph.nodes[cur];
    let best = cur;
    let bestDist = curNode.distToFinish;
    for (const nid of curNode.neighbors) {
      const next = graph.nodes[nid];
      if (!TERRAIN_META[next.terrain].passable) continue;
      if (stayInSeason && originSeason !== 'BRIDGE' && next.season !== originSeason) continue;
      if (next.distToFinish > bestDist) {
        bestDist = next.distToFinish;
        best = nid;
      }
    }
    if (best === cur) break;
    cur = best;
  }
  return cur;
}

// Tiến thẳng N ô về phía Đích nhất (bỏ qua chi phí địa hình, không xuyên Sông/Vực)
export function computeAdvanceHex(graph, startId, steps) {
  let cur = startId;
  for (let i = 0; i < steps; i++) {
    const curNode = graph.nodes[cur];
    if (cur === graph.finishId) break;
    let best = cur;
    let bestDist = curNode.distToFinish;
    for (const nid of curNode.neighbors) {
      const next = graph.nodes[nid];
      if (!TERRAIN_META[next.terrain].passable) continue;
      if (next.distToFinish < bestDist) {
        bestDist = next.distToFinish;
        best = nid;
      }
    }
    if (best === cur) break;
    cur = best;
  }
  return cur;
}

// Trượt Băng Trơn thêm 1 ô theo đúng hướng bước vào
export function computeIceSlide(graph, prevId, iceId) {
  const prev = graph.nodes[prevId];
  const ice = graph.nodes[iceId];
  if (!prev || !ice || prev.season !== ice.season || prev.q === null || ice.q === null) {
    return iceId;
  }
  const dq = ice.q - prev.q;
  const dr = ice.r - prev.r;
  const nextId = `${ice.season}:${ice.q + dq},${ice.r + dr}`;
  const nextNode = graph.nodes[nextId];
  if (nextNode && TERRAIN_META[nextNode.terrain].passable) {
    return nextId;
  }
  return iceId;
}

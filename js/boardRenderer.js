import { TERRAIN_META, ZODIACS } from './mapData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== null) node.textContent = text;
  return node;
}

function hexPoints(cx, cy, size = 0.94) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + size * Math.cos(angle)).toFixed(3)},${(cy + size * Math.sin(angle)).toFixed(3)}`);
  }
  return pts.join(' ');
}

// 6 đỉnh của lục địa lớn (bán kính R=7.9)
function continentPoints(cx, cy, R = 7.9) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    pts.push(`${(cx + R * Math.cos(angle)).toFixed(3)},${(cy + R * Math.sin(angle)).toFixed(3)}`);
  }
  return pts.join(' ');
}

export class BoardRenderer {
  constructor(svgElement, graph, onHexClick, onHexHover = null, onHexLeave = null) {
    this.svg = svgElement;
    this.graph = graph;
    this.onHexClick = onHexClick;
    this.onHexHover = onHexHover;
    this.onHexLeave = onHexLeave;
    this.hexElements = {};
    this.clockHand = null;
    this.trapLayer = null;
    this.previewLayer = null;
    this.pawnLayer = null;
    this.render();
  }

  render() {
    this.svg.innerHTML = '';

    // 0. ĐỊNH NGHĨA GRADIENT, FILTER & SYMBOL ICONS
    this.renderDefs();

    // 1. NỀN GIẤY CỔ TRANG CHUNG
    this.svg.appendChild(el('rect', {
      x: -21, y: -18.6, width: 42, height: 37.2,
      fill: '#FBF6EB'
    }));

    // 2. VỰC THỜI GIAN (HỐ SÂU HUYỀN ẢO - LỚP DƯỚI BẢN ĐỒ)
    this.renderAbyss();

    // 3. ĐẾ 4 LỤC ĐỊA 4 MÙA (CÓ VIỀN BO VÀ MÀU CHỦ ĐẠO TỪNG MÙA)
    this.renderContinentPlates();

    // 4. HỆ THỐNG CẦU GỖ NỐI CÁC MÙA (CẦU DÀI & CẦU NGẮN)
    this.renderBridges();

    // 5. TOÀN BỘ 250 Ô LỤC GIÁC (LƯỚI Ô BẢN ĐỒ)
    this.renderHexGrid();

    // 6. ĐỒNG HỒ 24 GIỜ TRUNG TÂM (THIÊN 1-12h & ĐỊA 13-24h)
    this.renderClock();

    // 7. 4 THẺ THÔNG TIN 4 MÙA KÈM AVATAR 12 CON GIÁP
    this.renderSeasonCards();

    // 8. CÁC HỌA TIẾT TRANG TRÍ 4 GÓC (Mặt trời, Lá phong, Hoa đào, Bông tuyết)
    this.renderCornerDecorations();

    // 9. CÁC LỚP TOKEN BẪY, XEM TRƯỚC LỘ TRÌNH & QUÂN CỜ
    this.trapLayer = el('g', { 'pointer-events': 'none', id: 'trapLayer' });
    this.previewLayer = el('g', { 'pointer-events': 'none', id: 'previewLayer' });
    this.pawnLayer = el('g', { 'pointer-events': 'none', id: 'pawnLayer' });
    this.svg.appendChild(this.trapLayer);
    this.svg.appendChild(this.previewLayer);
    this.svg.appendChild(this.pawnLayer);
  }

  renderDefs() {
    const defs = el('defs');

    // Filter bóng đổ mềm cho các card
    const filter = el('filter', { id: 'cardShadow', x: '-10%', y: '-10%', width: '120%', height: '120%' });
    filter.appendChild(el('feDropShadow', { dx: 0, dy: 0.15, stdDeviation: 0.18, 'flood-color': 'rgba(0,0,0,0.15)' }));
    defs.appendChild(filter);

    // Gradient Vực Thời Gian
    const gradAbyss = el('linearGradient', { id: 'gradAbyss', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    gradAbyss.appendChild(el('stop', { offset: '0%', 'stop-color': '#1A1847' }));
    gradAbyss.appendChild(el('stop', { offset: '50%', 'stop-color': '#131136' }));
    gradAbyss.appendChild(el('stop', { offset: '100%', 'stop-color': '#0C0A23' }));
    defs.appendChild(gradAbyss);

    // Gradient Gỗ cho Cầu
    const gradWood = el('linearGradient', { id: 'gradWood', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    gradWood.appendChild(el('stop', { offset: '0%', 'stop-color': '#8D6E63' }));
    gradWood.appendChild(el('stop', { offset: '50%', 'stop-color': '#6D4C41' }));
    gradWood.appendChild(el('stop', { offset: '100%', 'stop-color': '#4E342E' }));
    defs.appendChild(gradWood);

    // Gradient Nửa Đêm Đồng Hồ (13-24h)
    const gradNight = el('linearGradient', { id: 'gradNight', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    gradNight.appendChild(el('stop', { offset: '0%', 'stop-color': '#212A45' }));
    gradNight.appendChild(el('stop', { offset: '100%', 'stop-color': '#151C30' }));
    defs.appendChild(gradNight);

    this.svg.appendChild(defs);
  }

  renderContinentPlates() {
    const g = el('g', { 'pointer-events': 'none' });
    const plates = [
      { cx: -11.5, cy: 9.0, fill: '#EAF7E6', stroke: '#5CB85C', label: 'XUAN' }, // Mùa Xuân (y=9 trong SVG)
      { cx: -11.5, cy: -9.0, fill: '#FFF1E8', stroke: '#E57342', label: 'HA' },   // Mùa Hạ (y=-9 trong SVG)
      { cx: 11.5, cy: -9.0, fill: '#F7EDE7', stroke: '#8E4D21', label: 'THU' },  // Mùa Thu
      { cx: 11.5, cy: 9.0, fill: '#E8F5FD', stroke: '#2980B9', label: 'DONG' }   // Mùa Đông
    ];

    for (const p of plates) {
      g.appendChild(el('polygon', {
        points: continentPoints(p.cx, p.cy, 7.82),
        fill: p.fill,
        stroke: p.stroke,
        'stroke-width': '0.34',
        'stroke-linejoin': 'round'
      }));
    }
    this.svg.appendChild(g);
  }

  renderBridges() {
    const g = el('g');
    const nodes = this.graph.nodes;

    // 1. Cầu Dài Xuân - Hạ (BRIDGE:XH_L)
    const nXHLa = nodes['XUAN:-4,4'], nXHLb = nodes['HA:0,-4'], nXHL = nodes['BRIDGE:XH_L'];
    if (nXHLa && nXHLb && nXHL) {
      const pathXHL = `M ${nXHLa.x},${nXHLa.y} Q ${nXHL.x - 0.5},0 ${nXHLb.x},${nXHLb.y}`;
      g.appendChild(el('path', { d: pathXHL, fill: 'none', stroke: '#6D4C41', 'stroke-width': '0.78', 'stroke-linecap': 'round' }));
      g.appendChild(el('path', { d: pathXHL, fill: 'none', stroke: '#D7CCC8', 'stroke-width': '0.38', 'stroke-dasharray': '0.28 0.18' }));
    }

    // 2. Cầu Ngắn Xuân - Hạ (BRIDGE:XH_S)
    const nXHSa = nodes['XUAN:0,4'], nXHSb = nodes['HA:4,-4'];
    if (nXHSa && nXHSb) {
      g.appendChild(el('line', {
        x1: nXHSa.x, y1: nXHSa.y, x2: nXHSb.x, y2: nXHSb.y,
        stroke: '#6D4C41', 'stroke-width': '0.78', 'stroke-linecap': 'round'
      }));
      g.appendChild(el('line', {
        x1: nXHSa.x, y1: nXHSa.y, x2: nXHSb.x, y2: nXHSb.y,
        stroke: '#D7CCC8', 'stroke-width': '0.38', 'stroke-dasharray': '0.28 0.18'
      }));
    }

    // 3. Cầu Dài Hạ - Thu (BRIDGE:HT_L)
    const nHTLa = nodes['HA:2,2'], nHTLb = nodes['THU:-4,2'], nHTL = nodes['BRIDGE:HT_L'];
    if (nHTLa && nHTLb && nHTL) {
      const pathHTL = `M ${nHTLa.x},${nHTLa.y} Q 0,${nHTL.y - 0.8} ${nHTLb.x},${nHTLb.y}`;
      g.appendChild(el('path', { d: pathHTL, fill: 'none', stroke: '#6D4C41', 'stroke-width': '0.78', 'stroke-linecap': 'round' }));
      g.appendChild(el('path', { d: pathHTL, fill: 'none', stroke: '#D7CCC8', 'stroke-width': '0.38', 'stroke-dasharray': '0.28 0.18' }));
    }

    // 4. Cầu Ngắn Hạ - Thu (BRIDGE:HT_S)
    const nHTSa = nodes['HA:4,-2'], nHTSb = nodes['THU:-2,-2'];
    if (nHTSa && nHTSb) {
      g.appendChild(el('line', {
        x1: nHTSa.x, y1: nHTSa.y, x2: nHTSb.x, y2: nHTSb.y,
        stroke: '#6D4C41', 'stroke-width': '0.78', 'stroke-linecap': 'round'
      }));
      g.appendChild(el('line', {
        x1: nHTSa.x, y1: nHTSa.y, x2: nHTSb.x, y2: nHTSb.y,
        stroke: '#D7CCC8', 'stroke-width': '0.38', 'stroke-dasharray': '0.28 0.18'
      }));
    }

    // 5. Cầu Ngắn Thu - Đông (BRIDGE:TD_S)
    const nTDSa = nodes['THU:0,-4'], nTDSb = nodes['DONG:-4,4'];
    if (nTDSa && nTDSb) {
      g.appendChild(el('line', {
        x1: nTDSa.x, y1: nTDSa.y, x2: nTDSb.x, y2: nTDSb.y,
        stroke: '#6D4C41', 'stroke-width': '0.78', 'stroke-linecap': 'round'
      }));
      g.appendChild(el('line', {
        x1: nTDSa.x, y1: nTDSa.y, x2: nTDSb.x, y2: nTDSb.y,
        stroke: '#D7CCC8', 'stroke-width': '0.38', 'stroke-dasharray': '0.28 0.18'
      }));
    }

    // 6. Cầu Dài Thu - Đông (BRIDGE:TD_L)
    const nTDLa = nodes['THU:4,-4'], nTDLb = nodes['DONG:0,4'], nTDL = nodes['BRIDGE:TD_L'];
    if (nTDLa && nTDLb && nTDL) {
      const pathTDL = `M ${nTDLa.x},${nTDLa.y} Q ${nTDL.x + 0.5},0 ${nTDLb.x},${nTDLb.y}`;
      g.appendChild(el('path', { d: pathTDL, fill: 'none', stroke: '#6D4C41', 'stroke-width': '0.78', 'stroke-linecap': 'round' }));
      g.appendChild(el('path', { d: pathTDL, fill: 'none', stroke: '#D7CCC8', 'stroke-width': '0.38', 'stroke-dasharray': '0.28 0.18' }));
    }

    // Biển huy hiệu trên các cầu
    const bridgeBadges = [
      { id: 'BRIDGE:XH_L', text: 'DÀI · 2MP', sub: 'AN TOÀN', arrow: '▲' },
      { id: 'BRIDGE:XH_S', text: 'NGẮN · 1MP', sub: 'CÓ BẪY', arrow: '▲' },
      { id: 'BRIDGE:HT_L', text: 'DÀI · 2MP', sub: 'AN TOÀN', arrow: '▶' },
      { id: 'BRIDGE:HT_S', text: 'NGẮN · 1MP', sub: 'CÓ BẪY', arrow: '▶' },
      { id: 'BRIDGE:TD_S', text: 'NGẮN · 1MP', sub: 'CÓ BẪY', arrow: '▼' },
      { id: 'BRIDGE:TD_L', text: 'DÀI · 2MP', sub: 'AN TOÀN', arrow: '▼' }
    ];

    for (const b of bridgeBadges) {
      const node = nodes[b.id];
      if (!node) continue;
      const bg = el('g', { 'pointer-events': 'none' });
      bg.appendChild(el('circle', {
        cx: node.x, cy: node.y, r: 0.88,
        fill: '#EFEBE9', stroke: '#6D4C41', 'stroke-width': 0.11
      }));
      bg.appendChild(el('text', {
        x: node.x, y: node.y - 0.28, 'text-anchor': 'middle',
        fill: '#4E342E', 'font-size': '0.25', 'font-weight': '900'
      }, b.text));
      bg.appendChild(el('text', {
        x: node.x, y: node.y + 0.02, 'text-anchor': 'middle',
        fill: b.sub === 'AN TOÀN' ? '#1B5E20' : '#8D3B12',
        'font-size': '0.20', 'font-weight': '900'
      }, b.sub));
      bg.appendChild(el('circle', {
        cx: node.x, cy: node.y + 0.20, r: 0.38,
        fill: '#D7CCC8', stroke: '#5D4037', 'stroke-width': 0.07
      }));
      bg.appendChild(el('text', {
        x: node.x, y: node.y + 0.33, 'text-anchor': 'middle',
        fill: '#3E2723', 'font-size': '0.38', 'font-weight': '900'
      }, b.arrow));
      g.appendChild(bg);
    }

    this.svg.appendChild(g);
  }

  renderHexGrid() {
    const hexLayer = el('g');
    for (const node of Object.values(this.graph.nodes)) {
      const meta = TERRAIN_META[node.terrain];
      const g = el('g', { class: 'hex-cell', 'data-id': node.id });
      const isBridge = node.season === 'BRIDGE';

      // Hình đa giác lục giác
      const poly = el('polygon', {
        points: hexPoints(node.x, node.y, isBridge ? 0.82 : 0.94),
        fill: isBridge ? 'rgba(255,255,255,0.01)' : meta.fill,
        stroke: isBridge ? 'rgba(0,0,0,0.08)' : meta.stroke,
        'stroke-width': isBridge ? 0.05 : 0.08
      });
      g.appendChild(poly);

      // Ký hiệu & Họa tiết minh họa tinh tế bên trong từng ô
      if (!isBridge) {
        this.renderHexSymbol(g, node, meta);
      }
      if (node.checkpointIndex !== undefined) {
        this.renderCheckpointMarker(g, node);
      }

      g.addEventListener('click', () => this.onHexClick(node.id));
      if (this.onHexHover) {
        g.addEventListener('mouseenter', () => this.onHexHover(node.id));
      }
      if (this.onHexLeave) {
        g.addEventListener('mouseleave', () => this.onHexLeave(node.id));
      }
      hexLayer.appendChild(g);
      this.hexElements[node.id] = poly;
    }
    this.svg.appendChild(hexLayer);
  }

  renderCheckpointMarker(g, node) {
    const x = node.x + 0.52;
    const y = node.y - 0.50;
    const localNumber = (node.checkpointIndex % 3) + 1;
    const seasonColors = {
      XUAN: '#2E7D32',
      HA: '#C62828',
      THU: '#8D4A20',
      DONG: '#1565C0'
    };
    const color = seasonColors[node.checkpointSeason] || '#8D6E63';

    // Huy hiệu nhỏ ở góc ô để nhận diện checkpoint nhưng không che địa hình.
    g.appendChild(el('circle', {
      cx: x, cy: y, r: 0.28,
      fill: '#FFFDF5', stroke: '#D4AF37', 'stroke-width': 0.10,
      'pointer-events': 'none'
    }));
    g.appendChild(el('circle', {
      cx: x, cy: y, r: 0.20,
      fill: color, stroke: '#FFFFFF', 'stroke-width': 0.04,
      'pointer-events': 'none'
    }));
    g.appendChild(el('text', {
      x, y: y + 0.09, 'text-anchor': 'middle',
      fill: '#FFFFFF', 'font-size': '0.24', 'font-weight': '900',
      'pointer-events': 'none'
    }, `${localNumber}`));
  }

  renderHexSymbol(g, node, meta) {
    const { x, y } = node;
    const t = node.terrain;

    // 1. Ô Xuất Phát (XP)
    if (t === 'start') {
      g.appendChild(el('polygon', {
        points: `${x},${y - 0.48} ${x + 0.42},${y + 0.26} ${x - 0.42},${y + 0.26}`,
        fill: '#FFC107', stroke: '#E65100', 'stroke-width': 0.07
      }));
      g.appendChild(el('text', {
        x: x, y: y + 0.17, 'text-anchor': 'middle',
        fill: '#B71C1C', 'font-size': '0.38', 'font-weight': '900', 'pointer-events': 'none'
      }, 'XP'));
      return;
    }

    // 2. Ô Đích Thiên Đình (Ngôi đền hoàng kim / ★)
    if (t === 'finish') {
      g.appendChild(el('circle', { cx: x, cy: y, r: 0.74, fill: '#FFC107', stroke: '#B8860B', 'stroke-width': 0.11 }));
      g.appendChild(el('polygon', {
        points: `${x},${y - 0.52} ${x + 0.48},${y + 0.30} ${x - 0.48},${y + 0.30}`,
        fill: '#D32F2F', stroke: '#B71C1C', 'stroke-width': 0.07
      }));
      g.appendChild(el('text', {
        x: x, y: y + 0.20, 'text-anchor': 'middle',
        fill: '#FFF8E1', 'font-size': '0.46', 'font-weight': '900', 'pointer-events': 'none'
      }, '★'));
      return;
    }

    // 3. Sông Suối (≈)
    if (t === 'river') {
      g.appendChild(el('path', {
        d: `M ${x - 0.44},${y - 0.14} Q ${x - 0.22},${y - 0.30} ${x},${y - 0.14} T ${x + 0.44},${y - 0.14} M ${x - 0.44},${y + 0.14} Q ${x - 0.22},${y} ${x},${y + 0.14} T ${x + 0.44},${y + 0.14}`,
        fill: 'none', stroke: '#FFFFFF', 'stroke-width': 0.15, 'stroke-linecap': 'round', 'pointer-events': 'none'
      }));
      return;
    }

    // 4. Ô Lửa Mùa Hạ (▲ / ngọn lửa)
    if (t === 'lava') {
      g.appendChild(el('circle', { cx: x, cy: y, r: 0.56, fill: '#E64A19', stroke: '#BF360C', 'stroke-width': 0.07 }));
      g.appendChild(el('path', {
        d: `M ${x},${y - 0.40} Q ${x + 0.32},${y + 0.02} ${x + 0.18},${y + 0.26} Q ${x},${y + 0.40} ${x - 0.18},${y + 0.26} Q ${x - 0.32},${y + 0.02} ${x},${y - 0.40}`,
        fill: '#FFEB3B', stroke: '#FF9800', 'stroke-width': 0.06, 'pointer-events': 'none'
      }));
      g.appendChild(el('circle', { cx: x, cy: y + 0.11, r: 0.11, fill: '#D84315', 'pointer-events': 'none' }));
      return;
    }

    // 5. Rừng Phong Mùa Thu (Hoa phong sao 8 cánh)
    if (t === 'forest') {
      g.appendChild(el('circle', { cx: x, cy: y, r: 0.56, fill: '#7A3816', stroke: '#5D280C', 'stroke-width': 0.07 }));
      g.appendChild(el('path', {
        d: `M ${x},${y - 0.36} L ${x + 0.09},${y - 0.09} L ${x + 0.36},${y} L ${x + 0.09},${y + 0.09} L ${x},${y + 0.36} L ${x - 0.09},${y + 0.09} L ${x - 0.36},${y} L ${x - 0.09},${y - 0.09} Z`,
        fill: '#F5B041', stroke: '#D68910', 'stroke-width': 0.05, 'pointer-events': 'none'
      }));
      return;
    }

    // 6. Tuyết Dày Mùa Đông
    if (t === 'snow') {
      g.appendChild(el('path', {
        d: `M ${x},${y - 0.34} L ${x},${y + 0.34} M ${x - 0.30},${y - 0.17} L ${x + 0.30},${y + 0.17} M ${x - 0.30},${y + 0.17} L ${x + 0.30},${y - 0.17}`,
        fill: 'none', stroke: '#546E7A', 'stroke-width': 0.09, 'stroke-linecap': 'round', 'pointer-events': 'none'
      }));
      g.appendChild(el('circle', { cx: x, cy: y, r: 0.08, fill: '#FFFFFF', 'pointer-events': 'none' }));
      return;
    }

    // 7. Băng Trơn Mùa Đông (2 đường trượt song song)
    if (t === 'ice') {
      g.appendChild(el('path', {
        d: `M ${x - 0.34},${y + 0.28} L ${x + 0.28},${y - 0.34} M ${x - 0.20},${y + 0.36} L ${x + 0.36},${y - 0.20}`,
        fill: 'none', stroke: '#FFFFFF', 'stroke-width': 0.14, 'stroke-linecap': 'round', 'pointer-events': 'none'
      }));
      return;
    }

    // 8. Trạm Rút Thẻ (+1, +2)
    if (t === 'station_big' || t === 'station_sm') {
      const isBig = t === 'station_big';
      g.appendChild(el('circle', {
        cx: x, cy: y, r: isBig ? 0.58 : 0.48,
        fill: '#FFC107', stroke: '#E65100', 'stroke-width': 0.09
      }));
      g.appendChild(el('text', {
        x: x, y: y + 0.15, 'text-anchor': 'middle',
        fill: '#3E2723', 'font-size': isBig ? '0.40' : '0.35', 'font-weight': '900', 'pointer-events': 'none'
      }, isBig ? '+2' : '+1'));
      return;
    }

    // 9. Ô Đồng bằng thông thường: thêm chấm hoa văn mờ nhạt
    const dotColor = node.season === 'XUAN' ? '#81C784'
                   : (node.season === 'HA' ? '#FFAB91'
                   : (node.season === 'THU' ? '#D7CCC8' : '#B0BEC5'));
    g.appendChild(el('circle', { cx: x, cy: y, r: 0.08, fill: dotColor, opacity: '0.6', 'pointer-events': 'none' }));
  }

  renderAbyss() {
    const g = el('g', { 'pointer-events': 'none' });
    const cx = 0, cy = 8.6;

    // Hố sâu Vực Thời Gian hình oval (khoảng trống 9.14 nên rx=4.8 vừa vặn cực đẹp)
    g.appendChild(el('ellipse', {
      cx, cy, rx: 4.8, ry: 2.2,
      fill: 'url(#gradAbyss)', stroke: '#3F51B5', 'stroke-width': 0.14
    }));

    // Sao lấp lánh trong hố
    const starCoords = [
      [-3.0, 8.2], [-1.8, 9.4], [-0.5, 7.8], [1.2, 9.2], [2.4, 8.0], [3.2, 9.1]
    ];
    for (const [sx, sy] of starCoords) {
      g.appendChild(el('circle', { cx: sx, cy: sy, r: 0.05, fill: '#E0E7FF', opacity: 0.85 }));
    }

    g.appendChild(el('text', {
      x: cx, y: cy - 0.14, 'text-anchor': 'middle',
      fill: '#FFFFFF', 'font-size': '0.50', 'font-weight': '900', 'letter-spacing': '0.06em'
    }, 'VỰC THỜI GIAN'));

    g.appendChild(el('text', {
      x: cx, y: cy + 0.40, 'text-anchor': 'middle',
      fill: '#9FA8DA', 'font-size': '0.28', 'font-weight': '700'
    }, 'cấm băng qua · cấm dịch chuyển xuyên'));

    this.svg.appendChild(g);
  }

  renderClock() {
    // Đồng hồ chỉ để hiển thị; không được chặn click lên các ô lục giác bên dưới.
    const g = el('g', { 'pointer-events': 'none' });
    const rOuter = 3.9;
    const rInner = 2.05;

    // Vành ngoài chia làm 2 nửa: THIÊN 1-12h (phải/ngày) & ĐỊA 13-24h (trái/đêm)
    const pathNight = `M 0,${-rOuter} A ${rOuter} ${rOuter} 0 0 0 0,${rOuter} Z`;
    g.appendChild(el('path', { d: pathNight, fill: 'url(#gradNight)', stroke: '#151C30', 'stroke-width': 0.08 }));

    const pathDay = `M 0,${-rOuter} A ${rOuter} ${rOuter} 0 0 1 0,${rOuter} Z`;
    g.appendChild(el('path', { d: pathDay, fill: '#FFFDE8', stroke: '#D4AF37', 'stroke-width': 0.08 }));

    g.appendChild(el('circle', { cx: 0, cy: 0, r: rOuter, fill: 'none', stroke: '#4A3B32', 'stroke-width': 0.14 }));

    // Vẽ 24 khấc giờ & phù hiệu 12 Con Giáp
    for (let hr = 1; hr <= 24; hr++) {
      const deg = (hr - 0.5) * 15 - 90;
      const rad = (deg * Math.PI) / 180;
      const isNight = hr >= 13;

      // 1. Chấm/vạch số giờ
      const txNum = Math.cos(rad) * 3.42;
      const tyNum = Math.sin(rad) * 3.42;
      g.appendChild(el('circle', {
        cx: txNum, cy: tyNum, r: 0.31,
        fill: isNight ? '#0F1626' : '#FFFFFF',
        stroke: isNight ? '#3949AB' : '#D4AF37',
        'stroke-width': 0.06
      }));
      g.appendChild(el('text', {
        x: txNum, y: tyNum + 0.10, 'text-anchor': 'middle',
        fill: isNight ? '#FFFFFF' : '#B71C1C',
        'font-size': '0.25', 'font-weight': '900'
      }, `${hr}`));

      // 2. Tên Con Giáp đại diện
      const txZod = Math.cos(rad) * 2.68;
      const tyZod = Math.sin(rad) * 2.68;
      const zName = ZODIACS[(hr - 1) % 12];
      g.appendChild(el('text', {
        x: txZod, y: tyZod + 0.09, 'text-anchor': 'middle',
        fill: isNight ? '#CFD8DC' : '#263238',
        'font-size': '0.27', 'font-weight': '800'
      }, zName));
    }

    // Mặt trong đồng hồ
    g.appendChild(el('circle', { cx: 0, cy: 0, r: rInner, fill: '#FFFDF7', stroke: '#D4AF37', 'stroke-width': 0.12 }));
    g.appendChild(el('circle', { cx: 0, cy: 0, r: rInner - 0.14, fill: 'none', stroke: '#E0D6C3', 'stroke-width': 0.05 }));

    g.appendChild(el('text', {
      x: 0, y: -1.02, 'text-anchor': 'middle',
      fill: '#B78103', 'font-size': '0.24', 'font-weight': '900'
    }, 'THIÊN 1–12h ☀'));

    g.appendChild(el('text', {
      x: 0, y: -0.74, 'text-anchor': 'middle',
      fill: '#1565C0', 'font-size': '0.24', 'font-weight': '900'
    }, '◀ ĐỊA 13–24h 🌙'));

    g.appendChild(el('text', {
      x: 0, y: -0.14, 'text-anchor': 'middle',
      fill: '#2C1E16', 'font-size': '0.42', 'font-weight': '900'
    }, 'ĐỒNG HỒ'));

    g.appendChild(el('text', {
      x: 0, y: 0.34, 'text-anchor': 'middle',
      fill: '#2C1E16', 'font-size': '0.48', 'font-weight': '900'
    }, '24 GIỜ'));

    g.appendChild(el('text', {
      x: 0, y: 0.78, 'text-anchor': 'middle',
      fill: '#795548', 'font-size': '0.24', 'font-weight': '700', 'font-style': 'italic'
    }, 'kim chung của cả bàn'));

    // Kim đồng hồ xoay động
    this.clockHand = el('g');
    this.clockHand.appendChild(el('line', {
      x1: 0, y1: 0, x2: 0, y2: -rOuter * 0.58,
      stroke: '#C62828', 'stroke-width': 0.18, 'stroke-linecap': 'round'
    }));
    this.clockHand.appendChild(el('polygon', {
      points: `0,${-rOuter * 0.74} 0.18,${-rOuter * 0.52} -0.18,${-rOuter * 0.52}`,
      fill: '#C62828'
    }));
    g.appendChild(this.clockHand);

    g.appendChild(el('circle', { cx: 0, cy: 0, r: 0.32, fill: '#D4AF37', stroke: '#3E2723', 'stroke-width': 0.08 }));
    g.appendChild(el('circle', { cx: 0, cy: 0, r: 0.12, fill: '#8D6E63' }));

    this.svg.appendChild(g);
    this.setClockHour(3);
  }

  setClockHour(hour) {
    if (!this.clockHand) return;
    const deg = (hour - 0.5) * 15;
    this.clockHand.setAttribute('transform', `rotate(${deg} 0 0)`);
  }

  renderSeasonCards() {
    const cards = [
      // Mùa Hạ (Góc trên bên trái)
      {
        x: -17.9, y: -18.3, w: 12.8, h: 2.45, fill: '#B53426',
        title: 'MÙA HẠ', sub1: 'Rực lửa · Khiêu chiến 2 ô · cấm phòng thủ', sub2: 'Đắc địa +1 MP: Tỵ, Ngọ, Mùi',
        zodiacs: ['Tỵ', 'Ngọ', 'Mùi']
      },
      // Mùa Thu (Góc trên bên phải)
      {
        x: 5.1, y: -18.3, w: 12.8, h: 2.45, fill: '#7A3E1D',
        title: 'MÙA THU', sub1: 'Thu hoạch · ép giao chiến · không đẩy lùi', sub2: 'Đắc địa +1 MP: Thân, Dậu, Tuất',
        zodiacs: ['Thân', 'Dậu', 'Tuất']
      },
      // Mùa Xuân (Góc dưới bên trái)
      {
        x: -17.9, y: 15.7, w: 12.8, h: 2.45, fill: '#2E7D32',
        title: 'MÙA XUÂN', sub1: 'Sinh sôi · hồi Mệnh Bài · +2 · Trạm rút thẻ', sub2: 'Đắc địa +1 MP: Dần, Mão, Thìn',
        zodiacs: ['Dần', 'Mão', 'Thìn']
      },
      // Mùa Đông (Góc dưới bên phải)
      {
        x: 5.1, y: 15.7, w: 12.8, h: 2.45, fill: '#1E88E5',
        title: 'MÙA ĐÔNG', sub1: 'Khắc nghiệt · nước rút tới Thiên Đình', sub2: 'Đắc địa +1 MP: Hợi, Tý, Sửu',
        zodiacs: ['Hợi', 'Tý', 'Sửu']
      }
    ];

    const g = el('g', { 'pointer-events': 'none' });
    for (const c of cards) {
      g.appendChild(el('rect', {
        x: c.x, y: c.y, width: c.w, height: c.h, rx: 0.55,
        fill: c.fill, filter: 'url(#cardShadow)'
      }));

      g.appendChild(el('text', {
        x: c.x + 0.65, y: c.y + 0.76,
        fill: '#FFFFFF', 'font-size': '0.66', 'font-weight': '900'
      }, c.title));

      g.appendChild(el('text', {
        x: c.x + 0.65, y: c.y + 1.34,
        fill: '#FFFFFF', 'font-size': '0.31', 'font-weight': '700'
      }, c.sub1));

      g.appendChild(el('text', {
        x: c.x + 0.65, y: c.y + 1.94,
        fill: '#FFF9C4', 'font-size': '0.31', 'font-weight': '800'
      }, c.sub2));

      c.zodiacs.forEach((zName, i) => {
        const circleX = c.x + c.w - 3.4 + i * 1.15;
        const circleY = c.y + 0.98;

        g.appendChild(el('circle', {
          cx: circleX, cy: circleY, r: 0.48,
          fill: '#FFFFFF', stroke: 'rgba(0,0,0,0.1)', 'stroke-width': 0.05
        }));

        g.appendChild(el('text', {
          x: circleX, y: circleY + 0.14, 'text-anchor': 'middle',
          fill: '#212121', 'font-size': '0.32', 'font-weight': '900'
        }, zName.substring(0, 1)));

        g.appendChild(el('text', {
          x: circleX, y: c.y + 2.04, 'text-anchor': 'middle',
          fill: '#FFFFFF', 'font-size': '0.28', 'font-weight': '800'
        }, zName));
      });
    }

    this.svg.appendChild(g);
  }

  renderCornerDecorations() {
    const g = el('g', { 'pointer-events': 'none' });

    // Mặt trời Mùa Hạ (Góc trên trái)
    const sunX = -19.4, sunY = -15.8;
    g.appendChild(el('circle', { cx: sunX, cy: sunY, r: 0.68, fill: '#FFA000' }));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.appendChild(el('line', {
        x1: sunX + Math.cos(a) * 0.82, y1: sunY + Math.sin(a) * 0.82,
        x2: sunX + Math.cos(a) * 1.18, y2: sunY + Math.sin(a) * 1.18,
        stroke: '#FFA000', 'stroke-width': 0.16, 'stroke-linecap': 'round'
      }));
    }

    // Lá phong Mùa Thu (Góc trên phải)
    const leafX = 19.4, leafY = -15.8;
    g.appendChild(el('polygon', {
      points: `${leafX},${leafY - 0.78} ${leafX + 0.58},${leafY - 0.22} ${leafX + 0.9},${leafY + 0.45} ${leafX},${leafY + 0.22} ${leafX - 0.9},${leafY + 0.45} ${leafX - 0.58},${leafY - 0.22}`,
      fill: '#D35400'
    }));

    // Hoa đào Mùa Xuân (Góc dưới trái)
    const flwX = -19.4, flwY = 16.0;
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      g.appendChild(el('circle', {
        cx: flwX + Math.cos(a) * 0.46, cy: flwY + Math.sin(a) * 0.46, r: 0.38,
        fill: '#F48FB1'
      }));
    }
    g.appendChild(el('circle', { cx: flwX, cy: flwY, r: 0.24, fill: '#F06292' }));

    // Bông tuyết Mùa Đông (Góc dưới phải)
    const snwX = 19.4, snwY = 16.0;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.appendChild(el('line', {
        x1: snwX, y1: snwY,
        x2: snwX + Math.cos(a) * 0.90, y2: snwY + Math.sin(a) * 0.90,
        stroke: '#64B5F6', 'stroke-width': 0.14, 'stroke-linecap': 'round'
      }));
    }

    this.svg.appendChild(g);
  }

  highlightHexes(selectedId, reachableSet, challengeSet) {
    for (const [id, poly] of Object.entries(this.hexElements)) {
      poly.classList.remove('hex-selected', 'hex-reachable', 'hex-challenge');
      if (challengeSet && challengeSet.has(id)) poly.classList.add('hex-challenge');
      if (reachableSet && reachableSet.has(id)) poly.classList.add('hex-reachable');
      if (id === selectedId) poly.classList.add('hex-selected');
    }
  }

  showPathPreview(pathHexIds) {
    if (!this.previewLayer) return;
    this.previewLayer.innerHTML = '';
    if (!pathHexIds || pathHexIds.length < 2) return;

    let d = '';
    pathHexIds.forEach((hid, idx) => {
      const n = this.graph.nodes[hid];
      if (!n) return;
      if (idx === 0) d += `M ${n.x},${n.y}`;
      else d += ` L ${n.x},${n.y}`;
    });

    // Đường nét phát sáng rực rỡ
    this.previewLayer.appendChild(el('path', {
      d, fill: 'none', stroke: '#00e676', 'stroke-width': '0.34',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.45'
    }));
    this.previewLayer.appendChild(el('path', {
      d, fill: 'none', stroke: '#ffd600', 'stroke-width': '0.18',
      'stroke-dasharray': '0.28 0.16', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));

    // Vòng tròn đánh dấu điểm đến
    const lastNode = this.graph.nodes[pathHexIds[pathHexIds.length - 1]];
    if (lastNode) {
      this.previewLayer.appendChild(el('circle', {
        cx: lastNode.x, cy: lastNode.y, r: 0.65,
        fill: 'none', stroke: '#ffd600', 'stroke-width': 0.16,
        'stroke-dasharray': '0.22 0.14'
      }));
    }
  }

  clearPathPreview() {
    if (this.previewLayer) this.previewLayer.innerHTML = '';
  }

  drawTraps(trapsArr) {
    if (!this.trapLayer) return;
    this.trapLayer.innerHTML = '';
    for (const trap of trapsArr || []) {
      const n = this.graph.nodes[trap.hexId];
      if (!n) continue;
      const color = trap.type === 'DOC' ? '#4A148C' : (trap.type === 'VUNG_CAM' ? '#B71C1C' : '#3E2723');
      const label = trap.type === 'DOC' ? 'ĐỘC' : (trap.type === 'VUNG_CAM' ? 'CẤM' : 'BẪY');
      const pts = `${n.x},${n.y - 0.58} ${n.x + 0.52},${n.y + 0.42} ${n.x - 0.52},${n.y + 0.42}`;
      this.trapLayer.appendChild(el('polygon', {
        points: pts, fill: color, stroke: '#FFFFFF', 'stroke-width': 0.09
      }));
      this.trapLayer.appendChild(el('text', {
        x: n.x, y: n.y + 0.28, 'text-anchor': 'middle',
        fill: '#FFFFFF', 'font-size': '0.28', 'font-weight': '900'
      }, label));
    }
  }

  drawAllPawns(playersObj, activePlayerId = null) {
    if (!this.pawnLayer) return;
    this.pawnLayer.innerHTML = '';
    const byHex = {};
    for (const p of Object.values(playersObj || {})) {
      if (!p.hexId) continue;
      if (!byHex[p.hexId]) byHex[p.hexId] = [];
      byHex[p.hexId].push(p);
    }

    for (const [hexId, list] of Object.entries(byHex)) {
      const n = this.graph.nodes[hexId];
      if (!n) continue;
      list.forEach((p, idx) => {
        const offset = list.length > 1 ? (idx - (list.length - 1) / 2) * 0.48 : 0;
        const isActive = p.id === activePlayerId;

        // Vòng hào quang vàng khi tới lượt
        if (isActive) {
          this.pawnLayer.appendChild(el('circle', {
            cx: n.x + offset, cy: n.y, r: 0.80,
            fill: 'none', stroke: '#FFD600', 'stroke-width': 0.18
          }));
        }

        // Bóng đổ và quân cờ
        this.pawnLayer.appendChild(el('circle', {
          cx: n.x + offset, cy: n.y + 0.04, r: 0.58,
          fill: 'rgba(0,0,0,0.22)'
        }));

        this.pawnLayer.appendChild(el('circle', {
          cx: n.x + offset, cy: n.y, r: 0.58,
          fill: p.color || '#D32F2F', stroke: '#FFFFFF', 'stroke-width': 0.14
        }));

        this.pawnLayer.appendChild(el('text', {
          x: n.x + offset, y: n.y + 0.17, 'text-anchor': 'middle',
          fill: '#FFFFFF', 'font-size': '0.38', 'font-weight': '900'
        }, (p.zodiac || 'P').toUpperCase()));
      });
    }
  }
}

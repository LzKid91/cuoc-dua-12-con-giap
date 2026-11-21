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

export class BoardRenderer {
  constructor(svgElement, graph, onHexClick) {
    this.svg = svgElement;
    this.graph = graph;
    this.onHexClick = onHexClick;
    this.hexElements = {};
    this.clockHand = null;
    this.trapLayer = null;
    this.pawnLayer = null;
    this.render();
  }

  render() {
    this.svg.innerHTML = '';

    // 1. Nền cầu gỗ nối giữa các lục địa
    const bridgeLayer = el('g');
    for (const br of this.graph.bridges) {
      const a = this.graph.nodes[br.a];
      const b = this.graph.nodes[br.b];
      bridgeLayer.appendChild(el('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: '#6D4C41', 'stroke-width': 0.9, 'stroke-linecap': 'round'
      }));
    }
    this.svg.appendChild(bridgeLayer);

    // 2. Nhãn 4 Mùa
    const labels = [
      { text: 'MÙA XUÂN (Sinh sôi)', x: -9.7, y: 17.5, color: '#33691E' },
      { text: 'MÙA HẠ (Rực lửa – Tầm đánh 2 ô)', x: -9.7, y: -17.3, color: '#BF360C' },
      { text: 'MÙA THU (Thu hoạch – Khóa chân)', x: 9.7, y: -17.3, color: '#7C3A16' },
      { text: 'MÙA ĐÔNG (Khắc nghiệt)', x: 9.7, y: 17.5, color: '#1565C0' }
    ];
    for (const lb of labels) {
      this.svg.appendChild(el('text', {
        x: lb.x, y: lb.y, 'text-anchor': 'middle',
        fill: lb.color, 'font-size': '0.92', 'font-weight': '700'
      }, lb.text));
    }

    // 3. Toàn bộ 250 ô lục giác
    const hexLayer = el('g');
    for (const node of Object.values(this.graph.nodes)) {
      const meta = TERRAIN_META[node.terrain];
      const g = el('g', { class: 'hex-cell', 'data-id': node.id });
      const poly = el('polygon', {
        points: hexPoints(node.x, node.y, node.season === 'BRIDGE' ? 1.02 : 0.94),
        fill: meta.fill,
        stroke: meta.stroke,
        'stroke-width': 0.08
      });
      g.appendChild(poly);

      if (meta.text) {
        const darkText = !['lava', 'forest', 'bridge_short', 'bridge_long'].includes(node.terrain);
        g.appendChild(el('text', {
          x: node.x, y: node.y + 0.22, 'text-anchor': 'middle',
          fill: darkText ? '#212121' : '#FFFFFF',
          'font-size': meta.text.length > 2 ? '0.46' : '0.66',
          'font-weight': '700', 'pointer-events': 'none'
        }, meta.text));
      }

      g.addEventListener('click', () => this.onHexClick(node.id));
      hexLayer.appendChild(g);
      this.hexElements[node.id] = poly;
    }
    this.svg.appendChild(hexLayer);

    // 4. Đồng hồ 24h trung tâm
    this.renderClock();

    // 5. Lớp Token Bẫy & Quân cờ
    this.trapLayer = el('g', { 'pointer-events': 'none' });
    this.pawnLayer = el('g', { 'pointer-events': 'none' });
    this.svg.appendChild(this.trapLayer);
    this.svg.appendChild(this.pawnLayer);
  }

  renderClock() {
    const g = el('g');
    const r = 3.6;
    g.appendChild(el('circle', { cx: 0, cy: 0, r: r + 0.28, fill: '#2C2520', stroke: '#D4AF37', 'stroke-width': 0.16 }));
    g.appendChild(el('circle', { cx: 0, cy: 0, r, fill: '#FFFDF5', stroke: '#8D6E63', 'stroke-width': 0.08 }));
    g.appendChild(el('circle', { cx: 0, cy: 0, r: r * 0.56, fill: '#F3EAD8', stroke: '#BCAAA4', 'stroke-width': 0.05 }));

    for (let hr = 1; hr <= 24; hr++) {
      const rad = ((hr * 15 - 90) * Math.PI) / 180;
      const tx = Math.cos(rad) * (r * 0.78);
      const ty = Math.sin(rad) * (r * 0.78);
      const zodiac = ZODIACS[(hr - 1) % 12];
      const color = hr <= 12 ? '#B71C1C' : '#1565C0';

      g.appendChild(el('text', {
        x: tx, y: ty - 0.08, 'text-anchor': 'middle', fill: color,
        'font-size': '0.35', 'font-weight': '700'
      }, `${hr}h`));
      g.appendChild(el('text', {
        x: tx, y: ty + 0.28, 'text-anchor': 'middle', fill: color,
        'font-size': '0.33', 'font-weight': '700'
      }, zodiac));
    }

    this.clockHand = el('line', {
      x1: 0, y1: 0, x2: 0, y2: -r * 0.55,
      stroke: '#C62828', 'stroke-width': 0.18, 'stroke-linecap': 'round'
    });
    g.appendChild(this.clockHand);
    g.appendChild(el('circle', { cx: 0, cy: 0, r: 0.24, fill: '#D4AF37', stroke: '#3E2723', 'stroke-width': 0.07 }));
    this.svg.appendChild(g);
    this.setClockHour(3);
  }

  setClockHour(hour) {
    const deg = hour * 15;
    this.clockHand.setAttribute('transform', `rotate(${deg} 0 0)`);
  }

  highlightHexes(selectedId, reachableSet, challengeSet) {
    for (const [id, poly] of Object.entries(this.hexElements)) {
      poly.classList.remove('hex-selected', 'hex-reachable', 'hex-challenge');
      if (challengeSet && challengeSet.has(id)) poly.classList.add('hex-challenge');
      if (reachableSet && reachableSet.has(id)) poly.classList.add('hex-reachable');
      if (id === selectedId) poly.classList.add('hex-selected');
    }
  }

  drawTraps(trapsArr) {
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
        fill: '#FFFFFF', 'font-size': '0.28', 'font-weight': '700'
      }, label));
    }
  }

  drawAllPawns(playersObj, activePlayerId = null) {
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
        if (isActive) {
          this.pawnLayer.appendChild(el('circle', {
            cx: n.x + offset, cy: n.y, r: 0.72,
            fill: 'none', stroke: '#FFD600', 'stroke-width': 0.16
          }));
        }
        this.pawnLayer.appendChild(el('circle', {
          cx: n.x + offset, cy: n.y, r: 0.54,
          fill: p.color || '#D32F2F', stroke: '#FFFFFF', 'stroke-width': 0.12
        }));
        this.pawnLayer.appendChild(el('text', {
          x: n.x + offset, y: n.y + 0.16, 'text-anchor': 'middle',
          fill: '#FFFFFF', 'font-size': '0.36', 'font-weight': '700'
        }, p.zodiac.toUpperCase()));
      });
    }
  }
}

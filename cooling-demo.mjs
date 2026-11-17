import { ATOM, ASSUMPTIONS as A, DEFAULT_COOLING, magneticField, simulateCooling, sampleTrajectory, scatteringRate } from './cooling-model.mjs?v=locking-1';
import { PRODUCT_GUIDE } from './cooling-products.mjs';

const $ = id => document.getElementById(id);
const CONTROLS = [['zs-detuning', 'detuning', 'MHz', 0], ['zs-field', 'fieldScale', '×', 2], ['zs-velocity', 'initialVelocity', 'm/s', 0], ['mot-detuning', 'motDetuning', 'MHz', 0], ['mot-gradient', 'gradient', 'G/cm', 0], ['mot-velocity', 'transverseVelocity', 'm/s', 1]];
const PRESETS = { matched: {}, fast: { initialVelocity: 650 }, detuned: { detuning: -400 }, 'no-field': { fieldScale: 0 }, 'no-gradient': { gradient: 0 }, blue: { motDetuning: 32 }, reversed: { gradient: -30 }, transverse: { transverseVelocity: 30 } };
const STATUS = { captured: '满足全部接收窗口', axial: '轴向未进入窗口', transverse: '横向未进入窗口' };
const fmt = (value, decimals = 1) => Number(value).toFixed(decimals).replace('-', '−');
const polyline = (points, x, y) => points.map((point, i) => `${i ? 'L' : 'M'}${x(point).toFixed(2)},${y(point).toFixed(2)}`).join(' ');

export function createCoolingDemo({ onChange = () => {} } = {}) {
  let p = { ...DEFAULT_COOLING }, result, map = null, mapKey = '', request = 0, timer, worker;
  let replaying = false, replayPhase = 0, previous = null;
  const canvas = $('mot-scene'), ctx = canvas.getContext('2d');
  function renderControls() {
    for (const [id, key, unit, decimals] of CONTROLS) { $(id).value = p[key]; $(`${id}-value`).textContent = `${fmt(p[key], decimals)} ${unit}`; }
  }
  function renderCharts() {
    const sx = z => 48 + z / A.length * 612, sy = v => 207 - v / 720 * 174;
    const actual = polyline(result.slower.points, q => sx(q.z), q => sy(q.v));
    const resonance = polyline(Array.from({ length: 81 }, (_, i) => { const z = i / 80 * A.length; return { z, v: ATOM.wavelength * (ATOM.muOverH * magneticField(z, p.fieldScale) - p.detuning * 1e6) }; }), q => sx(q.z), q => sy(q.v));
    const probe = probePoint();
    $('zs-chart').innerHTML = `<title>轴向速度轨迹，出口 ${fmt(result.slower.velocity)} m/s</title><defs><clipPath id="zs-plot-clip"><rect x="48" y="32" width="612" height="175"/></clipPath></defs><g font-size="10" font-family="sans-serif" fill="#73816c"><text x="6" y="16">v (m/s)</text>${[0, 200, 400, 600].map(v => `<line x1="48" y1="${sy(v)}" x2="660" y2="${sy(v)}" stroke="#dfe5d7"/><text x="9" y="${sy(v) + 4}">${v}</text>`).join('')}${[0, .175, .35].map(z => `<text x="${sx(z) - 7}" y="229">${fmt(z * 100, 1)}</text>`).join('')}<text x="560" y="243">位置 z (cm)</text></g><g clip-path="url(#zs-plot-clip)"><rect x="48" y="${sy(80)}" width="612" height="${sy(10) - sy(80)}" fill="#72a66c" opacity=".12"/><path d="M48,${sy(p.initialVelocity)}L660,${sy(p.initialVelocity)}" stroke="#a1a58f" stroke-dasharray="6 5" fill="none"/><path d="${resonance}" stroke="#b89147" stroke-dasharray="4 4" stroke-width="1.5" fill="none"/><path d="${actual}" stroke="#3f7d56" stroke-width="2.5" fill="none"/><line x1="${sx(probe.z)}" y1="32" x2="${sx(probe.z)}" y2="207" stroke="#5a6d5c" opacity=".4"/><circle cx="${sx(probe.z)}" cy="${sy(probe.v)}" r="4" fill="#355e47"/></g>`;
    const by = b => 66 - b / .06 * 47;
    const fieldPoints = Array.from({ length: 81 }, (_, i) => ({ z: i / 80 * A.length }));
    $('field-chart').innerHTML = `<title>假想磁场轮廓，非厂家场图</title><g font-size="10" font-family="sans-serif" fill="#73816c"><text x="5" y="12">B (G)</text>${[-600, 0, 600].map(b => `<line x1="48" y1="${by(b * 1e-4)}" x2="660" y2="${by(b * 1e-4)}" stroke="#dfe5d7"/><text x="7" y="${by(b * 1e-4) + 4}">${b}</text>`).join('')}<text x="48" y="136">0</text><text x="624" y="136">35 cm</text></g><path d="${polyline(fieldPoints, q => sx(q.z), q => by(magneticField(q.z)))}" stroke="#9ba58e" stroke-width="1.5" stroke-dasharray="5 4" fill="none"/><path d="${polyline(fieldPoints, q => sx(q.z), q => by(magneticField(q.z, p.fieldScale)))}" stroke="#3f7d56" stroke-width="2" fill="none"/><g font-size="10" font-family="sans-serif"><text x="180" y="151" fill="#3f7d56">实线：当前 qB</text><text x="360" y="151" fill="#8c967e">虚线：1× 参考设计</text></g>`;
  }
  function probePoint() { return result.slower.points[Math.round(Number($('zs-probe').value) / 100 * (result.slower.points.length - 1))]; }
  function renderProbe() {
    const q = probePoint(), terms = [['激光 Δ', p.detuning], ['多普勒 +v/λ', q.v / ATOM.wavelength / 1e6], ['塞曼 −μB B/h', -ATOM.muOverH * q.field / 1e6], ['总有效失谐 d', q.detuning / 1e6]];
    $('zs-probe-value').textContent = `z = ${fmt(q.z * 100, 1)} cm`;
    $('detuning-terms').replaceChildren(...terms.map(([label, value]) => { const d = document.createElement('div'); const span = document.createElement('span'); span.textContent = label; const strong = document.createElement('strong'); strong.textContent = `${fmt(value, 1)} MHz`; d.append(span, strong); return d; }));
    const note = document.createElement('p'); note.className = 'fine'; note.textContent = `该点 v = ${fmt(q.v)} m/s，散射率 R = ${fmt(scatteringRate(q.detuning, A.slowerS) / 1e6, 2)} × 10⁶ s⁻¹。`; $('detuning-terms').append(note);
  }
  function renderResults() {
    const { slower, mot } = result;
    $('cooling-verdict').dataset.state = result.captured ? 'captured' : slower.accepted ? 'transverse' : 'axial';
    $('cooling-verdict').textContent = result.captured ? '所选原子满足本页定义的接收窗口' : !slower.reached ? '原子在减速器出口前停下，未到达 2D MOT' : !slower.accepted ? '轴向速度未进入本页接收窗口' : '轴向已通过，横向仍未满足出口条件';
    $('zs-exit').textContent = slower.reached ? `${fmt(slower.velocity)} m/s` : '未到出口';
    $('mot-exit-radius').textContent = mot ? `${fmt(mot.radius * 1000, 2)} mm` : '未送入';
    $('mot-exit-speed').textContent = mot ? `${fmt(mot.speed, 2)} m/s` : '未送入';
    $('mot-exit-radius').parentElement.querySelector('span').textContent = mot?.escaped ? '离开有效区时的半径' : 'MOT 出口半径';
    $('mot-exit-speed').parentElement.querySelector('span').textContent = mot?.escaped ? '离开有效区时横向速度' : 'MOT 出口横向速度';
    $('mot-result').textContent = !mot ? '没有把该原子送入横向测试：它尚未通过模型规定的轴向接收窗口。可先恢复“匹配示例”，再只改变 MOT 参数。' : mot.escaped ? `原子在 ${fmt(mot.t * 1000, 3)} ms 时离开半径 8 mm 的有效冷却区；原定驻留时间为 ${fmt(mot.duration * 1000, 3)} ms，后续轨迹不再计算。` : `驻留 ${fmt(mot.duration * 1000, 3)} ms 后，半径 ${fmt(mot.radius * 1000, 2)} mm，横向速度 ${fmt(mot.speed, 2)} m/s。${mot.accepted ? '两项均通过本页出口判据。' : mot.radius > A.aperture && mot.speed <= A.maxTransverse ? '速度已冷却，但位置仍错过出口孔。' : '仍有至少一项不满足本页出口判据。'}`;
    $('mot-replay').disabled = !mot; $('mot-restart').disabled = !mot;
    renderCharts(); renderProbe(); drawMot();
  }
  function arrow(x, y, dx, dy, color, width = 2) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    const norm = Math.hypot(dx, dy); if (!norm) return;
    const ux = dx / norm, uy = dy / norm; ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx - ux * 5 + uy * 3, y + dy - uy * 5 - ux * 3); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx - ux * 5 - uy * 3, y + dy - uy * 5 + ux * 3); ctx.stroke();
  }
  function drawMot() {
    const cx = 288, cy = 197, scale = 150 / A.motRadius;
    ctx.fillStyle = '#142b2d'; ctx.fillRect(0, 0, 660, 390); ctx.font = '12px "PingFang SC",sans-serif'; ctx.fillStyle = '#b7cdbb'; ctx.fillText('2D MOT · 横向截面（z 轴垂直于屏幕）', 20, 25);
    for (let x = 16; x < 660; x += 20) for (let y = 16; y < 390; y += 20) { ctx.fillStyle = '#213b3a'; ctx.fillRect(x, y, 2, 2); }
    for (let x = -150; x <= 150; x += 6) for (let y = -150; y <= 150; y += 6) { const r = Math.hypot(x, y); if (r <= 150) { ctx.fillStyle = r < A.aperture * scale ? '#2c5848' : '#193b3c'; ctx.fillRect(cx + x - 3, cy + y - 3, 6, 6); } }
    ctx.strokeStyle = '#4d8172'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(cx, cy, 150, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    for (let x = -120; x <= 120; x += 40) for (let y = -120; y <= 120; y += 40) if (Math.hypot(x, y) < 145 && p.gradient) arrow(cx + x, cy + y, x / 10 * Math.sign(p.gradient), -y / 10 * Math.sign(p.gradient), '#547e63', 1);
    ctx.strokeStyle = '#63aeb5'; ctx.lineWidth = 7; ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(70, cy); ctx.lineTo(480, cy); ctx.moveTo(cx, 44); ctx.lineTo(cx, 352); ctx.stroke(); ctx.globalAlpha = 1;
    arrow(76, cy, 60, 0, '#74c2c4'); arrow(477, cy, -40, 0, '#74c2c4'); arrow(cx, 47, 0, 39, '#74c2c4'); arrow(cx, 350, 0, -39, '#74c2c4');
    ctx.font = '11px "PingFang SC",sans-serif'; ctx.fillStyle = '#8fb4a4'; ctx.fillText('−8 mm', cx - 171, cy + 175); ctx.fillText('+8 mm', cx + 130, cy + 175); ctx.fillText('x →', 479, cy + 5); ctx.fillText('y ↑', cx + 12, 49);
    ctx.fillStyle = '#9ec08f'; ctx.fillText('中心绿色区', 492, 98); ctx.fillText('投影出口半径', 492, 118); ctx.fillText('r = 2 mm', 492, 138);
    ctx.fillStyle = '#8aa293'; ctx.fillText('虚线圆：', 492, 270); ctx.fillText('有效区 r = 8 mm', 492, 290); ctx.fillText('磁场小箭头', 492, 317); ctx.fillText(p.gradient ? `b = ${p.gradient} G/cm` : 'b = 0，无梯度', 492, 337);
    const mot = result.mot;
    if (!mot) { ctx.fillStyle = '#dec28e'; ctx.fillText('轴向未通过：没有下游轨迹', 170, 385); $('mot-local').textContent = '先使减速器输出满足模型窗口，才能进行本次横向测试。'; return; }
    const points = mot.points;
    ctx.save(); ctx.beginPath(); ctx.rect(92, 42, 387, 314); ctx.clip();
    const first = points[0];
    ctx.strokeStyle = '#87948a'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(cx + first.x * scale, cy - first.y * scale); ctx.lineTo(cx + (first.x + first.vx * mot.duration) * scale, cy - (first.y + first.vy * mot.duration) * scale); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#99c581'; ctx.lineWidth = 2; ctx.beginPath(); points.forEach((q, i) => i ? ctx.lineTo(cx + q.x * scale, cy - q.y * scale) : ctx.moveTo(cx + q.x * scale, cy - q.y * scale)); ctx.stroke();
    const q = sampleTrajectory(points, replayPhase); const px = Math.round(cx + q.x * scale), py = Math.round(cy - q.y * scale);
    ctx.fillStyle = '#edf3d9'; ctx.fillRect(px - 5, py - 5, 12, 12); ctx.fillStyle = '#d8a361'; ctx.fillRect(px - 2, py - 2, 6, 6);
    ctx.restore(); ctx.fillStyle = '#d0dcbf'; ctx.fillText(`模型时间 ${fmt(q.t * 1000, 3)} ms / 该段 ${fmt(mot.t * 1000, 3)} ms`, 157, 385);
    $('mot-local').textContent = `当前标记：x = ${fmt(q.x * 1000, 2)} mm，y = ${fmt(q.y * 1000, 2)} mm；vx = ${fmt(q.vx, 2)} m/s，vy = ${fmt(q.vy, 2)} m/s。`;
  }
  function stopReplay() { replaying = false; previous = null; $('mot-replay').textContent = '▶ 回放所选原子'; $('mot-replay').setAttribute('aria-pressed', 'false'); }
  function renderMap() {
    if (!map) return;
    const children = [];
    for (let row = map.rows - 1; row >= 0; row--) for (let col = 0; col < map.columns; col++) {
      const cell = map.cells[col * map.rows + row], button = document.createElement('button'); button.className = `capture-cell ${cell.status}`;
      const label = `轴向初速 ${cell.initialVelocity} m/s，横向初速 ${cell.transverseVelocity} m/s：${STATUS[cell.status]}`;
      button.title = label; button.setAttribute('aria-label', label); button.dataset.vz = cell.initialVelocity; button.dataset.vt = cell.transverseVelocity;
      button.addEventListener('click', () => { p = { ...p, initialVelocity: cell.initialVelocity, transverseVelocity: cell.transverseVelocity }; update(); });
      button.addEventListener('keydown', event => {
        const index = children.indexOf(button), target = { ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: index - map.columns, ArrowDown: index + map.columns }[event.key];
        if (target !== undefined && children[target]) { event.preventDefault(); children[target].focus(); children[target].click(); }
      }); children.push(button);
    }
    $('capture-map').replaceChildren(...children); renderSelection();
  }
  function renderSelection() {
    let selected = false;
    for (const button of $('capture-map').querySelectorAll('button')) {
      const active = Math.abs(Number(button.dataset.vz) - p.initialVelocity) < .01 && Math.abs(Number(button.dataset.vt) - p.transverseVelocity) < .01;
      button.setAttribute('aria-pressed', String(active)); button.tabIndex = active ? 0 : -1; if (active) selected = true;
    }
    if (!selected) $('capture-map').querySelector('button')?.setAttribute('tabindex', '0');
  }
  function requestMap() {
    if (!worker) { $('capture-map').setAttribute('aria-busy', 'false'); $('capture-map').classList.remove('pending'); $('capture-map-status').textContent = '后台参数图未能加载；单原子计算仍可使用。'; return; }
    const key = JSON.stringify([p.detuning, p.fieldScale, p.motDetuning, p.gradient]);
    if (key === mapKey) { renderSelection(); return; }
    mapKey = key; request++; const id = request;
    $('capture-map').setAttribute('aria-busy', 'true'); $('capture-map').classList.add('pending'); $('capture-map-status').textContent = '正在重新计算；旧图暂不代表当前参数…';
    clearTimeout(timer); timer = setTimeout(() => worker?.postMessage({ id, parameters: p }), 120);
  }
  function update(stage) {
    stopReplay(); replayPhase = 0; renderControls(); result = simulateCooling(p); renderResults(); requestMap(); onChange(result, stage);
  }
  try {
    worker = new Worker(new URL('./cooling-worker.mjs?v=locking-1', import.meta.url), { type: 'module' });
    worker.addEventListener('message', event => {
      if (event.data.id !== request) return;
      $('capture-map').setAttribute('aria-busy', 'false'); $('capture-map').classList.remove('pending');
      if (event.data.error) { $('capture-map-status').textContent = event.data.error; return; }
      map = event.data.map; renderMap(); $('capture-map-status').textContent = '25 × 13 个试探初态 · 点击选择';
    });
    worker.addEventListener('error', () => { worker.terminate(); worker = undefined; $('capture-map-status').textContent = '参数图未能加载；单原子计算仍可使用。'; $('capture-map').classList.remove('pending'); $('capture-map').setAttribute('aria-busy', 'false'); });
  } catch { $('capture-map-status').textContent = '浏览器未启用后台计算；单原子计算仍可使用。'; }
  for (const [id, key] of CONTROLS) $(id).addEventListener('input', event => { p[key] = Number(event.target.value); update(id.startsWith('zs') ? 1 : 2); });
  document.querySelectorAll('[data-cooling-preset]').forEach(button => button.addEventListener('click', () => { p = { ...DEFAULT_COOLING, ...PRESETS[button.dataset.coolingPreset] }; update(['no-gradient', 'blue', 'reversed', 'transverse'].includes(button.dataset.coolingPreset) ? 2 : 1); }));
  $('zs-probe').addEventListener('input', () => { renderProbe(); renderCharts(); });
  $('mot-replay').addEventListener('click', () => {
    if (replaying) { stopReplay(); return; }
    if (replayPhase >= 1) replayPhase = 0; replaying = true; previous = null; $('mot-replay').textContent = 'Ⅱ 暂停原子回放'; $('mot-replay').setAttribute('aria-pressed', 'true');
  });
  $('mot-restart').addEventListener('click', () => { stopReplay(); replayPhase = 0; drawMot(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopReplay(); });
  function frame(now) {
    if (replaying) { if (previous !== null) replayPhase = Math.min(1, replayPhase + Math.min(.1, (now - previous) / 1000) / 2.8); previous = now; drawMot(); if (replayPhase >= 1) stopReplay(); }
    requestAnimationFrame(frame);
  }
  update(); requestAnimationFrame(frame);
  return { pause: stopReplay };
}

export function createProductGuide() {
  const groups = ['source', 'control', 'reference', 'application'];
  $('product-cards').replaceChildren(...PRODUCT_GUIDE.map(item => {
    const card = document.createElement('article'); card.dataset.group = item.group;
    const role = document.createElement('p'); role.className = 'eyebrow'; role.textContent = item.role;
    const name = document.createElement('h3'); name.textContent = item.name;
    const model = document.createElement('p'); model.className = 'model-name'; model.textContent = item.model;
    const explanation = document.createElement('p'); explanation.textContent = item.explanation;
    const boundary = document.createElement('p'); boundary.className = 'product-boundary'; boundary.textContent = item.boundary;
    const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '阅读厂家产品页 ↗';
    card.append(role, name, model, explanation, boundary, link); return card;
  }));
  function select(group) {
    document.querySelectorAll('[data-product-group]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.productGroup === group)));
    $('product-cards').querySelectorAll('article').forEach(card => { card.hidden = card.dataset.group !== group; });
    $('product-group-count').textContent = `本组 ${PRODUCT_GUIDE.filter(item => item.group === group).length} 个产品页面 / 共 ${PRODUCT_GUIDE.length} 个`;
  }
  document.querySelectorAll('[data-product-group]').forEach(b => b.addEventListener('click', () => select(b.dataset.productGroup)));
  select(groups[0]);
}

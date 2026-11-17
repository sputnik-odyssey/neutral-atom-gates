import { PARAMETERS as P, createPopulation, advancePopulation, expectedAtoms, unrefilledAtoms } from './loading-model.mjs';
import { EQUIPMENT, STAGES, PAPER, AOSENSE } from './loading-catalog.mjs';
import { createCoolingDemo, createProductGuide } from './cooling-demo.mjs';
import { ASSUMPTIONS as COOLING, sampleTrajectory } from './cooling-model.mjs';

const $ = id => document.getElementById(id);
const canvas = $('loading-scene'), ctx = canvas.getContext('2d');
let view = 'rb', step = 0, progress = 0, playing = false, speed = 1, previous = null;
let population = createPopulation(), history = [], selected = 'mot';
let coolingResult = null, coolingDemo;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const palette = { bg: '#142b2d', grid: '#1c3436', metal: '#69837b', edge: '#aec2ad', void: '#091d24', light: '#65c2c3', atom: '#f0bb76', text: '#d6e4cc', muted: '#809c8f', green: '#92bc7a', signal: '#c99954' };

function box(x, y, w, h, fill = palette.metal, stroke = palette.edge) {
  ctx.fillStyle = stroke; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
}
function text(t, x, y, color = palette.text, size = 12) {
  ctx.fillStyle = color; ctx.font = `${size}px "PingFang SC", "Microsoft Yahei", sans-serif`; ctx.fillText(t, x, y);
}
function line(points, color, width = 3, dash = []) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
}
function atom(x, y, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.fillStyle = '#784f37'; ctx.fillRect(Math.round(x) - 4, Math.round(y) - 4, 10, 10);
  ctx.fillStyle = palette.atom; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 6, 6);
  ctx.fillStyle = '#ffe0a4'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 2, 2); ctx.globalAlpha = 1;
}
function particles(x1, y1, x2, y2, phase, n = 7, alpha = 1) {
  for (let i = 0; i < n; i++) { const q = (phase + i / n) % 1; atom(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q, alpha); }
}
function device(x, y, w, h) {
  box(x, y, w, h, '#38504c', '#719181');
  for (let yy = y + 12; yy < y + h - 5; yy += 9) { ctx.fillStyle = '#233d38'; ctx.fillRect(x + 9, yy, 18, 3); }
  ctx.fillStyle = palette.green; ctx.fillRect(x + w - 14, y + 9, 5, 5);
}
function grid() {
  ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, 1080, 600);
  ctx.fillStyle = palette.grid;
  for (let x = 18; x < 1080; x += 24) for (let y = 18; y < 600; y += 24) ctx.fillRect(x, y, 2, 2);
}
function rbScene(phase) {
  const sourceOn = population.source;
  const available = population.transfer && (population.reservoir > 0 || population.source);
  text('⁸⁷Rb / 真空中的原子供给链', 30, 31, palette.text, 14);
  text('捕获区', 66, 151, palette.muted); text('差分抽气与运输', 279, 220, palette.muted);
  text('科学腔', 562, 174, palette.muted);
  // Custom glass MOT cell and rubidium dispenser arms.
  box(55, 212, 143, 130, '#244c4d'); box(80, 182, 19, 33, '#345552'); box(151, 184, 19, 30, '#345552');
  box(67, 225, 119, 105, '#0d3039', '#547a75');
  line([[35, 277], [216, 277]], sourceOn ? palette.light : '#385b5e', 8);
  line([[128, 192], [128, 361]], sourceOn ? palette.light : '#385b5e', 8);
  box(75, 235, 105, 79, '#0d3039', '#3a6766');
  for (let i = 0; i < 19; i++) atom(97 + (i * 17 % 65) + Math.sin(phase * Math.PI * 2 + i) * 3, 250 + (i * 13 % 43), sourceOn ? 1 : .22);
  // Bent differential pumping tube: the atoms follow the vacuum path.
  box(198, 262, 124, 28, palette.void, '#60877a'); box(314, 247, 28, 43, palette.void, '#60877a');
  box(334, 247, 186, 28, palette.void, '#60877a');
  for (const x of [218, 287, 374, 468]) box(x, x < 320 ? 257 : 242, 10, 38, '#395b53', '#93ac99');
  line([[201, 277], [328, 277], [328, 261], [518, 261]], sourceOn ? '#406b61' : '#304d4b', 5);
  if (sourceOn && step === 1) { particles(205, 277, 311, 277, phase, 4); particles(344, 261, 514, 261, phase, 5); }
  // Science chamber and crossing lattice belts.
  box(515, 198, 178, 158, '#436962'); box(527, 211, 154, 132, '#102e36', '#70998b');
  line([[532, 262], [676, 262]], '#4b8b81', 6); line([[570, 331], [646, 222]], '#4b8b81', 6);
  for (let i = 0; i < 7; i++) atom(576 + i * 8, 261 + (i % 2) * 7, population.reservoir ? 1 : .18);
  text('两段晶格交接 / 储库', 533, 380, palette.muted, 10);
  // Objective / collection optics. Atom paths never go through instruments.
  box(576, 364, 60, 23, '#496761'); box(586, 389, 40, 24, '#496761');
  text('Special Optics 定制物镜', 499, 433, palette.muted, 10);
  device(539, 53, 116, 65); box(579, 118, 33, 23, '#496761');
  line([[602, 235], [602, 141]], '#678c80', 3); text('荧光 → 相机', 617, 162, palette.muted, 10);
  // Zoom is a viewport, not a transport connection.
  line([[693, 228], [746, 80]], '#71867a', 1, [4, 6]); line([[693, 333], [746, 413]], '#71867a', 1, [4, 6]);
  box(748, 55, 307, 368, '#122b31', '#456b5b');
  text('科学腔内分区 · 放大示意', 766, 79, palette.text, 12);
  text('存储区 / 6 组轮换', 766, 106, palette.muted, 10);
  const activeGroup = population.next;
  for (let g = 0; g < 6; g++) {
    const at = population.loaded[g], survive = at === null ? 0 : Math.exp(-(population.cycles * P.cycle - at) / P.lifetime);
    const highlight = g === activeGroup && step === 5 && available;
    box(766 + g * 45, 118, 37, 85, highlight ? '#6b694a' : '#284c42', highlight ? '#e8bd77' : '#5c8363');
    text(`${g + 1}`, 779 + g * 45, 136, palette.muted, 10);
    for (let a = 0; a < 10; a++) atom(776 + g * 45 + a % 2 * 14, 150 + Math.floor(a / 2) * 10, survive * (highlight ? 1 - phase * .65 : 1));
  }
  text('像素按组缩比；每组模型容量 540', 766, 222, palette.muted, 9);
  box(788, 254, 222, 46, '#254941', '#618469'); text('制备区 / 成像 · 排序 · 初始化', 796, 248, palette.text, 10);
  for (let i = 0; i < 12; i++) atom(802 + i * 17, 277, available ? .85 : .13);
  box(788, 344, 222, 48, '#25454a', '#50857c'); text('原子储库', 797, 336, palette.text, 10);
  if (population.reservoir || population.source) for (let i = 0; i < 23; i++) atom(801 + i * 37 % 195, 357 + i * 11 % 25, .8);
  line([[1028, 366], [1028, 277]], '#426b5f', 2); text('提取', 1018, 322, palette.muted, 9);
  if (step === 2 && available) particles(1027, 365, 1027, 277, phase, 4);
  if (step === 4 && available) particles(784 + activeGroup * 45, 270, 784 + activeGroup * 45, 205, phase, 4);
  if (step === 3 && available) { ctx.fillStyle = `rgba(101,194,195,${.08 + phase * .2})`; ctx.fillRect(788, 254, 222, 46); }
  // Real optical/control components, isolated from the vacuum atom route.
  device(72, 468, 245, 90); device(360, 468, 206, 90); device(605, 468, 218, 90); device(851, 468, 203, 90);
  line([[317, 491], [360, 491]], palette.light, 3); line([[317, 538], [340, 538], [340, 578], [655, 578], [655, 558]], palette.light, 3);
  line([[463, 468], [463, 402], [586, 402]], palette.light, 3); line([[715, 468], [715, 402], [626, 402]], palette.light, 3);
  line([[952, 558], [952, 590], [463, 590], [463, 558]], palette.signal, 2, [7, 5]);
  line([[1039, 468], [1067, 468], [1067, 42], [655, 42], [655, 75]], palette.signal, 2, [7, 5]);
  text('光镊光源', 140, 454, palette.muted, 10); text('动态光镊光路', 415, 454, palette.muted, 10); text('静态光镊光路', 660, 454, palette.muted, 10); text('时序与 RF 波形', 911, 454, palette.muted, 10);
  text(sourceOn ? '上游：运行' : '上游：关闭', 49, 392, sourceOn ? palette.green : palette.atom, 11);
  text(population.transfer ? '制备 / 搬运：运行' : '制备 / 搬运：暂停', 765, 445, population.transfer ? palette.green : palette.atom, 10);
}
function srScene(phase) {
  text('AOSense Beam-RevD-Sr / ⁸⁸Sr 冷原子束系统', 35, 34, palette.text, 15);
  text('集成结构的功能展开，外壳轮廓及内部距离不按实物比例', 35, 61, palette.muted, 11);
  // Continuous vacuum envelope: source -> slower -> 2D MOT -> output.
  box(66, 228, 142, 127, '#58716a'); box(84, 249, 107, 84, '#332c2c', '#b59b73');
  for (let i = 0; i < 5; i++) box(94 + i * 17, 253, 9, 77, '#745d43', '#a88a5c');
  box(208, 269, 486, 44, palette.void, '#829c8d');
  for (let i = 0; i < 10; i++) { const x = 247 + i * 39; box(x, 207 + i * 2, 21, 57 - i * 2, i % 2 ? '#6b6581' : '#4a687a', '#9da6a0'); box(x, 318, 21, 57 - i * 2, i % 2 ? '#4a687a' : '#6b6581', '#9da6a0'); }
  box(690, 227, 155, 129, '#486d65'); box(707, 245, 121, 94, '#102e36', '#70998b');
  box(845, 269, 140, 44, palette.void, '#829c8d'); box(891, 260, 14, 62, '#3c6357', '#abc1a5');
  box(973, 256, 28, 70, '#607b6c', '#b9c5af');
  line([[665, 291], [218, 291]], palette.light, 5); ctx.fillStyle = palette.light; ctx.fillRect(220, 284, 10, 14); ctx.fillRect(214, 288, 6, 6);
  text('减速激光 ←', 429, 409, palette.light, 12);
  line([[767, 211], [767, 370]], palette.light, 9); line([[687, 263], [849, 322]], palette.light, 7);
  box(710, 250, 114, 83, '#10343a', '#4e7c73');
  // Same atom stream; movement slows and narrows, no flux/qubit-rate inference.
  particles(95, 287, 205, 287, phase * 1.4 % 1, 5, step === 0 ? 1 : .6);
  for (let i = 0; i < 13; i++) { const q = (phase + i / 13) % 1; const slowed = 1 - (1 - q) ** 1.6; atom(220 + 460 * slowed, 285 + (i % 3 - 1) * 6, step === 1 ? 1 : .65); }
  for (let i = 0; i < 11; i++) atom(721 + i * 9, 290 + Math.sin(phase * 6 + i) * (step === 2 ? 6 : 10), step === 2 ? 1 : .7);
  particles(852, 290, 974, 290, phase * .55 % 1, 7, step === 3 ? 1 : .65);
  text('热原子炉', 99, 194, palette.text, 14); text('永磁塞曼减速器', 356, 163, palette.text, 14); text('2D MOT', 732, 195, palette.text, 14); text('冷束输出', 908, 233, palette.text, 13);
  text('热原子 →', 95, 384, palette.atom, 11); text('横向冷却 / 净轴向通量', 686, 407, palette.muted, 11);
  text('接用户真空腔 →', 901, 352, palette.muted, 11);
  text('后续捕获、俘获与态制备未画出', 835, 381, palette.muted, 10);
  if (coolingResult) {
    const q = sampleTrajectory(coolingResult.slower.points, phase);
    const x = Math.round(220 + 460 * q.z / COOLING.length);
    ctx.strokeStyle = '#eff4d9'; ctx.lineWidth = 2; ctx.strokeRect(x - 7, 282, 15, 15);
    text(`教学初态 v₀=${coolingResult.parameters.initialVelocity} m/s → 末速度 ${coolingResult.slower.velocity.toFixed(1)} m/s`, 35, 91, palette.text, 11);
    text(coolingResult.captured ? '所选初态：满足教学接收窗口' : '所选初态：未满足教学接收窗口', 35, 113, coolingResult.captured ? palette.green : palette.atom, 11);
    text('白框追踪：按下方模型计算；像素粒子流不代表实测通量', 264, 548, palette.muted, 10);
  }
  line([[53, 433], [1024, 433]], '#486758', 1, [5, 6]);
  text('厂家集成单元 / 不是 ⁸⁷Rb 实验的供给源', 344, 531, palette.muted, 12);
  text('在下方调节失谐、磁场与初速度，可查看计算轨迹和捕获区域。', 300, 577, palette.muted, 10);
}
function renderScene() { grid(); view === 'rb' ? rbScene(progress) : srScene(progress); }
function selectEquipment(id, focus = false) {
  const e = EQUIPMENT.find(item => item.id === id); if (!e) return;
  selected = id; $('equipment-kind').textContent = e.kind; $('equipment-title').textContent = e.name;
  $('equipment-model').textContent = e.model; $('equipment-role').textContent = e.role; $('equipment-source').href = e.source;
  document.querySelectorAll('.pin').forEach(pin => pin.setAttribute('aria-pressed', String(pin.dataset.equipment === id)));
  if (focus) $('equipment-title').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
}
function renderStep() {
  const stages = STAGES[view], current = stages[step];
  $('steps').replaceChildren(...stages.map((s, i) => {
    const button = document.createElement('button'); button.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b>${s.short}`;
    if (step === i) button.setAttribute('aria-current', 'step');
    button.addEventListener('click', () => { setPlaying(false); step = i; progress = 0; renderStep(); renderScene(); }); return button;
  }));
  $('steps').dataset.count = String(stages.length);
  $('step-number').textContent = `步骤 ${step + 1} / ${stages.length}`;
  $('step-title').textContent = current.title; $('step-body').textContent = current.body;
  $('parallel-note').textContent = view === 'rb' ? '请同时看右上角：新原子沿补给链前进，其余存储组保留在光阱中。流程速度被刻意放慢，不对应真实毫秒时序。' : '此视图只有冷束源，不计算寄存器中的原子数。⁸⁸Sr 与另一视图的 ⁸⁷Rb 是不同元素。';
  selectEquipment(current.device);
}
function setView(next) {
  if (!STAGES[next]) return;
  setPlaying(false); view = next; step = 0; progress = 0;
  document.querySelectorAll('[data-view]').forEach(b => { const active = b.dataset.view === view; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; });
  $('apparatus').setAttribute('aria-labelledby', `tab-${view}`);
  $('view-caption').innerHTML = view === 'rb' ? `实验依据：Chiu 等，Nature（2025）<a href="${PAPER}" target="_blank" rel="noopener noreferrer">连续运行的 3,000 比特系统 ↗</a>。沿用已公开的设备制造商和型号；图中分区与外形是教学重绘。` : `产品依据：<a href="${AOSENSE}" target="_blank" rel="noopener noreferrer">AOSense Cold Atomic Beam System ↗</a>。本视图以真实的 Beam-RevD-Sr 为例，只展开冷束源的功能，不将它接入铷阵列。<a href="#sr-controls">调节冷却参数与初速度 ↓</a>`;
  $('population-section').hidden = view !== 'rb'; $('sr-boundary').hidden = view !== 'sr';
  $('sr-controls').hidden = view !== 'sr';
  if (view !== 'sr') coolingDemo?.pause();
  $('equipment-pins').replaceChildren(...EQUIPMENT.filter(e => e.view === view).map(e => {
    const pin = document.createElement('button'); pin.className = 'pin'; pin.dataset.equipment = e.id;
    pin.style.left = `${e.x}%`; pin.style.top = `${e.y}%`; pin.innerHTML = `${e.name}<span>${e.id === 'control' ? '数字 / 模拟控制 + AWG' : e.id === 'laser' ? '828 / 852 nm 光镊系统' : e.model}</span>`;
    pin.addEventListener('click', () => selectEquipment(e.id)); return pin;
  }));
  renderStep(); renderScene();
}
function setPlaying(on) {
  playing = on; previous = null; $('play').textContent = on ? 'Ⅱ 暂停流程' : '▶ 播放流程'; $('play').setAttribute('aria-pressed', String(on));
  $('play-status').textContent = on ? '播放中 · 教学慢速' : '已暂停 · 可逐步查看';
}
function nextStep() {
  progress = 0;
  if (step === STAGES[view].length - 1) { if (view === 'rb') advanceModel(1); step = 0; } else step++;
  renderStep(); renderScene();
}
function recordHistory() {
  const record = { time: population.cycles * P.cycle, current: expectedAtoms(population), off: unrefilledAtoms(population) };
  if (history.at(-1)?.time === record.time) history[history.length - 1] = record; else history.push(record);
  // Keep a bounded, evenly thinned history without erasing the initial condition.
  if (history.length > 1000) history = history.filter((_, i) => i % 2 === 0 || i === history.length - 1);
}
function advanceModel(cycles) {
  for (let i = 0; i < cycles; i++) { population = advancePopulation(population); recordHistory(); }
  renderPopulation(); renderScene();
}
function renderPopulation() {
  $('model-time').textContent = `${(population.cycles * P.cycle).toFixed(2)} s`;
  $('atom-count').textContent = expectedAtoms(population).toFixed(1);
  $('reservoir-count').textContent = `${population.reservoir} / ${P.reservoirBatches}`;
  $('source-running').checked = population.source; $('transfer-running').checked = population.transfer;
  const messages = { ready: '已建立的六组阵列。关闭一个链路，再推进 60 s，比较数量曲线。', replaced: `第 ${population.lastGroup + 1} 组已更新，其他五组保留。累计完成 ${population.replacements} 次组替换。`, 'transfer-off': '准备 / 搬运暂停：即使上游有原子，存储区也得不到新批次，已有原子继续衰减。', 'source-empty': '两批库存已用尽：没有新批次，本轮保留原组；已有原子继续衰减。' };
  $('population-status').textContent = messages[population.last];
  const maxT = Math.max(.48, population.cycles * P.cycle), x = t => 47 + t / maxT * 452, y = n => 205 - n / 3240 * 165;
  const path = key => history.map((v, i) => `${i ? 'L' : 'M'}${x(v.time).toFixed(2)},${y(v[key]).toFixed(2)}`).join(' ');
  $('population-chart').innerHTML = `<title>预计在阱原子数随模型时间变化</title><desc>当前 ${expectedAtoms(population).toFixed(1)}，同初始数量且全程不补充为 ${unrefilledAtoms(population).toFixed(1)}。时间 ${maxT.toFixed(2)} 秒。</desc><g font-family="sans-serif" font-size="10" fill="#788370"><text x="6" y="18">原子数（期望）</text>${[0, 1620, 3240].map(n => `<line x1="47" y1="${y(n)}" x2="499" y2="${y(n)}" stroke="#dae1d2"/><text x="7" y="${y(n) + 4}">${n}</text>`).join('')}<text x="47" y="225">0 s</text><text x="440" y="225">${maxT.toFixed(2)} s</text></g><path d="${path('off')}" fill="none" stroke="#9ba38e" stroke-width="2" stroke-dasharray="5 5"/><path d="${path('current')}" fill="none" stroke="#3d7d50" stroke-width="2.5"/><circle cx="${x(population.cycles * P.cycle)}" cy="${y(expectedAtoms(population))}" r="3.5" fill="#3d7d50"/>`;
  $('groups').replaceChildren(...population.loaded.map((at, g) => {
    const fraction = at === null ? 0 : Math.exp(-(population.cycles * P.cycle - at) / P.lifetime);
    const item = document.createElement('div'); item.className = `group${population.last === 'replaced' && population.lastGroup === g ? ' fresh' : ''}`;
    item.style.background = `rgba(126,168,99,${.08 + fraction * .23})`;
    item.innerHTML = `${g + 1} 组<span>${at === null ? '未装入' : `${(fraction * 100).toFixed(1)}%`}</span>`; return item;
  }));
}
function resetPopulation(empty) { setPlaying(false); population = createPopulation(empty); history = []; recordHistory(); renderPopulation(); renderScene(); }

document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('tab-rb').parentElement.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setView(event.key === 'Home' ? 'rb' : event.key === 'End' ? 'sr' : view === 'rb' ? 'sr' : 'rb'); $(`tab-${view}`).focus(); }
});
$('play').addEventListener('click', () => setPlaying(!playing));
$('next').addEventListener('click', () => { setPlaying(false); nextStep(); });
$('reset-animation').addEventListener('click', () => { setPlaying(false); step = 0; progress = 0; renderStep(); renderScene(); });
$('speed').addEventListener('change', () => { speed = Number($('speed').value); });
$('cycle').addEventListener('click', () => advanceModel(1)); $('second').addEventListener('click', () => advanceModel(13)); $('minute').addEventListener('click', () => advanceModel(750));
$('reset-population').addEventListener('click', () => resetPopulation(false)); $('empty-population').addEventListener('click', () => resetPopulation(true));
for (const [id, key] of [['source-running', 'source'], ['transfer-running', 'transfer']]) $(id).addEventListener('change', event => {
  population[key] = event.target.checked; renderScene();
  $('population-status').textContent = key === 'source' ? (population.source ? '上游恢复运行。下一轮可继续供应新批次。' : `上游已关闭。剩余 ${population.reservoir} 批库存仍可支持后续替换；耗尽后停止补充。`) : (population.transfer ? '准备 / 搬运恢复。下一轮在有新批次时更新一组。' : '准备 / 搬运已暂停。上游原子不会自动进入存储区。');
});
$('equipment-table').replaceChildren(...EQUIPMENT.map(e => {
  const row = document.createElement('tr'); const name = document.createElement('td'); const button = document.createElement('button');
  button.textContent = `${e.view === 'rb' ? '⁸⁷Rb' : '⁸⁸Sr'} · ${e.name}`; button.addEventListener('click', () => { setView(e.view); selectEquipment(e.id, true); }); name.append(button);
  const model = document.createElement('td'); model.textContent = e.model;
  const source = document.createElement('td'); const link = document.createElement('a'); link.href = e.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = e.source === PAPER ? '论文 Methods ↗' : '厂家资料 ↗'; source.append(link);
  row.append(name, model, source); return row;
}));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
function frame(now) {
  if (playing) {
    if (previous !== null) { progress += Math.min((now - previous) / 1000, .1) * speed / 3; if (progress >= 1) nextStep(); }
    previous = now; renderScene();
  }
  requestAnimationFrame(frame);
}
recordHistory(); renderPopulation();
coolingDemo = createCoolingDemo({ onChange: (result, activeStep) => {
  coolingResult = result;
  if (view === 'sr' && activeStep !== undefined) { setPlaying(false); step = activeStep; progress = 0; renderStep(); }
  renderScene();
} });
createProductGuide();
setView(new URLSearchParams(location.search).get('view') === 'sr' || location.hash === '#sr-controls' ? 'sr' : 'rb');
if (location.hash === '#sr-controls') $('sr-controls').scrollIntoView({ behavior: 'instant', block: 'start' });
requestAnimationFrame(frame);

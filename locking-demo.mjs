import { LOCK_ASSUMPTIONS as A, DEFAULT_LOCK, LOCK_PRESETS, simulateLock, sampleLock, discriminator } from './locking-model.mjs';
import { simulateLockedCapture } from './locking-capture.mjs';
import { DEFAULT_COOLING, ASSUMPTIONS as C, designVelocity } from './cooling-model.mjs?v=locking-1';

const $ = id => document.getElementById(id);
const f = (value, digits = 2) => Number(value).toFixed(digits).replace('-', '−');
const CONTROLS = [['lock-gain', 'gain', '', 2], ['lock-integral', 'integral', 'ms⁻¹', 2], ['lock-delay', 'delay', 'ms', 2], ['lock-range', 'range', 'MHz', 0], ['lock-drift', 'drift', 'MHz/ms', 2], ['lock-reference', 'referenceOffset', 'MHz', 0]];
const STATES = { locked: '已满足模型的相对参考锁定判据', acquiring: '接近参考，尚未满足持续时间判据', unlocked: '相对参考频差仍较大', missing: '参考信号缺失：保持命令，冻结积分', outside: '鉴频信号过弱：已离开本模型的有效区', saturated: '执行器校正已接近或达到行程限制', open: '仅保留驱动功能：外部光频反馈关闭' };
const EQUIPMENT_NOTES = {
  ecdl: ['AOSense AOS-IF-ECDL-461', '厂家目录列有 461 nm Sr 配置及相应 SILC 配对。本图重绘其“可调激光源”功能，没有复现内部光学结构。', 'https://aosense.com/products/lasers/external-cavity-diode-lasers/'],
  servo: ['ILC / SILC 的控制功能', 'ILC 提供电流、PZT、温度控制；SILC 另有外部参考的锁频伺服。本页以一个慢速等效 PI 环路表示，不采用厂家固件或真实调谐系数。', 'https://aosense.com/products/electronics/integrated-laser-controller-servo/'],
  reference: ['参考与鉴频：教学抽象', '真实系统可选物种适配的光谱参考、光学腔或拍频方案。本图没有给此功能块编造商品型号，也没有把标准 Rb/Cs LLM 作为 Sr 461 nm 参考。', 'https://doi.org/10.1119/1.1286663'],
  source: ['AOSense Beam-RevD-Sr', '真实冷源的功能作为教学背景。所选原子的速度和出口结果由本页简化模型计算，不是这台设备的实测通量或效率。', 'https://aosense.com/products/atom-beam-sources/cold-atomic-beam-system/'],
};
const path = (points, x, y) => points.map((q, i) => `${i ? 'L' : 'M'}${x(q).toFixed(2)},${y(q).toFixed(2)}`).join(' ');

export function createLockingDemo({ onResult = () => {} } = {}) {
  let p = { ...DEFAULT_LOCK }, trace, selected, atom, cursor = 200, playing = false, last = null, lastPaint = 0, worker, sequence = 0, jobTimer, selectedDevice = 'servo';
  let arrivals = [];
  const ctx = $('locking-scene').getContext('2d');
  function controls() {
    for (const [id, key, unit, digits] of CONTROLS) { $(id).value = p[key]; $(`${id}-value`).textContent = `${f(p[key], digits)} ${unit}`.trim(); }
    $('lock-mode').value = p.mode; $('lock-event').value = p.event; $('lock-polarity').checked = p.polarity < 0;
    document.querySelectorAll('[data-lock-preset]').forEach(button => { const candidate = { ...DEFAULT_LOCK, ...LOCK_PRESETS[button.dataset.lockPreset] }; button.setAttribute('aria-pressed', String(Object.keys(DEFAULT_LOCK).every(key => candidate[key] === p[key]))); });
  }
  function equipment(id) {
    selectedDevice = id; const [title, body, url] = EQUIPMENT_NOTES[id];
    const strong = document.createElement('b'); strong.textContent = title;
    const span = document.createElement('span'); span.textContent = body;
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = '阅读来源 ↗';
    $('lock-equipment-note').replaceChildren(strong, span, a);
    document.querySelectorAll('[data-lock-device]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lockDevice === id)));
  }
  function box(x, y, w, h, fill = '#34514a', edge = '#779a83') { ctx.fillStyle = edge; ctx.fillRect(x, y, w, h); ctx.fillStyle = fill; ctx.fillRect(x + 3, y + 3, w - 6, h - 6); }
  function line(points, color, width = 3, dash = []) { ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]); }
  function text(value, x, y, color = '#c2d6b8', size = 12) { ctx.font = `${size}px "PingFang SC",sans-serif`; ctx.fillStyle = color; ctx.fillText(value, x, y); }
  function drawScene() {
    ctx.fillStyle = '#142b2d'; ctx.fillRect(0, 0, 1080, 400);
    for (let x = 12; x < 1080; x += 24) for (let y = 12; y < 400; y += 24) { ctx.fillStyle = '#203a38'; ctx.fillRect(x, y, 2, 2); }
    box(60, 48, 290, 107); box(60, 249, 290, 107); box(448, 46, 245, 109, '#294648'); box(738, 48, 105, 108, '#294648');
    box(444, 251, 254, 86, '#273f45'); box(770, 210, 264, 133, '#3f655a'); box(784, 224, 235, 105, '#112f35', '#75a28d');
    // Optical split: one sample to the reference, another to the cooling branches.
    line([[350, 101], [448, 101]], '#68bac1', 5); line([[693, 101], [738, 101]], '#68bac1', 5);
    box(396, 87, 20, 29, '#466f68', '#9cc9bb'); line([[406, 116], [406, 293], [444, 293]], '#68bac1', 5); line([[698, 293], [770, 293]], '#68bac1', 5);
    text('取样光', 365, 76, '#8cb8b2', 10); text('频率鉴别', 741, 39, '#8da995', 10); text('主光路', 358, 221, '#8cb8b2', 10);
    text('理想固定频偏支路', 471, 278, '#adc8b9', 12); text('ZS −650 / MOT −32 MHz', 462, 309, '#8daca3', 11);
    const feedbackColor = p.mode === 'ilc' ? '#4d5a4b' : p.polarity < 0 ? '#bd8662' : '#cfad6e';
    line([[789, 156], [789, 192], [203, 192], [203, 249]], feedbackColor, 3, [7, 6]);
    line([[60, 303], [30, 303], [30, 100], [60, 100]], feedbackColor, 3, [7, 6]);
    text('误差信号 E', 468, 181, '#bfa66e', 11); text('电流 / PZT 等效校正', 70, 224, '#bfa66e', 10);
    line([[523, 187], [517, 192], [523, 197]], feedbackColor, 2);
    line([[25, 185], [30, 179], [35, 185]], feedbackColor, 2);
    line([[717, 288], [723, 293], [717, 298]], '#68bac1', 2);
    text('探测 / 解调', 751, 100, '#a8beb2', 10);
    const phase = (cursor / 16) % 1;
    for (let i = 0; i < 4; i++) { const q = (phase + i / 4) % 1; ctx.fillStyle = '#a0d2d2'; ctx.fillRect(352 + q * 92, 98, 5, 5); ctx.fillRect(701 + q * 66, 290, 5, 5); }
    if (p.mode === 'silc' && selected.valid) for (let i = 0; i < 7; i++) { ctx.fillStyle = feedbackColor; ctx.fillRect(780 - ((phase + i / 7) % 1) * 560, 189, 5, 5); }
    // LEDs distinguish the laser driver being powered from the external loop being valid.
    ctx.fillStyle = '#a1c383'; ctx.fillRect(322, 57, 7, 7);
    ctx.fillStyle = selected.locked ? '#a1c383' : p.mode === 'ilc' ? '#7e927e' : '#d2a16a'; ctx.fillRect(321, 260, 7, 7);
    ctx.fillStyle = selected.present ? '#9bc27e' : '#a16e5a'; ctx.fillRect(815, 60, 7, 7);
    text(p.mode === 'silc' ? `E=${f(selected.error, 3)} V` : '外部频率环路：关闭', 83, 340, '#b8cbaa', 11);
    text(`ℓ=${f(selected.frequency)} MHz`, 73, 144, '#b8cbaa', 11);
    text(selected.present ? '参考存在' : '参考缺失', 745, 144, selected.present ? '#96b58b' : '#d2a16a', 10);
    // A single representative atom, never an absolute-flux animation.
    line([[803, 249], [1004, 249]], '#548c83', 3);
    const atomX = atom.captured ? 806 + phase * 190 : atom.slower.accepted ? 922 : 832;
    const atomY = !atom.captured && atom.slower.accepted ? 230 : 246;
    ctx.fillStyle = '#e4e8c9'; ctx.fillRect(Math.round(atomX) - 2, atomY - 2, 10, 10);
    ctx.fillStyle = atom.captured ? '#a9c880' : '#cd9f69'; ctx.fillRect(Math.round(atomX), atomY, 6, 6);
    if (!atom.captured) { line([[atomX + 13, atomY - 5], [atomX + 21, atomY + 3]], '#c89c76', 2); line([[atomX + 21, atomY - 5], [atomX + 13, atomY + 3]], '#c89c76', 2); }
    text(atom.captured ? '所选入射原子：通过窗口' : '所选入射原子：未通过窗口', 795, 366, atom.captured ? '#a6c78c' : '#d2ad78', 11);
    text('像素流用于表示功能和信号方向，不表示真实光子频率、原子速率或厂家时序。', 326, 391, '#7f9e8b', 10);
  }
  function renderErrorChart() {
    const maxX = Math.max(100, Math.ceil(Math.abs(selected.relative) / 50) * 50), x = v => 45 + (v + maxX) / (2 * maxX) * 590, y = v => 110 - v * 135;
    const points = Array.from({ length: 241 }, (_, i) => ({ x: -maxX + i / 240 * 2 * maxX }));
    $('lock-error-chart').innerHTML = `<title>当前频差 ${f(selected.relative)} MHz，误差信号 ${f(selected.error, 3)} V</title><rect x="${x(-20)}" y="25" width="${x(20) - x(-20)}" height="171" fill="#e6edda"/><g font-size="10" font-family="sans-serif" fill="#78866d"><text x="5" y="15">E (V)</text>${[-.5, 0, .5].map(v => `<line x1="45" y1="${y(v)}" x2="635" y2="${y(v)}" stroke="#d7dfcc"/><text x="4" y="${y(v) + 4}">${v}</text>`).join('')}${[-maxX, 0, maxX].map(v => `<text x="${x(v) - 8}" y="215">${v}</text>`).join('')}<text x="478" y="233">相对参考频差 x (MHz)</text></g><path d="${path(points, q => x(q.x), q => y(discriminator(q.x).error))}" stroke="#a7ad99" stroke-dasharray="4 4" stroke-width="1.5" fill="none"/><path d="${path(points, q => x(q.x), q => y(discriminator(q.x, selected.present).error))}" stroke="#477d59" stroke-width="2" fill="none"/><circle cx="${x(selected.relative)}" cy="${y(selected.error)}" r="4.5" fill="#aa8343"/>`;
  }
  function renderTimeCharts() {
    const points = trace.points.filter((q, i) => q.t <= A.duration && (i % 10 === 0 || i === trace.points.length - 1)), sx = t => 44 + t / A.duration * 592;
    const low = Math.min(-50, Math.floor(Math.min(...points.map(q => Math.min(q.frequency, q.reference))) / 50) * 50), high = Math.max(100, Math.ceil(Math.max(...points.map(q => Math.max(q.frequency, q.free, q.reference))) / 50) * 50);
    const fy = v => 203 - (v - low) / (high - low) * 174;
    const grids = [low, (low + high) / 2, high];
    $('lock-time-chart').innerHTML = `<title>频率时序，竖线为入射时刻 ${f(cursor, 1)} ms</title><g font-size="10" font-family="sans-serif" fill="#78866d"><text x="3" y="15">频偏 (MHz)</text>${grids.map(v => `<line x1="44" y1="${fy(v)}" x2="636" y2="${fy(v)}" stroke="#d9e1ce"/><text x="3" y="${fy(v) + 4}">${f(v, 0)}</text>`).join('')}${[0, 120, 240].map(t => `<text x="${sx(t) - 4}" y="225">${t}</text>`).join('')}<text x="578" y="239">t (ms)</text></g><path d="${path(points, q => sx(q.t), q => fy(q.free))}" stroke="#a3a68e" stroke-width="1.5" stroke-dasharray="5 4" fill="none"/><path d="${path(points, q => sx(q.t), q => fy(q.reference))}" stroke="#b38c47" stroke-width="1.5" stroke-dasharray="3 4" fill="none"/><path d="${path(points, q => sx(q.t), q => fy(q.frequency))}" stroke="#3d7d54" stroke-width="2" fill="none"/><line x1="${sx(cursor)}" y1="27" x2="${sx(cursor)}" y2="203" stroke="#596d53" opacity=".6"/><circle cx="${sx(cursor)}" cy="${fy(selected.frequency)}" r="3.5" fill="#3d7d54"/>`;
    const ey = v => 65 - v * 80;
    $('lock-signal-chart').innerHTML = `<title>读出误差信号随时间变化</title>${p.event === 'blank' ? `<rect x="${sx(A.eventAt)}" y="15" width="${sx(A.restoreAt) - sx(A.eventAt)}" height="100" fill="#eee5d8"/>` : ''}<g font-size="10" font-family="sans-serif" fill="#78866d"><text x="2" y="12">E (V)</text>${[-.5, 0, .5].map(v => `<line x1="44" y1="${ey(v)}" x2="636" y2="${ey(v)}" stroke="#dae1cf"/><text x="4" y="${ey(v) + 4}">${v}</text>`).join('')}<text x="44" y="138">0</text><text x="600" y="138">240 ms</text></g><path d="${path(points, q => sx(q.t), q => ey(q.error))}" stroke="#a1874d" stroke-width="1.5" fill="none"/><line x1="${sx(cursor)}" y1="15" x2="${sx(cursor)}" y2="115" stroke="#596d53" opacity=".6"/>`;
  }
  function renderAtom() {
    $('lock-capture-result').textContent = atom.captured ? '该入射时刻的试探原子：满足教学接收窗口' : !atom.slower.reached ? atom.slower.stopped ? '试探原子在减速段出口前停下' : '试探原子在计算时限内未到出口' : !atom.slower.accepted ? '试探原子的轴向速度未进入接收窗口' : '轴向已通过，横向未满足出口条件';
    $('lock-capture-result').dataset.pass = String(atom.captured);
    $('lock-zs-detuning').textContent = `${f(DEFAULT_COOLING.detuning + selected.frequency, 1)} MHz`;
    $('lock-mot-detuning').textContent = `${f(DEFAULT_COOLING.motDetuning + selected.frequency, 1)} MHz`;
    $('lock-atom-speed').textContent = atom.slower.reached ? `${f(atom.slower.velocity, 1)} m/s` : '未到出口';
    $('lock-atom-radius').textContent = atom.mot ? `${f(atom.mot.radius * 1000, 2)} mm` : '未送入 MOT';
    $('lock-capture-description').textContent = `于 ${f(cursor, 1)} ms 入射，计算到 ${f(atom.exitMs, 2)} ms。${atom.mot ? `横向速度 ${f(atom.mot.speed, 2)} m/s；${atom.mot.escaped ? '已离开有效光区。' : '采用有限驻留时间的出口结果。'}` : '该原子没有进入本次横向冷却计算。'}${selected.locked && !atom.captured ? ' 相对参考已满足锁定判据，仍不保证满足原子接收条件。' : ''}`;
    const sx = z => 43 + z / C.length * 517, sy = v => 202 - v / 480 * 168;
    const ideal = Array.from({ length: 80 }, (_, i) => ({ z: i / 79 * C.length }));
    $('lock-atom-chart').innerHTML = `<title>所选原子轴向轨迹</title><g font-size="10" font-family="sans-serif" fill="#78866d"><text x="4" y="15">v (m/s)</text>${[0, 200, 400].map(v => `<line x1="43" y1="${sy(v)}" x2="560" y2="${sy(v)}" stroke="#dbe2d0"/><text x="4" y="${sy(v) + 4}">${v}</text>`).join('')}<text x="43" y="225">0</text><text x="515" y="225">35 cm</text></g><path d="${path(ideal, q => sx(q.z), q => sy(designVelocity(q.z)))}" stroke="#9da58d" stroke-width="1.6" stroke-dasharray="5 4" fill="none"/><path d="${path(atom.slower.points, q => sx(q.z), q => sy(q.v))}" stroke="#3d7d54" stroke-width="2.5" fill="none"/>`;
  }
  function selectTime(value) {
    cursor = Math.max(0, Math.min(A.duration, value)); $('lock-time').value = cursor; $('lock-time-value').textContent = `${f(cursor, 1)} ms`;
    selected = sampleLock(trace, cursor); atom = simulateLockedCapture(trace, cursor);
    $('lock-state').textContent = STATES[selected.state]; $('lock-state').dataset.state = selected.state;
    $('lock-scene-status').textContent = `t = ${f(cursor, 1)} ms · ${STATES[selected.state]} · E = ${f(selected.error, 3)} V · 所选原子${atom.captured ? '通过' : '未通过'}接收窗口`; 
    for (const [id, key, unit, digits] of [['relative', 'relative', 'MHz', 2], ['absolute', 'frequency', 'MHz', 2], ['error', 'error', 'V', 3], ['signal', 'signal', '', 3], ['actuator', 'actuator', 'MHz', 2], ['command', 'command', 'MHz', 2]]) $(`lock-${id}`).textContent = `${f(selected[key], digits)} ${unit}`.trim();
    drawScene(); renderErrorChart(); renderTimeCharts(); renderAtom();
    document.querySelectorAll('#lock-arrivals button').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.time) - cursor) < .01)));
    onResult(atom);
  }
  function pause() { playing = false; last = null; $('lock-play').textContent = '▶ 从起点播放'; $('lock-play').setAttribute('aria-pressed', 'false'); }
  function renderArrivals() {
    $('lock-arrivals').replaceChildren(...arrivals.map(s => {
      const button = document.createElement('button'); button.className = `lock-arrival ${s.captured ? 'captured' : s.axial ? 'transverse' : 'axial'}`; button.dataset.time = s.entryMs;
      button.title = `${f(s.entryMs, 0)} ms 入射：${s.captured ? '满足窗口' : s.axial ? '横向未通过' : '轴向未通过'}`; button.setAttribute('aria-label', button.title); button.setAttribute('aria-pressed', String(Math.abs(s.entryMs - cursor) < .01));
      button.addEventListener('click', () => { pause(); selectTime(s.entryMs); }); return button;
    }));
  }
  function update() {
    pause(); controls(); trace = simulateLock(p); selectTime(cursor);
    sequence++; const id = sequence; clearTimeout(jobTimer); $('lock-arrivals').classList.add('pending'); $('lock-arrivals').setAttribute('aria-busy', 'true');
    $('lock-arrivals-status').textContent = '正在重算入射结果；旧色块暂不代表当前参数…';
    jobTimer = setTimeout(() => {
      if (worker) worker.postMessage({ id, parameters: p });
      else { $('lock-arrivals-status').textContent = '后台扫描暂不可用；所选单原子的计算仍可使用。'; $('lock-arrivals').classList.remove('pending'); $('lock-arrivals').setAttribute('aria-busy', 'false'); }
    }, 120);
  }
  try {
    worker = new Worker(new URL('./locking-worker.mjs', import.meta.url), { type: 'module' });
    worker.addEventListener('message', event => {
      if (event.data.id !== sequence) return;
      $('lock-arrivals').classList.remove('pending'); $('lock-arrivals').setAttribute('aria-busy', 'false');
      if (event.data.error) { $('lock-arrivals-status').textContent = event.data.error; return; }
      arrivals = event.data.samples; renderArrivals(); $('lock-arrivals-status').textContent = '25 个等时间入射样本已计算 · 可点击查看';
    });
    worker.addEventListener('error', () => { worker.terminate(); worker = undefined; $('lock-arrivals-status').textContent = '后台扫描暂不可用；所选单原子的计算仍可使用。'; $('lock-arrivals').classList.remove('pending'); $('lock-arrivals').setAttribute('aria-busy', 'false'); });
  } catch { worker = undefined; }
  document.querySelectorAll('[data-lock-device]').forEach(b => b.addEventListener('click', () => equipment(b.dataset.lockDevice)));
  document.querySelectorAll('[data-lock-preset]').forEach(b => b.addEventListener('click', () => {
    const name = b.dataset.lockPreset; p = { ...DEFAULT_LOCK, ...LOCK_PRESETS[name] }; cursor = ({ blank: 165, hop: 130, inverted: 80, delayed: 35, limited: 210 })[name] ?? 200; update();
  }));
  for (const [id, key] of CONTROLS) $(id).addEventListener('input', event => { p[key] = Number(event.target.value); update(); });
  $('lock-mode').addEventListener('change', event => { p.mode = event.target.value; update(); });
  $('lock-event').addEventListener('change', event => { p.event = event.target.value; update(); });
  $('lock-polarity').addEventListener('change', event => { p.polarity = event.target.checked ? -1 : 1; update(); });
  $('lock-time').addEventListener('input', event => { pause(); selectTime(Number(event.target.value)); });
  $('lock-step').addEventListener('click', () => { pause(); selectTime(Math.min(A.duration, cursor + 10)); });
  $('lock-play').addEventListener('click', () => { if (playing) { pause(); return; } selectTime(0); playing = true; last = null; lastPaint = 0; $('lock-play').textContent = 'Ⅱ 暂停锁频回放'; $('lock-play').setAttribute('aria-pressed', 'true'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  function frame(now) {
    if (playing) {
      if (last === null) last = now;
      if (now - lastPaint >= 80) { const next = Math.min(A.duration, cursor + Math.min(200, now - last) * .02); last = now; lastPaint = now; selectTime(next); if (cursor >= A.duration) pause(); }
    }
    requestAnimationFrame(frame);
  }
  equipment(selectedDevice); update(); requestAnimationFrame(frame);
  return { pause };
}

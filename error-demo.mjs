import { simulateGate, freeEvolution, singlePulse } from './noise.mjs?v=decay-detuning-1';
const $ = selector => document.querySelector(selector);
const controls = ['#noise-pulse', '#noise-dephasing', '#noise-blockade', '#noise-infinite', '#noise-decay', '#noise-detuning'];
const percent = x => `${(100 * x).toFixed(2)}%`;
const presets = {
  ideal: [0, 0, 10, true, 0, 0], pulse: [8, 0, 10, true, 0, 0],
  dephase: [0, .35, 10, true, 0, 0], blockade: [0, 0, 2.5, false, 0, 0],
  decay: [0, 0, 10, true, .35, 0], detuning: [0, 0, 10, true, 0, .12],
  combined: [4, .15, 5, false, .2, .06]
};
const scans = {
  epsilon: { min: -.2, max: .2, label: '脉冲面积相对误差 ε (%)', short: 'ε', format: x => (100 * x).toFixed(1), ticks: 4 },
  dephasing: { min: 0, max: 2, label: '退相干强度 g', short: 'g', format: x => x.toFixed(2), ticks: 4 },
  blockadeRatio: { min: 0, max: 40, label: '阻塞强度 b = V/(ℏΩ₀)', short: 'b', format: x => x.toFixed(1), ticks: 4 },
  decay: { min: 0, max: 2, label: '自发衰变强度 a = Γt_g', short: 'a', format: x => x.toFixed(2), ticks: 4 },
  detuning: { min: -1, max: 1, label: '归一化失谐 δ = Δ/Ω₀', short: 'δ', format: x => x.toFixed(2), ticks: 4 }
};
function parameters() {
  return {
    epsilon: Number($('#noise-pulse').value) / 100,
    dephasing: Number($('#noise-dephasing').value),
    decay: Number($('#noise-decay').value),
    detuning: Number($('#noise-detuning').value),
    blockadeRatio: $('#noise-infinite').checked ? Infinity : Number($('#noise-blockade').value)
  };
}
function frame(config) {
  const { min, max, label, format, ticks = 4, yLabel = '保真度 (%)', yMin = 0, yMax = 1 } = config;
  const x = v => 56 + (v - min) / (max - min) * 444, y = v => 245 - (v - yMin) / (yMax - yMin) * 209;
  let markup = `<title>${label}的影响</title><text class="chart-label" x="56" y="17">${yLabel}</text>`;
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * i / 4;
    markup += `<path class="chart-grid" d="M56 ${y(v)}H500"/><text class="chart-tick" x="45" y="${y(v) + 4}" text-anchor="end">${(v * 100).toFixed(0)}</text>`;
  }
  for (let i = 0; i <= ticks; i++) {
    const v = min + (max - min) * i / ticks;
    markup += `<text class="chart-tick" x="${x(v)}" y="266" text-anchor="middle">${format(v)}</text>`;
  }
  markup += `<path class="chart-axis" d="M56 36V245H500"/><text class="chart-label" x="278" y="292" text-anchor="middle">${label}</text>`;
  return { markup, x, y };
}
function path(points, x, y, key) { return points.map((p, i) => `${i ? 'L' : 'M'}${x(p.value).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' '); }
function renderSweep(params, current) {
  const key = $('#noise-scan').value, config = scans[key];
  const count = key === 'blockadeRatio' ? 161 : 61;
  const points = Array.from({ length: count }, (_, i) => {
    const value = config.min + (config.max - config.min) * i / (count - 1);
    return { value, ...simulateGate({ ...params, [key]: value }, { record: false }) };
  });
  const plot = frame(config), marker = params[key];
  let markup = plot.markup;
  markup += `<path class="chart-line line-state" d="${path(points, plot.x, plot.y, 'stateFidelity')}"/><path class="chart-line line-gate" d="${path(points, plot.x, plot.y, 'averageFidelity')}"/>`;
  if (Number.isFinite(marker)) {
    markup += `<path class="chart-marker" d="M${plot.x(marker)} 36V245"/><circle class="chart-point" cx="${plot.x(marker)}" cy="${plot.y(current.averageFidelity)}" r="4.5"/>`;
  }
  $('#noise-sweep-chart').innerHTML = markup;
  $('#noise-scan-note').textContent = `每次扫描只改变${config.short}，其他参数保持当前设定。${key === 'blockadeRatio' && !Number.isFinite(params.blockadeRatio) ? '当前采用 b → ∞，该点位于此有限扫描区间之外。' : '圆点表示当前设定下的平均门保真度。'}矩形脉冲的相干振荡可能使曲线局部非单调。`;
  $('#scan-table-parameter').textContent = config.short + (key === 'epsilon' ? ' (%)' : '');
  $('#noise-scan-table').innerHTML = points.filter((_, i) => i % ((count - 1) / 10) === 0).map(p => `<tr><td>${config.format(p.value)}</td><td>${percent(p.averageFidelity)}</td><td>${percent(p.stateFidelity)}</td><td>${percent(p.leakage)}</td></tr>`).join('');
}
function renderTrajectory(result) {
  const plot = frame({ min: 0, max: 4, label: '归一化时间 Ω₀t/π', format: x => x.toFixed(0), ticks: 4, yLabel: '布居概率 (%)' });
  const points = result.trajectory.map(p => ({ ...p, value: p.time }));
  let markup = plot.markup;
  for (const boundary of [1, 3]) markup += `<path class="chart-marker" d="M${plot.x(boundary)} 36V245"/>`;
  for (const [center, label] of [[.5, 'πᶜ'], [2, '2πᵗ'], [3.5, 'πᶜ']]) markup += `<text class="chart-tick" x="${plot.x(center)}" y="31" text-anchor="middle">${label}</text>`;
  markup += `<path class="chart-line line-gate" d="${path(points, plot.x, plot.y, 'rydberg')}"/><path class="chart-line line-double" d="${path(points, plot.x, plot.y, 'double')}"/>`;
  $('#noise-population-chart').innerHTML = markup;
  $('#noise-max-double').textContent = percent(result.maxDouble);
  $('#noise-final-rydberg').textContent = percent(result.leakage);
}
function renderFreeEvolution(params) {
  const plot = frame({ min: 0, max: 1, label: '自由演化时间 t/t_g', format: x => x.toFixed(2),
    yLabel: '布居 / 密度矩阵元 (×100)', yMin: -.5, yMax: .5 });
  const points = Array.from({ length: 101 }, (_, i) => ({ value: i / 100, ...freeEvolution(params, i / 100) }));
  let markup = plot.markup;
  for (const [key, style] of [['excited', 'line-state'], ['coherence', 'line-gate'], ['real', 'line-double']]) {
    markup += `<path class="chart-line ${style}" d="${path(points, plot.x, plot.y, key)}"/>`;
  }
  $('#noise-free-chart').innerHTML = markup;
  const last = points.at(-1);
  $('#noise-free-population').textContent = percent(last.excited);
  $('#noise-free-coherence').textContent = last.coherence.toFixed(4);
  $('#noise-free-phase').textContent = `${(last.phase * 180 / Math.PI).toFixed(1)}°`;
  $('#noise-free-damping').textContent = (params.dephasing + params.decay / 2).toFixed(3);
  const pulse = singlePulse(params);
  $('#noise-pi-population').textContent = percent(pulse.population);
  $('#noise-pi-maximum').textContent = percent(pulse.maximum);
}
function update() {
  const params = parameters(), result = simulateGate(params);
  $('#noise-pulse-value').textContent = `${(100 * params.epsilon).toFixed(1)}%`;
  $('#noise-dephasing-value').textContent = params.dephasing.toFixed(2);
  $('#noise-decay-value').textContent = params.decay.toFixed(2);
  $('#noise-detuning-value').textContent = params.detuning.toFixed(2);
  $('#noise-blockade-value').textContent = Number.isFinite(params.blockadeRatio) ? params.blockadeRatio.toFixed(1) : '∞';
  $('#noise-blockade').disabled = $('#noise-infinite').checked;
  $('#noise-gate-fidelity').textContent = percent(result.averageFidelity);
  $('#noise-state-fidelity').textContent = percent(result.stateFidelity);
  $('#noise-leakage').textContent = percent(result.leakage);
  const descriptions = [];
  if (params.epsilon) descriptions.push(`脉冲面积偏差为 ${(100 * params.epsilon).toFixed(1)}%，实际转角偏离设计值`);
  if (params.dephasing) descriptions.push(`纯退相干在整个脉冲序列中作用，g = ${params.dephasing.toFixed(2)}`);
  if (params.decay) descriptions.push(`有效闭合衰变 |r⟩ → |1⟩ 的强度为 a = ${params.decay.toFixed(2)}`);
  if (params.detuning) descriptions.push(`两原子具有相同且固定的激光失谐 δ = ${params.detuning.toFixed(2)}，在旋转坐标系中改变演化相位和旋转轴`);
  if (Number.isFinite(params.blockadeRatio)) descriptions.push(params.blockadeRatio === 0 ? 'b = 0 时不存在阻塞，理想脉冲经相位补偿后得到恒等操作，而不是 CZ' : `阻塞强度 b = ${params.blockadeRatio.toFixed(1)}，存在非共振耦合及附加相位`);
  $('#noise-summary').textContent = descriptions.length ? descriptions.join('；') + '。数值结果包含这些效应的联合演化，不采用误差概率直接相加的近似。' : '在无脉冲误差、无纯退相干、无自发衰变、无激光失谐和完全阻塞的极限下，实际操作与理想 CZ 门一致，平均门保真度为 100%。';
  for (const button of document.querySelectorAll('[data-noise-preset]')) {
    const [e, g, b, infinite, a, delta] = presets[button.dataset.noisePreset];
    const active = Math.abs(e / 100 - params.epsilon) < 1e-9 && Math.abs(g - params.dephasing) < 1e-9 &&
      Math.abs(a - params.decay) < 1e-9 && Math.abs(delta - params.detuning) < 1e-9 && (infinite ? !Number.isFinite(params.blockadeRatio) : params.blockadeRatio === b);
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
  }
  renderTrajectory(result); renderSweep(params, result); renderFreeEvolution(params);
}
let scheduled = false;
function scheduleUpdate() { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; update(); }); } }
function setPreset(name) {
  const [e, g, b, infinite, a, delta] = presets[name];
  $('#noise-pulse').value = e; $('#noise-dephasing').value = g;
  $('#noise-blockade').value = b; $('#noise-infinite').checked = infinite;
  $('#noise-decay').value = a; $('#noise-detuning').value = delta;
  update();
}
for (const selector of controls) $(selector).addEventListener('input', scheduleUpdate);
$('#noise-scan').addEventListener('change', update);
for (const button of document.querySelectorAll('[data-noise-preset]')) button.addEventListener('click', () => {
  const preset = button.dataset.noisePreset;
  $('#noise-scan').value = ({ dephase: 'dephasing', blockade: 'blockadeRatio', decay: 'decay', detuning: 'detuning' })[preset] || 'epsilon';
  setPreset(preset);
});
$('#noise-reset').addEventListener('click', () => { $('#noise-scan').value = 'epsilon'; setPreset('ideal'); });
update();

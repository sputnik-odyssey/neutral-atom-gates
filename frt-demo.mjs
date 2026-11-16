import {phaseAt} from './phase-gate.mjs?v=protocol-1';
import {makeSpectrum,spectrumOverlap,kernelIntegral} from './frt.mjs?v=protocol-1';
const protocolNames={sequential:'π–2π–π 顺序门',phase:'相位调制门'},protocolColors={sequential:'#a96836',phase:'#385f9a'};
const $=id=>document.getElementById(`frt-${id}`),kinds=['frequency','intensity'];
const defaults=()=>({frequency:{enabled:true,rms:.015,shape:'peak',center:1.5,width:.18},intensity:{enabled:true,rms:.01,shape:'lowpass',center:1.5,width:1.02}});
let sources=defaults(),active='frequency',response=null,responses=null,protocol='phase',allOverlaps={},overlaps={},spectra={},requestId=0,probe=1.5;
const worker=new Worker(new URL('./frt-worker.mjs?v=protocol-1',import.meta.url),{type:'module'});
const scientific=x=>x===0?'0':Math.abs(x)<1e-12?'≈ 0':x.toExponential(3),percent=x=>`${x>0&&100*x<.0001?(100*x).toExponential(3):(100*x).toFixed(4)}%`;
const names={frequency:'激光频率噪声',intensity:'相对强度噪声'},shapes={peak:'高斯窄带',lowpass:'低通洛伦兹',white:'带限白噪声'};
const curveFor=(p,kind)=>kind==='frequency'?responses[p].nu:responses[p].intensity;
const selectedResponse=kind=>curveFor(protocol,kind);
const responseUnit=()=>active==='frequency'?'μs²':'无量纲';
const psdUnit=()=>active==='frequency'?'MHz²/MHz':'MHz⁻¹';
function controls(){
  const s=sources[active],frequency=active==='frequency';
  $('shape').value=s.shape;$('rms').max=frequency?'100':'10';$('rms').value=s.rms*(frequency?1000:100);
  $('rms-label').textContent=frequency?'频率噪声 RMS':'相对强度噪声 RMS';
  $('rms-value').textContent=frequency?`${(s.rms*1000).toFixed(1)} kHz`:`${(s.rms*100).toFixed(2)}%`;
  $('center').value=s.center;$('center-value').textContent=`${s.center.toFixed(2)} MHz`;$('center').disabled=s.shape!=='peak';
  $('width').value=s.width;$('width').disabled=s.shape==='white';$('width-label').textContent=s.shape==='lowpass'?'低通半高频率 w':'谱峰标准差 w';$('width-value').textContent=`${s.width.toFixed(2)} MHz`;
  kinds.forEach(k=>$(`enable-${k}`).checked=sources[k].enabled);
  $('double').disabled=s.rms*2>.1+1e-12;
  $('rabi-value').textContent=`${Number($('rabi').value).toFixed(1)} MHz`;
  $('probe-value').textContent=`${probe.toFixed(2)} MHz`;
}
function requestResponse(){
  response=null;responses=null;$('status').textContent='正在由理想门轨迹计算响应函数…';$('high').disabled=$('low').disabled=true;
  worker.postMessage({id:++requestId,rabi:Number($('rabi').value),ensemble:$('ensemble').value});controls();
}
worker.onmessage=({data})=>{
  if(data.id!==requestId)return;
  if(data.error){$('status').textContent=`计算失败：${data.error}`;return;}
  responses=data.result;response=responses[protocol];$('high').disabled=$('low').disabled=false;
  $('status').textContent=`两种门的响应已计算：顺序门 T = ${responses.sequential.duration.toFixed(3)} μs，相位调制门 T = ${responses.phase.duration.toFixed(3)} μs；每种协议 768 个时间点，401 个频率点。`;
  render();
};
worker.onerror=()=>{$('status').textContent='响应函数模块加载失败，请刷新页面。';};
function chart(id,series,unit,fill=false){
  const svg=$(id),width=Math.max(280,Math.round(svg.getBoundingClientRect().width||480)),height=260;
  const left=66,right=18,top=24,bottom=40,w=width-left-right,h=height-top-bottom;
  const ymax=Math.max(...series.flatMap(x=>Array.from(x.values)),1e-12)*1.12,xf=f=>left+w*f/12,yf=v=>top+h*(1-v/ymax);
  let markup=`<title>${svg.getAttribute('aria-label')}</title><text x="${left}" y="14" class="frt-axis-unit">${unit}</text>`;
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=yf(v);markup+=`<path d="M${left},${y}H${width-right}" class="frt-grid"/><text x="${left-7}" y="${y+4}" text-anchor="end">${v===0?'0':v.toExponential(1)}</text>`;}
  for(let f=0;f<=12;f+=3)markup+=`<text x="${xf(f)}" y="${height-23}" text-anchor="middle">${f}</text>`;
  for(const {values,color,dashed=false} of series){
    const path=Array.from(values,(v,i)=>`${i?'L':'M'}${xf(response.frequency[i]).toFixed(2)},${yf(v).toFixed(2)}`).join(' ');
    if(fill)markup+=`<path d="${path} L${xf(12)},${top+h} L${left},${top+h}Z" fill="${color}" opacity=".09"/>`;
    markup+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" ${dashed?'stroke-dasharray="6 3"':''}/>`;
  }
  markup+=`<path d="M${xf(probe)},${top}V${top+h}" stroke="#7856a0" stroke-dasharray="4 4"/><text x="${width-right}" y="${height-4}" text-anchor="end">f / MHz</text>`;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=markup;
}
function renderKernel(){
  if(!response)return;
  const kernel=active==='frequency'?response.nuKernel:response.intensityKernel;
  const weighted=kernelIntegral(kernel,response.timeCount,probe,response.duration);
  const display=$('weighted').checked?weighted:kernelIntegral(kernel,response.timeCount,probe,response.duration,false);
  const canvas=$('kernel'),ctx=canvas.getContext('2d'),{heatmap,cells}=display;
  const bound=Math.max(...Array.from(heatmap,Math.abs),1e-14),x0=54,y0=24,size=390;
  ctx.clearRect(0,0,480,450);ctx.fillStyle='#fafbf9';ctx.fillRect(0,0,480,450);
  for(let i=0;i<cells;i++)for(let j=0;j<cells;j++){
    const value=heatmap[i*cells+j]/bound,base=value>=0?[32,112,155]:[184,79,47],a=Math.abs(value);
    ctx.fillStyle=`rgb(${base.map(c=>Math.round(249+(c-249)*a)).join(',')})`;
    ctx.fillRect(x0+size*i/cells,y0+size*(cells-1-j)/cells,size/cells+.3,size/cells+.3);
  }
  ctx.strokeStyle='#64736f';ctx.strokeRect(x0,y0,size,size);ctx.fillStyle='#40534f';ctx.font='13px system-ui';
  for(let i=0;i<=4;i++){const s=(i/4).toFixed(2);ctx.textAlign='center';ctx.fillText(s,x0+size*i/4,y0+size+19);ctx.textAlign='right';ctx.fillText(s,x0-8,y0+size-size*i/4+4);}
  ctx.textAlign='right';ctx.fillText('t / T',x0+size,447);ctx.textAlign='left';ctx.fillText('τ / T',7,15);
  $('color-negative').textContent=scientific(-bound);$('color-positive').textContent=scientific(bound);
  const index=Math.round(probe/.03),s=spectra[active][index],iv=selectedResponse(active)[index];
  $('probe-integral').textContent=`${scientific(weighted.integral)} ${responseUnit()}`;
  $('probe-response').textContent=`${scientific(iv)} ${responseUnit()}`;
  $('probe-psd').textContent=`${scientific(s)} ${psdUnit()}`;
  $('probe-product').textContent=`${scientific(s*iv)} MHz⁻¹`;
}
function draw(){
  if(!response)return;
  $('psd-title').textContent=`${names[active]}：单边功率谱 S(f)`;
  $('response-title').textContent=`${names[active]}：响应函数 I(f)`;
  chart('psd',[{values:spectra[active],color:'#2b768a'}],psdUnit(),true);
  chart('response',['sequential','phase'].map(p=>({values:curveFor(p,active),color:protocolColors[p],dashed:p==='sequential'})),responseUnit());
  chart('product',['sequential','phase'].map(p=>({values:allOverlaps[p][active].product,color:protocolColors[p],dashed:p==='sequential'})),'MHz⁻¹',true);renderKernel();drawWaveforms();
}
function render(){
  controls();if(!response)return;
  for(const kind of kinds){const s=sources[kind];spectra[kind]=makeSpectrum(response.frequency,{...s,rms:s.enabled?s.rms:0});}
  for(const p of ['sequential','phase']){allOverlaps[p]={};for(const kind of kinds)allOverlaps[p][kind]=spectrumOverlap(response.frequency,spectra[kind],curveFor(p,kind));}
  overlaps=allOverlaps[protocol];
  for(const kind of kinds)$(`epsilon-${kind}`).textContent=percent(overlaps[kind].infidelity);
  const totalFor=p=>kinds.reduce((sum,k)=>sum+allOverlaps[p][k].infidelity,0);
  $('compare-table').innerHTML=['sequential','phase'].map(p=>`<tr><th>${protocolNames[p]}</th><td>${responses[p].duration.toFixed(3)} μs</td><td>${percent(allOverlaps[p].frequency.infidelity)}</td><td>${percent(allOverlaps[p].intensity.infidelity)}</td><td><b>${percent(totalFor(p))}</b></td></tr>`).join('');
  const difference=totalFor('phase')-totalFor('sequential');
  $('compare-result').textContent=`相位调制门与顺序门的领先阶失保真度之差 εphase − εseq = ${scientific(difference)}。${Math.abs(difference)<1e-12?'当前两者的贡献近似相同。':difference<0?'当前谱下，相位调制门的贡献较小。':'当前谱下，顺序门的贡献较小。'}这个排序只对应当前噪声谱、门速度与输入范围。`;
  $('focus-label').textContent=`下列四项读数与式 (9) 热图采用：${protocolNames[protocol]}`;
  $('kernel-protocol').textContent=protocolNames[protocol];

  const total=kinds.reduce((sum,k)=>sum+overlaps[k].infidelity,0);
  $('epsilon-total').textContent=percent(total);$('variance').textContent=`${scientific(overlaps[active].variance)} ${active==='frequency'?'MHz²':'（分数）²'}`;
  $('description').textContent=`当前显示${protocolNames[protocol]}的${names[active]}。${sources[active].enabled?'该通道已计入积分。':'该通道未计入积分，谱与乘积显示为零。'}领先阶预测为 1 − F ≈ ${scientific(total)}，不含耗散及有限阻塞误差。`;
  $('source-table').innerHTML=kinds.map(k=>`<tr><th>${names[k]}</th><td>${sources[k].enabled?'计入':'关闭'}</td><td>${k==='frequency'?`${(sources[k].rms*1000).toFixed(1)} kHz`:`${(sources[k].rms*100).toFixed(2)}%`}</td><td>${shapes[sources[k].shape]}</td><td>${scientific(overlaps[k].variance)} ${k==='frequency'?'MHz²':'分数²'}</td><td>${percent(overlaps[k].infidelity)}</td></tr>`).join('');draw();
}
$('protocol').addEventListener('change',()=>{protocol=$('protocol').value;if(responses)response=responses[protocol];render();});
$('source').addEventListener('change',()=>{active=$('source').value;render();});
$('shape').addEventListener('change',()=>{sources[active].shape=$('shape').value;render();});
for(const field of ['rms','center','width'])$(field).addEventListener('input',()=>{sources[active][field]=Number($(field).value)/(field==='rms'?(active==='frequency'?1000:100):1);render();});
for(const kind of kinds)$(`enable-${kind}`).addEventListener('change',()=>{sources[kind].enabled=$(`enable-${kind}`).checked;render();});
$('rabi').addEventListener('input',requestResponse);$('ensemble').addEventListener('change',requestResponse);
$('probe').addEventListener('input',()=>{probe=Number($('probe').value);controls();draw();});
$('weighted').addEventListener('change',renderKernel);
for(const type of ['high','low'])$(type).addEventListener('click',()=>{
  if(!response)return;
  const curve=selectedResponse(active);let best=0;
  for(let i=1;i<curve.length;i++)if(type==='high'?curve[i]>curve[best]:curve[i]<curve[best])best=i;
  sources[active].shape='peak';sources[active].center=response.frequency[best];
  kinds.forEach(k=>sources[k].enabled=k===active);render();
});
$('double').addEventListener('click',()=>{sources[active].rms*=2;render();});
$('reset').addEventListener('click',()=>{sources=defaults();active='frequency';protocol='phase';$('protocol').value=protocol;probe=1.5;$('source').value=active;$('rabi').value=3;$('ensemble').value='haar';$('probe').value=probe;$('weighted').checked=true;requestResponse();});
let resize;window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(draw,100);});
function drawWaveforms(){
  const rabi=response.rabi,T=responses.sequential.duration;
  for(const mode of ['amplitude','phase']){
    const svg=$(`wave-${mode}`),width=Math.max(280,Math.round(svg.getBoundingClientRect().width||440)),height=200,left=42,right=14,top=22,bottom=32,w=width-left-right,h=height-top-bottom;
    const ymin=mode==='phase'?-.9:0,ymax=mode==='phase'?.9:1.2,xf=t=>left+w*t/T,yf=v=>top+h*(1-(v-ymin)/(ymax-ymin));
    let markup=`<title>${svg.getAttribute('aria-label')}</title><text x="${left}" y="13">${mode==='phase'?'φ / rad':'Ωⱼ / Ωmax'}</text>`;
    for(let i=0;i<=4;i++){const t=T*i/4;markup+=`<path d="M${xf(t)},${top}V${top+h}" class="frt-grid"/><text x="${xf(t)}" y="${height-15}" text-anchor="middle">${t.toFixed(2)}</text>`;}
    for(const v of mode==='phase'?[-.8,0,.8]:[0,.5,1])markup+=`<text x="${left-6}" y="${yf(v)+4}" text-anchor="end">${v}</text>`;
    const line=(times,values,color,dashed=false)=>{markup+=`<path d="${times.map((t,i)=>`${i?'L':'M'}${xf(t).toFixed(2)},${yf(values[i]).toFixed(2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" ${dashed?'stroke-dasharray="5 3"':''}/>`;};
    const seqTimes=[0,T/4,T/4,3*T/4,3*T/4,T];
    if(mode==='amplitude'){line(seqTimes,[1,1,0,0,1,1],protocolColors.sequential,true);line(seqTimes,[0,0,1,1,0,0],'#648a53',true);line([0,responses.phase.duration],[1,1],protocolColors.phase);}
    else {line([0,T],[0,0],protocolColors.sequential,true);const times=Array.from({length:201},(_,i)=>responses.phase.duration*i/200);line(times,times.map(t=>phaseAt(2*Math.PI*rabi*t)),protocolColors.phase);}
    markup+=`<text x="${width-right}" y="${height-1}" text-anchor="end">t / μs</text>`;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=markup;
  }
  const d=responses.phase.diagnostics;
  $('closure').textContent=`本地校准后的无噪声检查：条件相位误差 ${scientific(d.phaseError)} rad；完整四维平均泄漏 ${scientific(d.averageLeakage)}；补偿局域 Z 相位后，相对 CZ 的平均失保真度 ${scientific(d.baselineInfidelity)}。这里只报告数值校准残差，不把它加入激光噪声积分。`;
}
for(const [id,factor] of [['intensity-dc',0],['intensity-band',.5]])$(id).addEventListener('click',()=>{
  if(!response)return;active='intensity';$('source').value=active;sources.frequency.enabled=false;sources.intensity={enabled:true,rms:.01,shape:'peak',center:factor*response.rabi,width:.18};render();
});
requestResponse();

import {makeSpectrum,spectrumOverlap,kernelIntegral} from './frt.mjs?v=frt-1';
const $=id=>document.getElementById(`frt-${id}`),kinds=['frequency','intensity'];
const defaults=()=>({frequency:{enabled:true,rms:.015,shape:'peak',center:1.5,width:.18},intensity:{enabled:true,rms:.01,shape:'lowpass',center:1.5,width:1.02}});
let sources=defaults(),active='frequency',response=null,overlaps={},spectra={},requestId=0,probe=1.5;
const worker=new Worker(new URL('./frt-worker.mjs?v=frt-1',import.meta.url),{type:'module'});
const scientific=x=>x===0?'0':Math.abs(x)<1e-12?'≈ 0':x.toExponential(3),percent=x=>`${x>0&&100*x<.0001?(100*x).toExponential(3):(100*x).toFixed(4)}%`;
const names={frequency:'激光频率噪声',intensity:'相对强度噪声'},shapes={peak:'高斯窄带',lowpass:'低通洛伦兹',white:'带限白噪声'};
const selectedResponse=kind=>kind==='frequency'?response.nu:response.intensity;
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
  response=null;$('status').textContent='正在由理想门轨迹计算响应函数…';$('high').disabled=$('low').disabled=true;
  worker.postMessage({id:++requestId,rabi:Number($('rabi').value),ensemble:$('ensemble').value});controls();
}
worker.onmessage=({data})=>{
  if(data.id!==requestId)return;
  if(data.error){$('status').textContent=`计算失败：${data.error}`;return;}
  response=data.result;$('high').disabled=$('low').disabled=false;
  $('status').textContent=`理想门响应已计算：T = ${response.duration.toFixed(3)} μs；768 个时间点，401 个频率点。`;
  render();
};
worker.onerror=()=>{$('status').textContent='响应函数模块加载失败，请刷新页面。';};
function chart(id,values,unit,color,fill=false){
  const svg=$(id),width=Math.max(280,Math.round(svg.getBoundingClientRect().width||480)),height=260;
  const left=66,right=18,top=24,bottom=40,w=width-left-right,h=height-top-bottom;
  const ymax=Math.max(...values,1e-12)*1.12,xf=f=>left+w*f/12,yf=v=>top+h*(1-v/ymax);
  const path=Array.from(values,(v,i)=>`${i?'L':'M'}${xf(response.frequency[i]).toFixed(2)},${yf(v).toFixed(2)}`).join(' ');
  let markup=`<title>${svg.getAttribute('aria-label')}</title><text x="${left}" y="14" class="frt-axis-unit">${unit}</text>`;
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=yf(v);markup+=`<path d="M${left},${y}H${width-right}" class="frt-grid"/><text x="${left-7}" y="${y+4}" text-anchor="end">${v===0?'0':v.toExponential(1)}</text>`;}
  for(let f=0;f<=12;f+=3)markup+=`<text x="${xf(f)}" y="${height-23}" text-anchor="middle">${f}</text>`;
  if(fill)markup+=`<path d="${path} L${xf(12)},${top+h} L${left},${top+h}Z" fill="${color}" opacity=".14"/>`;
  markup+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2"/><path d="M${xf(probe)},${top}V${top+h}" stroke="#7856a0" stroke-dasharray="4 4"/><text x="${width-right}" y="${height-4}" text-anchor="end">f / MHz</text>`;
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
  chart('psd',spectra[active],psdUnit(),'#2b768a',true);
  chart('response',selectedResponse(active),responseUnit(),'#a96836');
  chart('product',overlaps[active].product,'MHz⁻¹','#385f9a',true);renderKernel();
}
function render(){
  controls();if(!response)return;
  for(const kind of kinds){const s=sources[kind];spectra[kind]=makeSpectrum(response.frequency,{...s,rms:s.enabled?s.rms:0});overlaps[kind]=spectrumOverlap(response.frequency,spectra[kind],selectedResponse(kind));$(`epsilon-${kind}`).textContent=percent(overlaps[kind].infidelity);}
  const total=kinds.reduce((sum,k)=>sum+overlaps[k].infidelity,0);
  $('epsilon-total').textContent=percent(total);$('variance').textContent=`${scientific(overlaps[active].variance)} ${active==='frequency'?'MHz²':'（分数）²'}`;
  $('description').textContent=`当前显示${names[active]}。${sources[active].enabled?'该通道已计入积分。':'该通道未计入积分，谱与乘积显示为零。'}领先阶预测为 1 − F ≈ ${scientific(total)}，不含耗散及有限阻塞误差。`;
  $('source-table').innerHTML=kinds.map(k=>`<tr><th>${names[k]}</th><td>${sources[k].enabled?'计入':'关闭'}</td><td>${k==='frequency'?`${(sources[k].rms*1000).toFixed(1)} kHz`:`${(sources[k].rms*100).toFixed(2)}%`}</td><td>${shapes[sources[k].shape]}</td><td>${scientific(overlaps[k].variance)} ${k==='frequency'?'MHz²':'分数²'}</td><td>${percent(overlaps[k].infidelity)}</td></tr>`).join('');draw();
}
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
$('reset').addEventListener('click',()=>{sources=defaults();active='frequency';probe=1.5;$('source').value=active;$('rabi').value=3;$('ensemble').value='haar';$('probe').value=probe;$('weighted').checked=true;requestResponse();});
let resize;window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(draw,100);});
requestResponse();

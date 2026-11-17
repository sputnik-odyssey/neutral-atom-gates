export const COLS=38,ROWS=24,TILE=16;
export const STATIONS=[{x:8,y:3},{x:29,y:3},{x:8,y:11},{x:29,y:11},{x:8,y:19},{x:29,y:19}];
export function floor(x,y){
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=COLS||y>=ROWS)return false;
 if(STATIONS.some(p=>p.x===x&&p.y===y))return false;
 if((x===18||x===19)&&y>=1&&y<=22)return true;
 for(const start of [1,9,17]){
  if(y>=start&&y<=start+5&&((x>=1&&x<=16)||(x>=21&&x<=36)))return true;
  if(y===start+3&&(x===17||x===20))return true;
 }
 return false;
}
export function pathTo(start,target){
 if(!floor(target.x,target.y))return null;
 const key=p=>`${p.x},${p.y}`,queue=[start],seen=new Map([[key(start),null]]);
 for(let i=0;i<queue.length;i++){
  const at=queue[i];if(at.x===target.x&&at.y===target.y){const path=[];let k=key(at);while(seen.get(k)!==null){const [x,y]=k.split(',').map(Number);path.unshift({x,y});k=seen.get(k);}return path;}
  for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const p={x:at.x+dx,y:at.y+dy},k=key(p);if(floor(p.x,p.y)&&!seen.has(k)){seen.set(k,key(at));queue.push(p);}}
 }
 return null;
}

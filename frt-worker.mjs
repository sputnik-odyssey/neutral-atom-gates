import {computeResponses} from './frt.mjs?v=frt-1';
const cache=new Map();
self.onmessage=({data})=>{
  const {id,rabi,ensemble}=data,key=`${rabi}:${ensemble}`;
  try{
    if(!cache.has(key)){
      if(cache.size>=6)cache.delete(cache.keys().next().value);
      cache.set(key,computeResponses({rabi,ensemble}));
    }
    self.postMessage({id,result:cache.get(key)});
  }catch(error){self.postMessage({id,error:error.message});}
};

import {computeResponses} from './frt.mjs?v=protocol-1';
const cache=new Map();
self.onmessage=({data})=>{
  const {id,rabi,ensemble}=data,key=`${rabi}:${ensemble}`;
  try{
    if(!cache.has(key)){
      if(cache.size>=3)cache.delete(cache.keys().next().value);
      cache.set(key,{sequential:computeResponses({rabi,ensemble}),phase:computeResponses({rabi,ensemble,protocol:'phase'})});
    }
    self.postMessage({id,result:cache.get(key)});
  }catch(error){self.postMessage({id,error:error.message});}
};

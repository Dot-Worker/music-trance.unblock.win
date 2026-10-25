import {Zip,ZipPassThrough} from 'fflate';
let archive=null,file=null;
self.onmessage=({data})=>{
 try{
  if(data.type==='start')archive=new Zip((error,bytes,final)=>{if(error){self.postMessage({type:'error',message:'ZIP 打包失败，仍可逐首下载。'});return;}self.postMessage({type:'data',bytes,final},[bytes.buffer]);});
  else if(data.type==='file'){if(!archive||file)throw new Error();file=new ZipPassThrough(data.name);archive.add(file);}
  else if(data.type==='chunk'){if(!file)throw new Error();file.push(new Uint8Array(data.bytes),data.last);if(data.last)file=null;}
  else if(data.type==='end'){if(!archive||file)throw new Error();archive.end();}
  else throw new Error();
  self.postMessage({type:'ack'});
 }catch{self.postMessage({type:'error',message:'ZIP 打包失败，仍可逐首下载。'});}
};

import {zipSync} from 'fflate';
self.onmessage=({data})=>{try{const files=Object.create(null);for(const file of data)files[file.name]=new Uint8Array(file.bytes);const bytes=zipSync(files,{level:0});self.postMessage({ok:true,bytes},[bytes.buffer]);}catch{self.postMessage({ok:false,message:'ZIP 打包失败，仍可逐首下载。'});}};

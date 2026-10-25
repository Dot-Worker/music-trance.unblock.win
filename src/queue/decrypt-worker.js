import {decryptFile} from '../decrypt/index.js';
self.onmessage=async({data})=>{
 try {const result=await decryptFile(new Uint8Array(data.bytes),{name:data.name,dbBytes:data.dbBytes?new Uint8Array(data.dbBytes):undefined,masterKeyHex:data.masterKeyHex||undefined,sqlWasmUrl:data.sqlWasmUrl});
 // Only the audio and a format label are needed. Never fetch artwork or expose private metadata.
 self.postMessage({ok:true,audio:result.audio,extension:result.extension,sourceFormat:result.sourceFormat},[result.audio.buffer]);
 } catch(error){self.postMessage({ok:false,error:{code:error.code||'DECRYPT_FAILED',message:error.message||'解密失败'}});}
};

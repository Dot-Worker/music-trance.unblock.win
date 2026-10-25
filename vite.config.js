import { defineConfig } from 'vite';
import { runtimeLayout } from './scripts/runtime-layout.mjs';
const layout=runtimeLayout();
export default defineConfig({
 base:'./', worker:{format:'es'}, build:{target:'es2022'},
 define:{__APE_CORE_DIRECTORY__:JSON.stringify(layout.apeDirectory),__APE_SOURCE_PATH__:JSON.stringify(layout.apeSourcePath),__AUDIO_DOWNLOAD_BYTES__:JSON.stringify(layout.engineDownloadBytes),__AUDIO_CORE_DIRECTORY__:JSON.stringify(layout.coreDirectory),__AUDIO_WRAPPER_DIRECTORY__:JSON.stringify(layout.wrapperDirectory),__AUDIO_SOURCE_PATH__:JSON.stringify(layout.sourcePath)}
});

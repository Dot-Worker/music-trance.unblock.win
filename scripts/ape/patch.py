from pathlib import Path
import sys
p=Path(sys.argv[1])
def edit(name, a,b):
 f=p/name;s=f.read_text();assert a in s,(name,a);f.write_text(s.replace(a,b))
edit('Source/MACLib/APECompressCore.h','class CAPECompressCore : public CThread','class CAPECompressCore')
edit('Source/MACLib/APECompressCore.h','~CAPECompressCore() APE_OVERRIDE;','~CAPECompressCore();')
edit('Source/MACLib/APECompressCore.h','    void Run() APE_OVERRIDE;\n\n    CSemaphore m_semProcess;\n    CSemaphore m_semReady;','    // Synchronous WASM encoder: no worker thread or semaphores.')
edit('Source/MACLib/APECompressCore.cpp',': m_semProcess(1), m_semReady(1)\n{\n    m_semProcess.Wait();','{')
edit('Source/MACLib/APECompressCore.cpp','    Exit();\n    Wait();','    Exit();')
f=p/'Source/MACLib/APECompressCore.cpp';s=f.read_text();a=s.index('void CAPECompressCore::Run()');b=s.index('int CAPECompressCore::Encode(',a);s=s[:a]+'''int CAPECompressCore::EncodeFrame(const void * pInputData, int nInputBytes)
{
    // Preserve the upstream frame codec; execute it immediately instead of scheduling.
    return Encode(pInputData, nInputBytes);
}

'''+s[b:];s=s.replace('    m_semReady.Wait();','    // Encoding has already completed synchronously.').replace('    m_semProcess.Post();','    // No worker to wake.');f.write_text(s)
edit('Source/MACLib/APECompressCreate.cpp','        m_spAPECompressCore[i]->Start();','        // Synchronous encoder: no worker startup.')
edit('Source/MACLib/APECompressCreate.cpp','    m_nThreads = nThreads;','    if (nThreads != 1) return APE_ERROR_UNDEFINED;\n    m_nThreads = 1;')
edit('Source/MACLib/APECompressCreate.cpp','        pWorker->Wait();','        // Synchronous encode has completed.')
edit('Source/Shared/CPUFeatures.cpp','#if defined(PLATFORM_LINUX)','#if defined(PLATFORM_LINUX) && !defined(__EMSCRIPTEN__)')

#include "All.h"
#include "MACLib.h"
#include <emscripten/emscripten.h>
extern "C" EMSCRIPTEN_KEEPALIVE int ape_encode_wav(const char *input, const char *output, int level) {
    if (!input || !output || level != 2000) return -1;
    return CompressFile(input, output, 2000, nullptr, 1, nullptr);
}

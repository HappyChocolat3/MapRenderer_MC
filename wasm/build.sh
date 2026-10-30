#!/usr/bin/env bash
# Builds web/cubiomes.wasm from the vendored cubiomes sources.
#
# Requirements (Debian/Ubuntu):
#   apt-get install clang lld wasi-libc libclang-rt-dev-wasm32
# (on Ubuntu 24.04 the last package is called libclang-rt-18-dev-wasm32)
set -euo pipefail
cd "$(dirname "$0")/.."

CC=${CC:-clang}
SYSROOT=${WASI_SYSROOT:-/usr}

SRC="cubiomes/noise.c cubiomes/biomes.c cubiomes/layers.c cubiomes/biomenoise.c
     cubiomes/generator.c cubiomes/finders.c cubiomes/util.c
     wasm/api.c"

"$CC" --target=wasm32-wasi --sysroot="$SYSROOT" \
    -O3 -flto -fno-math-errno -msimd128 -Wno-everything \
    -mexec-model=reactor \
    -Wl,--strip-all -Wl,--lto-O3 -Wl,--gc-sections \
    -Wl,-z,stack-size=1048576 \
    -o web/cubiomes.wasm $SRC

ls -l web/cubiomes.wasm

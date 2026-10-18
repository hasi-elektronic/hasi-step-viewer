#!/usr/bin/env bash
# Baut OCCT (Open CASCADE Technology, LGPL-2.1 mit OCCT-Ausnahme) als dynamische Bibliotheken – nur die Module,
# die der native Kern braucht, ohne Fremdbibliotheken (kein FreeType, FreeImage, OpenGL, Tcl/Tk, TBB, VTK).
# Aufruf: tools/occt-bauen.sh <installationsordner>   (macOS: OCCT_ARCHS="arm64;x86_64" für Universal)
set -euo pipefail
VER=7.8.1; TAG=V7_8_1
ZIEL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
ARB=${RUNNER_TEMP:-/tmp}/occt-src
mkdir -p "$ARB"; cd "$ARB"
[ -f occt.tgz ] || curl -fsSL -o occt.tgz "https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/$TAG.tar.gz"
rm -rf "OCCT-${TAG#V}" && tar xzf occt.tgz
EXTRA=()
if [ "$(uname)" = "Darwin" ]; then EXTRA+=("-DCMAKE_OSX_ARCHITECTURES=${OCCT_ARCHS:-arm64;x86_64}" "-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0"); fi
cmake -S "OCCT-${TAG#V}" -B build -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release \
  -DINSTALL_DIR="$ZIEL" -DINSTALL_DIR_LAYOUT=Unix -DBUILD_LIBRARY_TYPE=Shared \
  -DBUILD_MODULE_Draw=OFF -DBUILD_MODULE_Visualization=ON -DBUILD_MODULE_ApplicationFramework=ON -DBUILD_MODULE_DataExchange=ON \
  -DUSE_FREETYPE=OFF -DUSE_OPENGL=OFF -DUSE_GLES2=OFF -DUSE_D3D=OFF -DUSE_TK=OFF -DUSE_FREEIMAGE=OFF -DUSE_XLIB=OFF -DUSE_TBB=OFF \
  -DUSE_VTK=OFF -DUSE_RAPIDJSON=OFF -DUSE_DRACO=OFF -DUSE_OPENVR=OFF -DUSE_FFMPEG=OFF -DBUILD_DOC_Overview=OFF "${EXTRA[@]}"
cmake --build build --config Release --parallel
cmake --install build --config Release
echo "OCCT $VER installiert in $ZIEL"

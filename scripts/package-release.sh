#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-dev}"
OUTDIR="${2:-release}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="${OUTDIR}/nullclaw-chat-ui"

cd "${ROOT_DIR}"
rm -rf "${OUTDIR}"
mkdir -p "${PKG_DIR}/bin"

cp -R build "${PKG_DIR}/build"
if [[ -d dist ]]; then
  cp -R dist/. "${PKG_DIR}/"
fi
cp bin/nullclaw-chat-ui.js "${PKG_DIR}/bin/nullclaw-chat-ui.js"
cp package.json "${PKG_DIR}/package.json"
cp README.md "${PKG_DIR}/README.md"

cat > "${PKG_DIR}/nullclaw-chat-ui" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  if [[ "$SOURCE" != /* ]]; then
    SOURCE="$DIR/$SOURCE"
  fi
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
exec node "${SCRIPT_DIR}/bin/nullclaw-chat-ui.js" "$@"
EOF
chmod +x "${PKG_DIR}/nullclaw-chat-ui"

cat > "${PKG_DIR}/nullclaw-chat-ui.cmd" <<'EOF'
@echo off
set SCRIPT_DIR=%~dp0
node "%SCRIPT_DIR%bin\nullclaw-chat-ui.js" %*
EOF

tar -czf "${OUTDIR}/nullclaw-chat-ui-${VERSION}.tar.gz" -C "${OUTDIR}" nullclaw-chat-ui
(cd "${OUTDIR}" && zip -qr "nullclaw-chat-ui-${VERSION}.zip" nullclaw-chat-ui)

echo "Created:"
echo "  ${OUTDIR}/nullclaw-chat-ui-${VERSION}.tar.gz"
echo "  ${OUTDIR}/nullclaw-chat-ui-${VERSION}.zip"

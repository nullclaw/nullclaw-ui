#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-dev}"
OUTDIR="${2:-release}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="${OUTDIR}/nullclaw-ui"

cd "${ROOT_DIR}"
rm -rf "${OUTDIR}"
mkdir -p "${PKG_DIR}/bin"

cp -R build "${PKG_DIR}/build"
cp bin/nullclaw-ui.js "${PKG_DIR}/bin/nullclaw-ui.js"
cp package.json "${PKG_DIR}/package.json"
cp README.md "${PKG_DIR}/README.md"

cat > "${PKG_DIR}/nullclaw-ui" <<'EOF'
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
exec node "${SCRIPT_DIR}/bin/nullclaw-ui.js" "$@"
EOF
chmod +x "${PKG_DIR}/nullclaw-ui"

cat > "${PKG_DIR}/nullclaw-ui.cmd" <<'EOF'
@echo off
set SCRIPT_DIR=%~dp0
node "%SCRIPT_DIR%bin\nullclaw-ui.js" %*
EOF

tar -czf "${OUTDIR}/nullclaw-ui-${VERSION}.tar.gz" -C "${OUTDIR}" nullclaw-ui
(cd "${OUTDIR}" && zip -qr "nullclaw-ui-${VERSION}.zip" nullclaw-ui)

echo "Created:"
echo "  ${OUTDIR}/nullclaw-ui-${VERSION}.tar.gz"
echo "  ${OUTDIR}/nullclaw-ui-${VERSION}.zip"

#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
OUTDIR="${2:-release}"

if [[ -z "${VERSION}" ]]; then
	echo "Usage: $0 <version-tag> [output-dir]"
	echo "Example: $0 v2026.3.5 release"
	exit 1
fi

TAR_PATH="${OUTDIR}/nullclaw-chat-ui-${VERSION}.tar.gz"
ZIP_PATH="${OUTDIR}/nullclaw-chat-ui-${VERSION}.zip"

require_cmd() {
	local cmd="$1"
	if ! command -v "${cmd}" >/dev/null 2>&1; then
		echo "Missing required command: ${cmd}" >&2
		exit 1
	fi
}

assert_file() {
	local path="$1"
	if [[ ! -f "${path}" ]]; then
		echo "Expected file not found: ${path}" >&2
		exit 1
	fi
}

assert_contains_tar() {
	local entry="$1"
	if ! tar -tzf "${TAR_PATH}" | grep -Fx -- "${entry}" >/dev/null; then
		echo "Tar archive missing entry: ${entry}" >&2
		exit 1
	fi
}

assert_contains_zip() {
	local entry="$1"
	if ! unzip -Z1 "${ZIP_PATH}" | grep -Fx -- "${entry}" >/dev/null; then
		echo "Zip archive missing entry: ${entry}" >&2
		exit 1
	fi
}

require_cmd tar
require_cmd unzip

assert_file "${TAR_PATH}"
assert_file "${ZIP_PATH}"

required_entries=(
	"nullclaw-chat-ui/README.md"
	"nullclaw-chat-ui/package.json"
	"nullclaw-chat-ui/nullclaw-chat-ui"
	"nullclaw-chat-ui/nullclaw-chat-ui.cmd"
	"nullclaw-chat-ui/bin/nullclaw-chat-ui.js"
	"nullclaw-chat-ui/build/index.html"
)

for entry in "${required_entries[@]}"; do
	assert_contains_tar "${entry}"
	assert_contains_zip "${entry}"
done

echo "Verified release artifacts:"
echo "  ${TAR_PATH}"
echo "  ${ZIP_PATH}"

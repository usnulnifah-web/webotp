#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${WEBOTP_REPO_URL:-https://github.com/usnulnifah-web/webotp.git}"
if [[ "$(id -u)" -eq 0 ]]; then
  DEFAULT_DIR="/opt/webotp"
else
  DEFAULT_DIR="${HOME:-/tmp}/webotp"
fi
APP_DIR="${WEBOTP_DIR:-$DEFAULT_DIR}"
BRANCH="${WEBOTP_BRANCH:-main}"

if [[ -z "${DATABASE_URL:-}" || -z "${JWT_SECRET:-}" ]]; then
  echo "ERROR: DATABASE_URL dan JWT_SECRET wajib diisi sebelum menjalankan autoinstall." >&2
  echo "Contoh:" >&2
  echo "  DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DATABASE' JWT_SECRET='minimal-32-karakter' bash autoinstall.sh" >&2
  exit 1
fi
if [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "ERROR: JWT_SECRET harus minimal 32 karakter." >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { echo "ERROR: curl wajib tersedia." >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "ERROR: tar wajib tersedia." >&2; exit 1; }

mkdir -p "$APP_DIR"
if [[ -f "$APP_DIR/install.sh" && -f "$APP_DIR/package.json" ]]; then
  echo "[webotp] Folder aplikasi sudah ada: $APP_DIR"
else
  echo "[webotp] Mengunduh WebOTP branch $BRANCH ke $APP_DIR"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  curl -fsSL "$REPO_URL/archive/refs/heads/${BRANCH}.tar.gz" | tar -xzf - -C "$TMP_DIR"
  SOURCE_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d -print -quit)"
  [[ -n "$SOURCE_DIR" ]] || { echo "ERROR: arsip repository kosong." >&2; exit 1; }
  cp -a "$SOURCE_DIR"/. "$APP_DIR"/
fi

chmod 700 "$APP_DIR/install.sh"
exec bash "$APP_DIR/install.sh" --app-dir "$APP_DIR" "$@"

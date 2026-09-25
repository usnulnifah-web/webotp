#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-3000}"
SERVICE_NAME="${SERVICE_NAME:-webotp}"
NO_SYSTEMD=0
SKIP_DB=0

usage() {
  cat <<'USAGE'
Usage: bash install.sh [options]

Options:
  --app-dir DIR       Install from/use DIR instead of the script directory
  --port PORT         Port for the Node.js service (default: 3000)
  --no-systemd        Shared-hosting mode; create start-hosting.sh only
  --skip-db           Skip database migration (use only if DB is not ready)
  -h, --help          Show this help

Required environment variables:
  DATABASE_URL        MySQL/TiDB connection string
  JWT_SECRET          Secret of at least 32 characters

Examples:
  DATABASE_URL='mysql://user:pass@host/db' JWT_SECRET='change-me-32-chars-minimum' bash install.sh
  DATABASE_URL='...' JWT_SECRET='...' bash install.sh --no-systemd --port 3000
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="$(cd "$2" && pwd)"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --no-systemd) NO_SYSTEMD=1; shift ;;
    --skip-db) SKIP_DB=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

cd "$APP_DIR"
[[ -f package.json ]] || { echo "ERROR: package.json tidak ditemukan di $APP_DIR" >&2; exit 1; }
[[ -f pnpm-lock.yaml ]] || { echo "ERROR: pnpm-lock.yaml tidak ditemukan" >&2; exit 1; }

if [[ -z "${DATABASE_URL:-}" || -z "${JWT_SECRET:-}" ]]; then
  echo "ERROR: DATABASE_URL dan JWT_SECRET wajib diisi." >&2
  echo "Contoh: DATABASE_URL='mysql://user:pass@host/db' JWT_SECRET='minimal-32-karakter' bash install.sh" >&2
  exit 1
fi
if [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "ERROR: JWT_SECRET harus minimal 32 karakter." >&2
  exit 1
fi

log() { printf '\n[webotp] %s\n' "$*"; }

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 18+ wajib tersedia di hosting ini." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "ERROR: Node.js 18+ diperlukan; versi saat ini $(node -v)." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  command -v npm >/dev/null 2>&1 || { echo "ERROR: pnpm maupun npm tidak tersedia." >&2; exit 1; }
  log "Memasang pnpm 10.4.1"
  npm install --global pnpm@10.4.1
fi

log "Memasang dependency"
pnpm install --frozen-lockfile

umask 077
if [[ -f .env ]]; then
  cp .env ".env.backup.$(date +%Y%m%d%H%M%S)"
fi
cat > .env <<EOF
NODE_ENV=production
PORT=$PORT
DATABASE_URL=$DATABASE_URL
JWT_SECRET=$JWT_SECRET
EOF
for key in VITE_APP_ID OAUTH_SERVER_URL OWNER_OPEN_ID BUILT_IN_FORGE_API_URL BUILT_IN_FORGE_API_KEY; do
  if [[ -n "${!key:-}" ]]; then printf '%s=%s\n' "$key" "${!key}" >> .env; fi
done

if [[ "$SKIP_DB" -eq 0 ]]; then
  log "Menjalankan migrasi database"
  pnpm db:push
fi

log "Membuat production build"
pnpm build

cat > start-hosting.sh <<'START'
#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export NODE_ENV=production
exec pnpm start
START
chmod 700 start-hosting.sh

HAS_SYSTEMD=0
if [[ "$NO_SYSTEMD" -eq 0 && "$(id -u)" -eq 0 && "$(command -v systemctl || true)" ]]; then
  HAS_SYSTEMD=1
  log "Membuat service systemd: $SERVICE_NAME"
  PNPM_BIN="$(command -v pnpm)"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=WebOTP Node.js service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$PNPM_BIN start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME.service"
  sleep 2
  systemctl is-active --quiet "$SERVICE_NAME.service" || { journalctl -u "$SERVICE_NAME.service" -n 80 --no-pager; exit 1; }
  log "Service aktif: $SERVICE_NAME.service"
else
  log "Shared-hosting mode: systemd tidak digunakan"
  log "Atur Node.js App di control panel dengan startup file: start-hosting.sh"
fi

if command -v curl >/dev/null 2>&1; then
  sleep 1
  curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || true
fi

log "Instalasi selesai"
echo "App directory : $APP_DIR"
echo "Port          : $PORT"
echo "Start script  : $APP_DIR/start-hosting.sh"
if [[ "$HAS_SYSTEMD" -eq 1 ]]; then
  echo "Service       : $SERVICE_NAME.service"
fi

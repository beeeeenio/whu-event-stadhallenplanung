#!/usr/bin/env bash
# Startet ein lokales PocketBase mit Test-Accounts (zum Ausprobieren der App, ohne den echten Server).
#
#   bash server/dev-local.sh      (im Repo-Ordner; läuft, bis du Strg+C drückst)
#   npm run dev                   (in einem zweiten Terminal; leitet /api an 127.0.0.1:8090)
#
# Lädt PocketBase beim ersten Mal selbst herunter (Version wie auf dem Server, siehe install.sh).
# Daten liegen in server/.dev/ und können jederzeit gelöscht werden. Mit PB_BIN=/pfad/zu/pocketbase
# lässt sich ein vorhandenes Programm verwenden.
set -euo pipefail

cd "$(dirname "$0")"
PB_VERSION="$(grep -m1 '^PB_VERSION=' install.sh | cut -d'"' -f2)"
DEV=".dev"
PORT="${PB_PORT:-8090}"
mkdir -p "$DEV"

if [ -z "${PB_BIN:-}" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) ASSET="darwin_arm64" ;;
    Darwin-x86_64) ASSET="darwin_amd64" ;;
    Linux-x86_64) ASSET="linux_amd64" ;;
    Linux-aarch64) ASSET="linux_arm64" ;;
    *) echo "Unbekanntes System $(uname -s)-$(uname -m): bitte PB_BIN=/pfad/zu/pocketbase setzen." >&2; exit 1 ;;
  esac
  PB_BIN="$DEV/pocketbase"
  if [ ! -x "$PB_BIN" ] || ! "$PB_BIN" --version 2>/dev/null | grep -qx "pocketbase version $PB_VERSION"; then
    echo "Lade PocketBase $PB_VERSION ($ASSET)…"
    curl -fL -o "$DEV/pb.zip" "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${ASSET}.zip"
    unzip -o -q "$DEV/pb.zip" pocketbase -d "$DEV"
    rm -f "$DEV/pb.zip"
    chmod +x "$PB_BIN"
  fi
fi

ARGS=(--dir "$DEV/pb_data" --migrationsDir pb_migrations --hooksDir pb_hooks)
"$PB_BIN" superuser upsert dev@test.local DevPasswort123 "${ARGS[@]}" >/dev/null

"$PB_BIN" serve --http "127.0.0.1:$PORT" "${ARGS[@]}" &
PB_PID=$!
trap 'kill $PB_PID 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 30); do
  curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done

PB_PORT="$PORT" node dev-seed.mjs
echo
echo "PocketBase läuft auf http://127.0.0.1:$PORT (Admin-Oberfläche: /_/, Login dev@test.local / DevPasswort123)."
echo "Jetzt in einem zweiten Terminal: npm run dev  →  http://localhost:5173"
wait $PB_PID

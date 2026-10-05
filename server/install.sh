#!/usr/bin/env bash
#
# Installiert oder aktualisiert das Stadthallen-Backend (PocketBase) auf einem
# Ubuntu-Server. Beliebig oft ausführbar: legt an, was fehlt, ersetzt Hooks und
# Migrationen durch den Stand aus diesem Ordner und startet den Dienst neu.
#
# Alles liegt unter /opt/stadthalle, der einzige Zustand in pb_data/. Ein Umzug
# auf einen anderen Server ist darum: dort dieses Skript ausführen, pb_data/
# hinüberkopieren, fertig (README.md, „Umzug“).
#
# Aufruf vom Laptop aus:
#   rsync -a --delete server/ root@SERVER:/root/stadthalle-src/
#   ssh root@SERVER bash /root/stadthalle-src/install.sh

set -euo pipefail

PB_VERSION="0.40.4"
# Aus checksums.txt des GitHub-Releases, für pocketbase_${PB_VERSION}_linux_amd64.zip.
PB_SHA256="9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa"

APP_DIR=/opt/stadthalle
SRC="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen." >&2; exit 1; }
[ "$(uname -m)" = x86_64 ] || { echo "Nur für x86_64 gebaut (PB_SHA256 gilt für linux_amd64)." >&2; exit 1; }

id stadthalle >/dev/null 2>&1 ||
  useradd --system --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin stadthalle

# Programm, Hooks und Migrationen gehören root und sind für den Dienst nur
# lesbar; schreiben darf er ausschließlich in pb_data.
install -d -o root -g root -m 755 "$APP_DIR" "$APP_DIR/pb_public"
install -d -o stadthalle -g stadthalle -m 700 "$APP_DIR/pb_data"

if ! "$APP_DIR/pocketbase" --version 2>/dev/null | grep -qx "pocketbase version $PB_VERSION"; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/pb.zip" \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip"
  echo "$PB_SHA256  $tmp/pb.zip" | sha256sum -c --quiet -
  python3 -m zipfile -e "$tmp/pb.zip" "$tmp/pb"
  install -o root -g root -m 755 "$tmp/pb/pocketbase" "$APP_DIR/pocketbase"
  echo "PocketBase $PB_VERSION installiert."
fi

for dir in pb_migrations pb_hooks; do
  rm -rf "${APP_DIR:?}/$dir"
  cp -r "$SRC/$dir" "$APP_DIR/$dir"
  chown -R root:root "$APP_DIR/$dir"
  chmod -R u=rwX,go=rX "$APP_DIR/$dir"
done

install -o root -g root -m 644 "$SRC/stadthalle.service" /etc/systemd/system/stadthalle.service
systemctl daemon-reload
systemctl enable --quiet stadthalle
systemctl restart stadthalle

for _ in $(seq 1 30); do
  if curl -fs -o /dev/null http://127.0.0.1:8090/api/health; then
    echo "Stadthallen-Backend läuft auf 127.0.0.1:8090."
    exit 0
  fi
  sleep 1
done
echo "Backend antwortet nicht – siehe: journalctl -u stadthalle -n 50" >&2
exit 1

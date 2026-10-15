# Neue Version live schalten (Server mit PocketBase)

Für: die Person mit SSH-Zugang zum Server (`root@SERVER`).
Dauer: ca. 2 Minuten. Datenbank und gespeicherte Projekte bleiben unberührt.

## Was neu ist

- 3D-Ansicht der Stadthalle (Button „3D“ unten in der Leiste)
- Farben für alle Objekte
- Visiova-V55-Rahmen mit Druck
- Forex-Blenden an NivTec-Bühnen

Am Backend ändert sich **nichts**. Hooks, Migrationen und Datenbank bleiben gleich. Nur das Frontend wird neu gebaut und hochgeladen.

## Voraussetzungen (einmalig)

- Node.js ab Version 20 (`node -v`)
- SSH-Zugang als `root` auf den Server, also derselbe wie bei der Einrichtung
- Repository geklont: `git clone https://github.com/beeeeenio/whu-event-stadhallenplanung.git`

## Schritte

Im Repository-Ordner:

```bash
git fetch
git checkout backend-pocketbase
git pull
npm install
npm run build
rsync -rlt --delete dist/ root@SERVER:/opt/stadthalle/pb_public/
```

`SERVER` durch die Serveradresse ersetzen.

Kein Neustart nötig: PocketBase liefert die Dateien aus `/opt/stadthalle/pb_public/` direkt aus.

## Prüfen

1. `https://stadthalle.whu-event.de` öffnen und mit Cmd+Shift+R (Windows: Strg+F5) neu laden.
2. Unten in der Leiste muss der Button **„3D“** sein, oben weiterhin „Teilen“ und „Gespeichert“.
3. Ein Projekt öffnen, „3D“ klicken. Die Halle mit Wänden und Bühne erscheint.

## Falls etwas schiefgeht

- **`Permission denied (publickey)`:** Falscher Benutzer oder Schlüssel. Mit demselben Zugang verbinden wie bei der Einrichtung.
- **Seite weiß oder alt:** Browser-Cache leeren bzw. hart neu laden. Prüfen, dass `dist/index.html` auf dem Server unter `/opt/stadthalle/pb_public/index.html` liegt.
- **Zurück zur alten Version:** Auf den vorherigen Commit wechseln, neu bauen und wieder hochladen:
  ```bash
  git checkout 3ffbaf5 && npm run build && rsync -rlt --delete dist/ root@SERVER:/opt/stadthalle/pb_public/
  git checkout backend-pocketbase
  ```

## Später: Benni selbst ausrollen lassen (optional)

Benni schickt seinen öffentlichen Schlüssel (`cat ~/.ssh/id_ed25519.pub`, sonst vorher `ssh-keygen -t ed25519`). Auf dem Server eintragen:

```bash
echo "SCHLÜSSEL-ZEILE" >> /root/.ssh/authorized_keys
```

## NivTec-Tool (separat)

Die Forex-Blenden im NivTec-Tool liegen als Pull Request vor: https://github.com/beeeeenio/whu-event-NivTec/pull/1. Nach dem Mergen wie gewohnt ausrollen. Das ist unabhängig von den Schritten oben.

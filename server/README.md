# Stadthallen-Backend

PocketBase (ein Programm + SQLite) für Login, gemeinsame Projekte, Versionen
und Vorlagen. Läuft vollständig getrennt von allem anderen auf dem Server:
eigener Systembenutzer `stadthalle`, eigener Ordner `/opt/stadthalle`, eigener
Dienst `stadthalle.service`, eigene Datenbank. Gemeinsam genutzt wird nur Caddy
für HTTPS.

| Was | Wo |
|---|---|
| Programm, Hooks, Migrationen | `/opt/stadthalle/` (gehört root, nur lesbar) |
| **Alle Daten** (Datenbank, Backups) | `/opt/stadthalle/pb_data/` |
| Frontend (gebaute App) | `/opt/stadthalle/pb_public/` |
| Dienst | `systemctl status stadthalle`, Logs: `journalctl -u stadthalle` |
| Intern erreichbar | `http://127.0.0.1:8090` |
| Admin-Oberfläche | `https://stadthalle.whu-event.de/_/` (vor der Domain-Umstellung per SSH-Tunnel, s. u.) |

## Datenmodell

- **projects**: `name`, `data` (der komplette Plan als JSON), `version`,
  `owner`, `editors`, `viewers`. Eigentümer verwalten Mitglieder und löschen,
  Bearbeiter speichern, Leser sehen nur.
- **project_versions**: benannte Stände eines Projekts (wie das VersionsMenu).
- **templates**: Aufbau-Vorlagen, pro Person.
- **users**: nur auf Einladung, keine Selbst-Registrierung. Login per E-Mail-Code
  (braucht SMTP) oder Passwort.

Speichern mit Konflikterkennung: Die App schickt `version` = geladene Version + 1.
Hat jemand anderes inzwischen gespeichert, antwortet der Server mit **409**
(`pb_hooks/projects.pb.js`).

Mitglieder: `GET/POST /api/stadthalle/projects/{id}/members`,
`DELETE /api/stadthalle/projects/{id}/members/{userId}` (`pb_hooks/members.pb.js`).

## Installieren / aktualisieren

Vom Repo-Ordner aus:

```sh
rsync -a --delete server/ root@SERVER:/root/stadthalle-src/
ssh root@SERVER bash /root/stadthalle-src/install.sh
```

Das Skript ist beliebig oft ausführbar. Neue Migrationen in `pb_migrations/`
werden beim Neustart automatisch angewendet.

Admin-Account (einmalig):

```sh
ssh root@SERVER 'sudo -u stadthalle /opt/stadthalle/pocketbase superuser upsert EMAIL PASSWORT --dir /opt/stadthalle/pb_data --migrationsDir /opt/stadthalle/pb_migrations --hooksDir /opt/stadthalle/pb_hooks'
```

Admin-Oberfläche ohne Domain (SSH-Tunnel), dann `http://localhost:8090/_/` öffnen:

```sh
ssh -N -L 8090:127.0.0.1:8090 root@SERVER
```

## Domain umstellen

1. Caddy-Eintrag einbinden. Auf `apptool-dev` gehört die Caddy-Konfiguration
   dem Campus-Repo (`server/Caddyfile`) – dort eine Zeile ans Ende setzen und
   über dessen Bootstrap ausrollen, sonst überschreibt der nächste Bootstrap sie:
   ```
   import /etc/caddy/stadthalle.caddy
   ```
   und diese Datei dorthin kopieren:
   `scp server/stadthalle.caddy root@SERVER:/etc/caddy/stadthalle.caddy`
2. DNS: `stadthalle.whu-event.de` von GitHub Pages (CNAME) auf einen
   **A-Record** mit der Server-IP umstellen.
3. `systemctl reload caddy` – Caddy holt das Zertifikat selbst.

## Umzug auf einen eigenen Server

1. Neuen Ubuntu-Server anlegen, SSH-Schlüssel hinterlegen.
2. Dort installieren (siehe oben) und `stadthalle.caddy` als Caddy-Konfiguration
   einrichten (auf einem eigenen Server kann sie die ganze `/etc/caddy/Caddyfile` sein).
3. Daten kopieren – Dienst vorher auf dem alten Server stoppen, damit nichts
   mehr geschrieben wird:
   ```sh
   ssh root@ALT 'systemctl stop stadthalle'
   ssh root@ALT 'tar -C /opt/stadthalle -czf - pb_data pb_public' | ssh root@NEU 'tar -C /opt/stadthalle -xzf - && chown -R stadthalle:stadthalle /opt/stadthalle/pb_data && systemctl restart stadthalle'
   ```
4. DNS-A-Record auf die neue IP umstellen.
5. Auf dem alten Server aufräumen:
   ```sh
   systemctl disable --now stadthalle
   rm /etc/systemd/system/stadthalle.service /etc/caddy/stadthalle.caddy
   # import-Zeile aus der Caddyfile entfernen, dann: systemctl reload caddy
   rm -rf /opt/stadthalle && userdel stadthalle
   ```

## Backups

PocketBase legt jede Nacht um 3 Uhr ein Backup in `pb_data/backups/` ab und
behält die letzten 7 (Admin-Oberfläche → Settings → Backups). Die liegen auf
derselben Platte; für Schutz gegen Serverausfall zusätzlich S3 in denselben
Einstellungen hinterlegen oder DigitalOcean-Backups für den Droplet aktivieren.

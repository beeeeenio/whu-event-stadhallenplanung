# Automatisches Ausrollen auf den Stadthallen-Server

Ziel: Jede Änderung auf dem Branch `backend-pocketbase` wird von GitHub Actions gebaut und automatisch nach `/opt/stadthalle/pb_public/` hochgeladen (`.github/workflows/deploy-server.yml`). Danach braucht niemand mehr einen eigenen Server-Zugang zum Ausrollen.

## Sicherheit

- **Eigener Deploy-Benutzer:** GitHub verbindet sich als `stadthalle-deploy`, nicht als `root`.
- **Eingeschränkter Schlüssel:** Der Schlüssel erlaubt nur `rsync` in das Verzeichnis `/opt/stadthalle/pb_public/` (`rrsync -wo`, `restrict`). Keine Shell, kein Lesen, kein anderes Verzeichnis.
- **Datenbank geschützt:** `pb_data/` ist für diesen Benutzer nicht erreichbar.
- **Privater Schlüssel bleibt bei Benni:** Er liegt nur als verschlüsseltes GitHub-Secret vor. Der Server bekommt nur den öffentlichen Teil.

## Schritt 1: Benni (Repository-Besitzer)

Im Terminal auf dem Mac:

```bash
ssh-keygen -t ed25519 -N "" -C stadthalle-deploy -f ~/.ssh/stadthalle-deploy
gh secret set DEPLOY_SSH_KEY -R beeeeenio/whu-event-stadhallenplanung < ~/.ssh/stadthalle-deploy
cat ~/.ssh/stadthalle-deploy.pub
```

Die letzte Zeile (beginnt mit `ssh-ed25519 …`) an den Mitbewohner schicken. Sie ist öffentlich und darf geteilt werden.

## Schritt 2: Mitbewohner (Server-Admin)

Diesen Text an Claude Code geben, im Ordner des Repositorys. `SERVER` und den Schlüssel ersetzen:

> Richte im Repository `whu-event-stadhallenplanung` das automatische Ausrollen ein, wie in `docs/server-autodeploy.md` beschrieben.
> 1. `git fetch && git checkout backend-pocketbase && git pull`
> 2. Auf dem Server (`root@SERVER`) die Datei `/etc/stadthalle/deploy_key.pub` mit genau dieser Zeile anlegen (Verzeichnis ggf. erstellen, Rechte 644): `ssh-ed25519 AAAA… stadthalle-deploy`
> 3. Prüfen, dass `rrsync` auf dem Server vorhanden ist (`command -v rrsync`, kommt mit `rsync` ≥ 3.2.4). Falls nicht: `apt-get install -y rsync`, und wenn es dann immer noch fehlt, `/usr/share/doc/rsync/scripts/rrsync` nach `/usr/local/bin/rrsync` kopieren und ausführbar machen.
> 4. Das Backend wie gewohnt aktualisieren: `rsync -a --delete server/ root@SERVER:/root/stadthalle-src/` und `ssh root@SERVER bash /root/stadthalle-src/install.sh`. Das Skript legt den Benutzer `stadthalle-deploy` an, gibt ihm `pb_public/` und trägt den Schlüssel eingeschränkt ein.
> 5. Kontrolle: `ssh root@SERVER cat /home/stadthalle-deploy/.ssh/authorized_keys` muss mit `command="rrsync -wo /opt/stadthalle/pb_public",restrict ssh-ed25519` beginnen, und `ls -ld /opt/stadthalle/pb_public` muss `stadthalle-deploy` als Besitzer zeigen.
> 6. Mir den Hostnamen nennen, unter dem der Server per SSH aus dem Internet erreichbar ist (IPv4, GitHub Actions hat kein IPv6).
> Nichts an `pb_data/` ändern.

## Schritt 3: Benni

Mit dem Hostnamen aus Schritt 2 (Beispiel: `stadthalle.whu-event.de`):

```bash
HOST=stadthalle.whu-event.de
gh secret set DEPLOY_HOST -R beeeeenio/whu-event-stadhallenplanung -b "$HOST"
gh secret set DEPLOY_KNOWN_HOSTS -R beeeeenio/whu-event-stadhallenplanung -b "$(ssh-keyscan -t ed25519 "$HOST" 2>/dev/null)"
gh workflow run deploy-server.yml -R beeeeenio/whu-event-stadhallenplanung --ref backend-pocketbase
```

Danach unter GitHub → Actions → „Deploy to Stadthalle server“ nachsehen, ob der Lauf grün ist, und die Seite mit Cmd+Shift+R neu laden.

## Ab dann

- **Neue Version live:** Ein Push bzw. Merge auf `backend-pocketbase` reicht.
- **Ohne Secrets:** Fehlen die Secrets, überspringt der Workflow das Hochladen mit einem Hinweis, statt rot zu werden.
- **Zugang sperren:** `/etc/stadthalle/deploy_key.pub` auf dem Server löschen, `/home/stadthalle-deploy/.ssh/authorized_keys` leeren und das Secret in GitHub entfernen.

# Hinweise für Agenten

Lies zuerst die **README.md**. Sie beschreibt Aufbau, Datenmodell, Konventionen, Live-Gang und bekannte Fallstricke.

Das Wichtigste in Kürze:
- Oberfläche, Kommentare und Doku sind auf Deutsch, Commit-Messages auf Englisch.
- Vor jedem Commit `npx tsc -b`, `npm run lint` (keine neuen Warnungen) und `npm run build` laufen lassen.
- Gespeicherte Projekte müssen weiter laden. Neue Felder sind optional. Die x/y-Konvention bleibt: Ecke bei Rechtecken, Mitte bei runden Objekten.
- Objekt-Eigenschaften im Store nur über `patchItemInCurrentPhase` ändern, damit die Phasen unabhängig bleiben.
- Live geht nur der Branch `backend-pocketbase`: zuerst PR nach `main`, dann `main` in `backend-pocketbase` mergen und pushen (README, Abschnitt 5).

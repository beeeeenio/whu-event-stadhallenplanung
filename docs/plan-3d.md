# Plan: 3D-Ansicht der Stadthalle

Ziel: schlichte, wiedererkennbare 3D-Ansicht der aktuellen Phase für Teamplanung und Präsentation. Nicht hochdetailliert.

## Ausgangslage
- 2D-Editor (Konva). Koordinaten in Pixeln mit `DEFAULT_PIXELS_PER_METER = 20` (`src/utils/scale.ts`).
- Objekt: Gruppe bei `phaseData.x/y`, gedreht um `phaseData.rotation` (Grad, im Uhrzeigersinn). Rechteckige Objekte gehen von (0,0) bis (w,h); runde (`table_round`, `table_high`, `custom_round`) sind um (0,0) zentriert, Radius `width/2`.
- Grundriss-Bild `public/plans/power-plan-simple.png` (1755×1240 px, 23,6 px/m → 74,4 m × 52,5 m), oben links = (0,0).
- `src/components/Venue3D.tsx` (WIP) baut bereits: Boden mit Grundriss-Textur, Objekte als Blöcke mit typischen Höhen, Kamera „Übersicht“/„Augenhöhe“. Three.js ist installiert.

## Schritte

### 1. 3D-Ansicht anschließen (Agent A)
- `EditorView.tsx`: `show3D` State existiert. Wenn true: `Venue3D` per `React.lazy` + `Suspense` als Overlay rendern, `onClose={() => setShow3D(false)}`. Three.js nur dann laden (eigener Chunk).
- Button „3D“ in `FloatingToolbar.tsx` existiert (Prop `on3D`).
- Esc schließt die 3D-Ansicht.
- Done: `npm run build` und `npm run lint` ohne neue Fehler/Warnungen.

### 2. Wände aus dem Grundriss (Agent B)
- Neue Datei `src/utils/wallsFromPlan.ts`, reine Funktion:
  `wallsFromImage(img: HTMLImageElement, opts?: { cellM?: number; threshold?: number }): WallBox[]`
  mit `WallBox = { x: number; z: number; w: number; d: number }` in Metern (x nach rechts, z nach unten im Plan, Box-Ecke oben links).
- Vorgehen: Bild in Offscreen-Canvas zeichnen, Raster mit Zellgröße `cellM` (Default 0,2 m = 4,72 px). Zelle ist „Wand“, wenn ≥ 60 % ihrer Pixel dunkel sind (Luminanz < `threshold`, Default 90). Benachbarte Wandzellen je Zeile zu Läufen zusammenfassen, dann gleich breite Läufe aus aufeinanderfolgenden Zeilen zu Rechtecken verschmelzen (weniger Boxen).
- Nur dicke, dunkle Linien sollen übrig bleiben (Wände), dünne Beschriftungen nicht. Bei Bedarf Zellen verwerfen, deren Lauf kürzer als 2 Zellen ist UND die keine vertikalen Nachbarn haben.
- Kein Three.js in dieser Datei. Mit Unit-Test-artigem Node-Skript nicht nötig; Prüfung über Ausgabe-Anzahl (Erwartung: einige hundert bis wenige tausend Boxen).
- Done: Datei typecheckt (`npx tsc -b`), keine Lint-Fehler.

### 3. Wände in 3D (Integration, Hauptagent)
- In `Venue3D`: Bild laden, `wallsFromImage` aufrufen, als `InstancedMesh` (eine Box-Geometrie) mit Höhe `WALL_HEIGHT` (Schätzung 6 m, als Konstante mit Kommentar „Schätzung“) rendern.
- Umschalter „Wände“ (an/aus) und Wände halbtransparent in der Übersicht.

### 4. Feinschliff (Hauptagent)
- Augenhöhe: Klick auf den Boden setzt Standpunkt, Blick zur Objektmitte.
- Test mit echter Planung (Bereich, Stuhlreihen, NivTec), Screenshots.

### 5. Später: Abgleich mit dem virtuellen Rundgang
- Sobald `rundgang.stadthalle-vallendar.de` erreichbar ist: Raumhöhe, Bühne/Empore, Wand-/Bodenfarben aus den Panoramen schätzen und als benannte Konstanten in `src/data/venue3d.ts` eintragen (alle als Schätzung markiert).

## Testen
Lokal: `git checkout claude/wizardly-mccarthy-mwpezt && npm install && npm run dev`, dann http://localhost:5173 → Projekt öffnen → Button „3D“ in der unteren Leiste.

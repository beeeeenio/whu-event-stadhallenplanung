# WHU Event – Stadthallenplanung

Browser-App zur maßstabsgetreuen Planung von Events in der **Stadthalle Vallendar**. Objekte (Tische, Stuhlreihen, Bühnen, Bars, Messewände …) werden in Metern auf den Hallenplan gesetzt. Der Aufbau lässt sich über mehrere **Phasen** planen, zum Beispiel Aufbau, Event und Abbau. Jeder Plan ist auch als **3D-Ansicht** zu sehen.

Diese README ist bewusst ausführlich. Sie soll Menschen und KI-Agenten (Claude Code o. Ä.) schnell arbeitsfähig machen: was wo liegt, welche Regeln gelten und wie man eine Änderung live bringt.

---

## Inhalt

1. [Kurzüberblick für Agenten](#1-kurzüberblick-für-agenten)
2. [Funktionen](#2-funktionen)
3. [Tech-Stack](#3-tech-stack)
4. [Lokal starten und prüfen](#4-lokal-starten-und-prüfen)
5. [Branches, Deployment und Live-Gang](#5-branches-deployment-und-live-gang)
6. [Projektstruktur](#6-projektstruktur)
7. [Koordinaten und Maßstab](#7-koordinaten-und-maßstab)
8. [Datenmodell](#8-datenmodell)
9. [Store und Undo](#9-store-und-undo)
10. [2D-Editor](#10-2d-editor)
11. [3D-Ansicht](#11-3d-ansicht)
12. [Besondere Objekte](#12-besondere-objekte)
13. [Neuen Objekttyp hinzufügen (Checkliste)](#13-neuen-objekttyp-hinzufügen-checkliste)
14. [Backend (PocketBase)](#14-backend-pocketbase)
15. [Konventionen](#15-konventionen)
16. [Testen im Browser (Playwright)](#16-testen-im-browser-playwright)
17. [Bekannte Fallstricke](#17-bekannte-fallstricke)
18. [Weitere Dokumente](#18-weitere-dokumente)

---

## 1. Kurzüberblick für Agenten

- **Sprache:**
  - Oberfläche, Kommentare und Doku sind auf **Deutsch**.
  - Commit-Messages sind auf Englisch.
  - Der Nutzer (Benni) schreibt Deutsch.
- **Vor jedem Commit prüfen:**
  - `npx tsc -b`: keine Fehler.
  - `npm run lint`: keine Errors, Warnungen nicht mehr als bisher (aktuell 13 auf `main`).
  - `npm run build`: läuft durch.
- **Zwei Hauptbranches:**
  - `main` ist der Frontend-Stand.
  - `backend-pocketbase` ist `main` plus Login, Server-Sync und Server-Ordner. **Nur dieser Branch geht auf den Live-Server.** Siehe [Abschnitt 5](#5-branches-deployment-und-live-gang).
- **Datenformat nicht brechen.** Gespeicherte Projekte (Browser, ZIP-Export, Server) müssen weiter laden. Neue Felder an `EventItem` sind immer **optional**. Alte Stände werden beim Laden normalisiert, siehe `normalizeFoamLetters` in `store.ts`.
- **Phasen sind unabhängig.** Wird ein Objekt geändert, das auch in anderen Phasen sichtbar ist, muss es aufgeteilt werden. Dafür ist `patchItemInCurrentPhase` in `src/store/store.ts` da, siehe [Abschnitt 9](#9-store-und-undo).
- **x/y-Konvention:**
  - Rechteckige Objekte: x/y ist die **linke obere Ecke**.
  - Runde Objekte (`table_round`, `table_high`, `custom_round`): x/y ist die **Mitte**.
  - 2D, 3D, PDF und Export verlassen sich darauf. Drehen um die Mitte geschieht durch Positionsausgleich (`positionForRotation` in `src/utils/geometry.ts`), nicht durch einen anderen Anker.
- **3D ist lazy geladen.** Three.js steckt nur im Chunk der 3D-Ansicht. Kein `three`-Import in 2D-Code.

---

## 2. Funktionen

- **Objektbibliothek** (`src/data/itemLibrary.ts`):
  - Tische (rund, eckig, Stehtisch, Loungetisch), Stühle, Sofas, Sessel
  - Bar, Traverse, Vorhang, Pipe & Drape, Bühnenpodest, Messestand, Garderobe, Pflanze, Leinwand
  - **Visiova-V55-Rahmen** (Druckwände)
  - **Styropor-Buchstaben**
  - Text-Label sowie eigene Objekte (Rechteck oder rund)
- **Stuhlreihen-Generator:** Ein Block aus Reihen × Stühlen ist **ein** Objekt (`chair_row_group`).
- **Bereiche:** Halbtransparente Flächen mit Name und Maßen (`area`).
- **NivTec-Import:** Bühnen aus dem NivTec-Tool (`beeeeenio/whu-event-NivTec`) importieren, inklusive **Forex-Blenden** mit Druck.
- **Phasen-Timeline:**
  - Position und Sichtbarkeit je Phase.
  - Objekte lassen sich als eigenständige Kopie in folgende Phasen übernehmen.
  - Vergleich mit der Vorphase.
- **Farben:** Jedes Objekt außer Text-Label bekommt eine Farbe, in 2D und 3D.
- **3D-Ansicht:**
  - Halle mit Wänden, Türen, Glasfassade, Säulen, Bühne und Hauptvorhang (auf/zu).
  - Trennwände, Schatten und obere Wände lassen sich ein- und ausschalten.
  - Die letzte Kameraposition wird gemerkt.
  - Alle Objekte als richtige Modelle.
  - Bereiche (`area`) tragen ihren Namen flach auf dem Boden (Textur in `models3d/misc.ts`).
- **2D-Bedienung:**
  - Drehen um die Mitte.
  - Einrasten an Raster und Objekten mit Hilfslinien und Abständen.
  - Mehrfachauswahl, Ausrichten und Verteilen.
  - Trackpad- und Touch-Gesten.
  - Tastenkürzel (`?` im Editor zeigt sie).
- **Stückliste und Export:**
  - Zählung aller Objekte, Stühle, Podeste, Vorhang-Meter, Visiova-Rahmen, Forex-Blenden und Buchstaben je Zeichen.
  - Export als CSV, PNG, PDF und als Projekt-ZIP (wieder importierbar).
- **Projekte, Vorlagen und Versionen:**
  - Auf `main` im Browser (localStorage).
  - Auf `backend-pocketbase` auf dem Server, mit Login, Freigaben und Konflikterkennung.
- **Hintergrundpläne:** Strom- und Rigging-Plan. Die Steckdosen-Codes lassen sich ausblenden.

---

## 3. Tech-Stack

| Bereich | Bibliothek |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS 4 |
| Build | Vite 8, `tsc -b` |
| 2D | Konva 10 / react-konva 19 |
| 3D | three.js (OrbitControls, TextGeometry) |
| State | Zustand 5 |
| Export | jsPDF, JSZip |
| Lint | oxlint (`.oxlintrc.json` auf dem Backend-Branch) |
| Backend (nur `backend-pocketbase`) | PocketBase (SQLite), JS-SDK `pocketbase` |

Es gibt keine Unit-Tests. Abgesichert wird über `tsc`, Lint, Build und Browser-Tests mit Playwright ([Abschnitt 16](#16-testen-im-browser-playwright)).

---

## 4. Lokal starten und prüfen

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm run lint     # oxlint
npm run preview  # gebautes dist/ ansehen (Port 4173)
```

Auf `backend-pocketbase` braucht der Dev-Server zusätzlich ein laufendes PocketBase. Vite leitet `/api` und `/_` an `PB_URL` weiter, Standard ist `http://127.0.0.1:8090` (`vite.config.ts`). Wie man PocketBase lokal startet, steht in `server/README.md` unter „Lokal entwickeln“. Für reine Frontend-Arbeit reicht `main`.

---

## 5. Branches, Deployment und Live-Gang

| Branch | Inhalt | Wohin |
|---|---|---|
| `main` | Frontend, speichert im Browser | GitHub Pages (`.github/workflows/deploy.yml`) |
| `backend-pocketbase` | `main` + Login/Sync + `server/` | **Live-Server** per rsync (`.github/workflows/deploy-server.yml`) |
| `claude/...` | Arbeitsbranches von Agenten | – |

**Live-Server:** PocketBase auf einem eigenen Server liefert App und API unter derselben Adresse aus (`stadthalle.whu-event.de`). Die Action `deploy-server.yml` baut bei jedem Push auf `backend-pocketbase` und lädt `dist/` per rsync nach `/opt/stadthalle/pb_public/`. Dafür nutzt sie einen eingeschränkten Deploy-Schlüssel, Secret `DEPLOY_SSH_KEY`. Details stehen in `docs/server-autodeploy.md`, das nur auf dem Backend-Branch liegt.

**Ablauf, um eine Änderung live zu bringen:**

1. Auf einem Arbeitsbranch auf Basis von `main` entwickeln, prüfen (tsc, lint, build) und committen.
2. Einen PR nach `main` öffnen und mergen.
3. `main` in `backend-pocketbase` mergen, bauen und pushen:
   ```bash
   git fetch origin main backend-pocketbase
   git checkout -B backend-pocketbase origin/backend-pocketbase
   git merge --no-edit origin/main
   npm run build            # muss grün sein
   git push origin backend-pocketbase
   ```
4. Den Lauf „Deploy to Stadthalle server“ in GitHub Actions abwarten (ca. 30 s). Danach ist die Änderung live.

**Merge-Konflikte** gibt es typischerweise in `src/App.tsx`, `src/utils/projectStorage.ts`, `src/store/projectsStore.ts`, `src/utils/exportProject.ts` und `importProject.ts`. Diese Dateien hat der Backend-Branch für den Server-Sync umgebaut. In der Regel gilt dort die **Backend-Seite** (`git checkout --ours`). Danach prüfen, ob neue Funktionen von `main` noch angebunden sind.

---

## 6. Projektstruktur

```
src/
  App.tsx                  Einstieg: Projektübersicht ↔ Editor, Autosave (Backend: Login + Sync)
  main.tsx, index.css
  types/index.ts           Alle zentralen Typen (EventItem, PhaseData, ItemType, NivtecData, ForexPanel …)
  store/
    store.ts               Zustand-Store des geöffneten Projekts: Objekte, Phasen, Undo/Redo, alle Aktionen
    projectsStore.ts       Projektliste, aktuelles Projekt
  data/
    itemLibrary.ts         Objektbibliothek (Typ, Name, Standardmaß, Icon, Kategorie)
    venue3d.ts             Halle für 3D: Wände, Türen, Glas, Trennwände, Bühne, Vorhang, Säulen (in Plan-Pixeln)
    rigging.ts             Rigging-Punkte
  components/
    EditorView.tsx         Editor-Rahmen: Tastatur, Bibliotheks-Drag, Panels, Leisten, 3D-Overlay
    CanvasEditor.tsx       Konva-Stage: Zoom/Pan/Gesten, Layer, Auswahlrechteck, Ziehen + Einrasten + Hilfslinien, Messen, Bereich
    EventItemShape.tsx     Ein Objekt in 2D (Form je Typ, Drehgriff, Visiova-Griff, Hover)
    SelectionControls.tsx  Eigenschaften-Panel (Name, Farbe, Drehung, Typ-Felder) + Mehrfachauswahl-Leiste
    FloatingToolbar.tsx    Untere Werkzeugleiste (Auswahl, Bereich, Messen, Objekte, Reihen, NivTec, Text, Zoom, 3D …)
    ObjectPicker.tsx       Objektbibliothek (antippen/ziehen)
    CommandBar.tsx         ⌘K-Befehlsleiste („20 Stehtische“, Phase wechseln …), Parser: utils/commandParser.ts
    PhaseTimeline.tsx      Phasenleiste unten
    InventoryPanel.tsx     Stückliste
    ChairRowGenerator.tsx, ColorPickerDialog.tsx, ExportImportDialog.tsx, PresentationMode.tsx,
    ProjectsDashboard.tsx, TemplatesMenu.tsx, VersionsMenu.tsx, Toolbar.tsx
    useNivtecImport.tsx    NivTec-Datei einlesen
    Venue3D.tsx            3D-Ansicht (Szene, Halle, Kamera, Buttons, Objekte → models3d)
    nivtec3d.ts            3D-Modell NivTec-Bühne inkl. Forex-Blenden
    models3d/              3D-Modelle je Objekttyp (siehe Abschnitt 11)
  utils/
    scale.ts               Maßstab (20 px/m) und Umrechnung
    geometry.ts            Bounding-Boxen, Mittelpunkt, Drehen um die Mitte, Winkel-Raster
    snapping.ts            Raster- und Objekt-Einrasten, Hilfslinien, Abstände
    viewport.ts            Zoom-Stufen, Mausrad/Trackpad-Interpretation
    placement.ts           Platzieren/Reihen
    countItems.ts          Zählung für Stückliste/PDF
    itemColors.ts          Standardfarbe je Typ (2D und 3D)
    visiova.ts             Visiova-Breiten, Wand in Rahmen aufteilen, Beschriftung
    forex.ts               Forex-Kanten an NivTec-Podesten
    foamLetters.ts         Styropor-Buchstaben: Breiten, Positionen
    printImage.ts          Druckbilder verkleinern und auf mehrere Rahmen verteilen
    exportImage.ts, exportInventory.ts, pdfExport.ts, exportProject.ts, importProject.ts, zipHelper.ts
    projectStorage.ts, templateStorage.ts   Speichern (main: localStorage)
    phaseDiff.ts           Vergleich zwischen Phasen, Phasen sortieren
    ui.ts                  Gemeinsame Tailwind-Klassen (btn, input, island …)
public/plans/              Hallenpläne (power-plan-simple.png = Standard-Hintergrund, 1755×1240 px)
docs/                      Pläne und Auswertungen (siehe Abschnitt 18)
server/                    (nur backend-pocketbase) PocketBase-Hooks, Migrationen, Install-Skript, Caddy, systemd
src/backend/               (nur backend-pocketbase) pb.ts, api.ts, projectSync.ts, legacyImport.ts
```

---

## 7. Koordinaten und Maßstab

- **2D-Editor:** `DEFAULT_PIXELS_PER_METER = 20` (`src/utils/scale.ts`), 1 m = 20 px. Alle `phaseData.x/y` sind in diesen Pixeln gespeichert. Breite und Tiefe eines Objekts (`width`, `height`) sind in **Metern**.
- **Hallenplan-Bild:** `power-plan-simple.png` hat 1755 × 1240 px bei **23,6 px/m** (`POWER_PLAN_NATIVE_PIXELS_PER_METER`). Alle Hallendaten in `src/data/venue3d.ts` (Wände, Türen, Bühne …) sind in **diesen Bild-Pixeln** angegeben.
- **3D:** Einheit Meter.
  - x zeigt nach rechts, y nach oben, z entspricht der Plan-y-Richtung (im Plan nach unten).
  - Objekt-Position in 3D: `x = pd.x / 20`, `z = pd.y / 20`.
  - Drehung: `rotation.y = -rotation° · π/180`, positiv heißt im Plan im Uhrzeigersinn.
- **Drehung:** `phaseData.rotation` in Grad im Uhrzeigersinn, um den Ursprung (siehe x/y-Konvention in Abschnitt 1). Die Mitte bleibt erhalten, weil `positionForRotation` x/y anpasst.

---

## 8. Datenmodell

Alles Wichtige steht in `src/types/index.ts`.

```ts
EventItem {
  id, type: ItemType, label,
  width, height,                 // Meter (height = Tiefe im Plan)
  phaseData: Record<phaseId, PhaseData>,   // je Phase: x, y (px), rotation (°), visible
  color?,                        // Objektfarbe (2D + 3D)
  seats?, note?, locked?,
  grid?,                         // chair_row_group: rows, cols, spacingM
  nivtecData?, forexPrints?,     // nivtec_group
  visiovaFrames?, frameHeight?, printImage?,   // visiova_frame
  letterText?,                   // foam_letters
}
```

- Ein Objekt existiert in einer Phase, wenn es in `phaseData[phaseId]` vorkommt, und ist dort sichtbar, wenn `visible` gesetzt ist.
- Ein gespeichertes Projekt (`ProjectData` in `projectStorage.ts`) enthält `eventName`, `currentPhaseId`, `phases`, `items`, `itemOrder` und `layers`.
- Bilder (Visiova-Drucke, Forex-Drucke) werden als **verkleinerte JPEG-Data-URLs** im Objekt gespeichert (`printImage.ts`). Sie sollen klein bleiben, weil localStorage begrenzt ist.

---

## 9. Store und Undo

`src/store/store.ts` (Zustand) enthält alle Aktionen:
- Hinzufügen, Verschieben, Drehen, Duplizieren, Kopieren/Einfügen, Ausrichten, Verteilen
- Farbe, Name, Visiova, Forex, Buchstaben
- Phasen

**Regeln:**

1. **Undo:**
   - Jede verändernde Aktion ruft vorher `pushHistory()` auf. Das ergibt einen Undo-Schritt, maximal 50.
   - Phasen-Änderungen nutzen `pushProjectHistory()`.
   - Ohne tatsächliche Änderung wird **kein** Undo-Schritt angelegt.
   - Eine Geste ergibt einen Schritt, zum Beispiel ein ganzes Ziehen. Pfeiltasten werden zusammengefasst.
2. **Eigenschaften ändern:** Name, Größe, Farbe, Druck, Buchstaben usw. immer über `patchItemInCurrentPhase(state, itemId, patch)` ändern. Ist das Objekt auch in anderen Phasen sichtbar, wird es dabei aufgeteilt: Die aktuelle Phase bekommt die Änderung, die anderen Phasen behalten eine Kopie. Neue Felder müssen in den `Pick<…>`-Typ dieses Helfers aufgenommen werden.
3. **Laden:** `hydrate` bzw. `importProject` laden einen kompletten Stand. Dort sitzen Normalisierungen für alte Daten.

---

## 10. 2D-Editor

**Layer (`CanvasEditor.tsx`):** Es gibt genau drei Konva-Layer: Hintergrund, Objekte und Overlay.
- Der Hintergrund enthält Plan und Gitter. Das Gitter ist eine einzige `Shape`.
- Das Overlay enthält Hilfslinien, Messen und Auswahlrechteck.
- Mehr Layer nur mit gutem Grund, Konva warnt ab 5.

**Ziehen:**
- Konva-Drag des angefassten Objekts.
- Die übrigen ausgewählten Objekte werden in `dragmove` **imperativ** mitbewegt.
- Einrasten (`snapping.ts`) und Hilfslinien laufen während des Ziehens.
- Der Store wird erst bei `dragend` geschrieben (ein Undo-Schritt).
- Shift sperrt die Achse, ⌘/Strg schaltet das Einrasten ab.

**Drehen:** Der eigene Drehgriff in `EventItemShape.tsx` dreht die Node imperativ und committet beim Loslassen. Der Griff rastet bei 90° ein, mit Shift in 15°-Schritten.

**Performance:**
- `EventItemShape` ist mit `memo` umhüllt, Callbacks sind stabil.
- Nicht ausgewählte Objekte bekommen einen quantisierten Zoom (Zoom-Bucket), damit nicht jeder Rad-Tick alles neu rendert.
- Stuhlreihen sind eine einzige `Shape`.
- Bei reinen Deko-Nodes `listening={false}` und `perfectDrawEnabled={false}` setzen.

**Eingabe:**
- Mausrad zoomt.
- Trackpad: zwei Finger verschieben, Pinch zoomt (`ctrlKey`).
- Touch: Pinch und Pan.
- **Auswahl** (V): Ziehen auf leerer Fläche zeichnet einen Rahmen und wählt alles darin aus (⇧ ergänzt die Auswahl). Die Auswahl lässt sich gemeinsam ziehen oder mit Entf löschen.
- **Hand** (H), Leertaste + Ziehen, mittlere Maustaste oder zwei Finger auf dem Trackpad verschieben die Ansicht. Beim Hand-Werkzeug reagieren Objekte nicht. Cursor: Hand beim Verschieben. Neben dem „?“ steht ein Hinweis zum aktuellen Werkzeug.
- **Befehlszeile** (⌘K, `CommandBar.tsx`): Jede Funktion der Oberfläche ist dort auffindbar, auch Ebenen (Strom, Bühnenzüge …), Geschoss, Raster, Auswahl-Aktionen, Phasen, Versionen/Vorlagen und Exporte. Neue Funktionen bitte dort mit eintragen (`keywords` für Suchwörter). Die Kopfleisten-Menüs öffnen über `utils/uiEvents.ts`.
- **Ebenen-Knopf** in der Werkzeugleiste (`LayersMenu` in `FloatingToolbar.tsx`): Grundriss, vereinfachter Plan, Steckdosen-Codes, Strom/CEE, Bühnenzüge. Gemeinsame Schalter-Bausteine liegen in `components/controls.tsx`.
- Die Auswahl passiert schon beim Drücken (`pointerdown`).

**Tastenkürzel** (`EditorView.tsx`):

| Kürzel | Funktion |
|---|---|
| ⌘K, / | Befehlsleiste |
| V, M, B | Werkzeug wechseln |
| O | Objektbibliothek |
| R, ⇧R | Drehen |
| ⌘D | Duplizieren |
| ⌘C, ⌘V | Kopieren, Einfügen |
| ⌘A | Alles auswählen |
| Pfeiltasten | Verschieben (10 cm, mit ⇧ 1 m bzw. ein Rasterschritt) |
| Entf | Löschen |
| ⌘Z, ⌘⇧Z, Strg+Y | Rückgängig, Wiederholen |
| + − 0 | Zoomen |
| ? | Hilfe |

Plan und Hintergrund der Überarbeitung stehen in `docs/plan-2d-ueberarbeitung.md`, mit manueller Prüfliste am Ende.

---

## 11. 3D-Ansicht

`src/components/Venue3D.tsx` wird per `React.lazy` geladen, wenn man in der Werkzeugleiste auf „3D“ klickt.

- **Halle:** `buildVenue()` baut die Halle aus `src/data/venue3d.ts`:
  - Wände mit Türöffnungen (`WALL_SEGMENTS_PX`, `DOORS_PX`)
  - Glasfassaden, Säulen, Bühne (`STAGE_PX`, 0,9 m hoch)
  - Hauptvorhang mit `buildCurtain(open)` und Trennwände mit `buildPartitions()`
  - Holzverkleidung unten (3,8 m), weiße obere Wände in einer eigenen Gruppe `upperWalls`, die sich ausschalten lässt
  - Alle Maße sind Schätzungen aus Plänen und Fotos, siehe `docs/auswertung-stadthalle-bilder.md`.
- **Objekte:** Jedes Objekt wird mit `buildItem(item, phaseData)` gebaut.
  - Farbe: `item.color`, sonst `DEFAULT_3D_COLOR` (Stühle schwarz, Vorhang rot), sonst `getDefaultColor`.
  - `visiova_frame` und `nivtec_group` behandelt `Venue3D` selbst.
  - Alle anderen Typen bauen die Funktionen aus `MODELS[item.type]` in `src/components/models3d/index.ts`.
  - Steht die Mitte eines Objekts auf der festen Bühne, wird es auf Bühnenhöhe gestellt (`isOnStage`). Traversen sind davon ausgenommen.
- **Modelle (`models3d/`):** Je Gruppe gibt es eine Datei:
  - `tables.ts`, `lounge.ts`, `barStage.ts`, `textiles.ts`, `riggingDeco.ts`, `misc.ts`, `chairs.ts` (InstancedMesh), `letters.ts`
  - Ein Modell ist ein `ModelBuilder = (item, color) => THREE.Group` im lokalen Koordinatensystem: Ursprung wie in 2D (Ecke bzw. Mitte bei runden), y = 0 ist der Boden.
  - Gemeinsame Bausteine liegen in `common.ts`: `mat()` mit Material-Cache je Farbe/Oberfläche, `box`, `cylinder`, `rod`, `drape`, `shade` …
  - **Geometrien und Materialien sind geteilt, nie `dispose()` darauf aufrufen.** Nur die Instanz-Puffer der InstancedMeshes werden beim Neuaufbau freigegeben.
  - Hintergrund zum Entwurf: `docs/plan-objekte-3d.md`.
- **Kamera:** Die Kamera hat zwei Ansichten, „Übersicht“ und „Augenhöhe“. Die letzte Ansicht wird in localStorage gemerkt (`stadthalle-3d-view`).

---

## 12. Besondere Objekte

- **Visiova V55** (`visiova_frame`, `utils/visiova.ts`):
  - Eine Wand ist **ein** Objekt mit `visiovaFrames` (Breiten der Rahmen).
  - Man verlängert sie mit dem blauen Griff in 2D. `splitVisiovaRun` teilt sie in Standardbreiten auf.
  - Ein Druck läuft über alle Rahmen. Ohne Druck ist der Rahmen offen.
  - Maße und Daten stammen von visiova.de.
- **Pipe & Drape** (`pipe_drape`, `utils/pipeDrape.ts`):
  - Beliebig lang: blauer Griff am rechten Ende in 2D oder Feld „Länge (m)“ im Eigenschaften-Panel (10-cm-Raster, mindestens 0,5 m). Store-Aktion `setItemLength`.
  - Die Standard-Bezeichnung („Pipe & Drape (3x0,2m)“) zieht mit der Länge mit, eigene Namen bleiben. Das 3D-Modell setzt alle 3 m einen Pfosten.
- **NivTec-Bühne** (`nivtec_group`):
  - Import aus dem NivTec-Tool. Gemeinsames Format: `docs/plan-forex.md`, Abschnitt „Gemeinsame Schnittstelle“.
  - Forex-Blenden (`nivtecData.forexPanels`) hängen nur an freien Außenkanten (`utils/forex.ts`). Drucke liegen in `forexPrints`.
  - Die Objektfarbe ist der Molton.
- **Stuhlreihen** (`chair_row_group`): `grid = { rows, cols, spacingM, rowSpacingM }`. Die Stückliste zählt `rows × cols` Stühle.
  - Stuhlabstand 0,50 m, Reihenabstand 0,85 m (`CHAIR_PITCH_M`, `CHAIR_ROW_PITCH_M` in `store.ts`, aus den Bestuhlungsplänen der Stadthalle gemessen).
  - Alte Stände ohne `rowSpacingM` (Abstand 0,55 m in beide Richtungen) werden beim Laden angehoben (`normalizeChairGroups`), die Gruppe wird dabei größer.
- **Geschosse** (`item.level`, `src/utils/levels.ts`, `src/data/venueOG.ts`):
  - `'eg'` oder `'og'`. Fehlt das Feld, gilt EG. Neue Objekte bekommen das Geschoss, das in 2D gerade offen ist (`currentLevel`, nicht im Projekt gespeichert).
  - 2D zeigt je Geschoss nur dessen Objekte, im OG mit `public/plans/og-plan.png` (im selben Rahmen wie der EG-Plan) als Unterlage. 3D hat EG, OG und Beide, das OG liegt auf +3,50 m.
  - **Luftraum** (Saal, Bühne, Foyer: `OG_VOIDS`): Im OG hat er keinen Boden. Der Store lehnt jede Änderung ab, die ein OG-Objekt dorthin setzt (Platzieren, Verschieben, Drehen, Einfügen …), zeigt eine Meldung (`notice`) und setzt über `revision` die Zeichenfläche zurück. Das passiert zentral im `set`-Wrapper in `store.ts`.
  - Die OG-Wände in `venueOG.ts` sind aus den Doppellinien des Werkplans (Blätter 530-503-1/-2, Vektor-PDF) abgeleitet und auf den EG-Rahmen ausgerichtet. Der Westflügel ist wie beim EG-Plan am linken Rand abgeschnitten.
- **Styropor-Buchstaben** (`foam_letters`, `utils/foamLetters.ts`, `models3d/letters.ts`):
  - `letterText` ist der Schriftzug. Ein „H“ ist 0,5 m breit und 1 m hoch, andere Buchstaben haben die Breite der Schrift (helvetiker bold).
  - 2D und 3D nutzen dieselbe Breitentabelle. `width` wird daraus berechnet.
  - Umlaute bekommen ihre Punkte im 3D-Modell selbst.
  - Die Stückliste zählt die Buchstaben je Zeichen.

---

## 13. Neuen Objekttyp hinzufügen (Checkliste)

1. In `src/types/index.ts` `ItemType` um den neuen Typ erweitern. Eigene Felder optional an `EventItem` hängen.
2. In `src/data/itemLibrary.ts` den Eintrag anlegen (Name, Standardmaß in m, Icon, Kategorie).
3. In `src/utils/itemColors.ts` die Standardfarbe eintragen (der `Record<ItemType, …>` erzwingt das).
4. In `src/utils/commandParser.ts` Suchbegriffe für die ⌘K-Leiste ergänzen (optional).
5. In `src/components/EventItemShape.tsx` eine eigene 2D-Form anlegen, falls nötig. Sonst wird ein Rechteck in der Objektfarbe gezeichnet.
6. In `src/components/SelectionControls.tsx` eigene Felder im Eigenschaften-Panel ergänzen. Store-Aktion über `patchItemInCurrentPhase`.
7. In `src/components/models3d/` eine Builder-Funktion schreiben und in `index.ts` eintragen. Ohne Modell erscheint ein 1 m hoher Block.
8. In `src/utils/countItems.ts` und, falls relevant, in `pdfExport.ts` / `InventoryPanel.tsx` eine Sonderzählung ergänzen.
9. tsc, lint und build laufen lassen und das Objekt im Browser in 2D und 3D ansehen.

---

## 14. Backend (PocketBase)

Das Backend gibt es nur auf dem Branch `backend-pocketbase`. Es besteht aus `server/README.md` und `src/backend/`.

- **PocketBase** läuft auf einem eigenen Server als Dienst `stadthalle.service` unter `/opt/stadthalle/`, mit Caddy für HTTPS.
- **Collections:**
  - `projects` mit `data` (kompletter Plan als JSON), `version`, `owner`, `editors`, `viewers`
  - `project_versions`
  - `templates`
  - `users` mit Rollen `superadmin`, `admin` und `user`
- **Speichern** über `src/backend/projectSync.ts`:
  - Gespeichert wird automatisch und verzögert.
  - Konflikterkennung über `version`: Hat jemand anderes inzwischen gespeichert, antwortet der Server mit 409 (`server/pb_hooks/projects.pb.js`).
- **Zugang:** Accounts legen Admins in der App an, eine Selbst-Registrierung gibt es nicht. `OPEN_ACCESS` in `src/backend/pb.ts` muss zu den Server-Migrationen passen.
- **Server-Zugang:** Den Server verwaltet ein Mitbewohner von Benni. Agenten haben **keinen** SSH-Zugang. Das Frontend kommt nur über den Branch und die GitHub Action auf den Server. Server-Änderungen (Hooks, Migrationen) installiert der Admin mit `server/install.sh`.

---

## 15. Konventionen

- **Branding:** Logos in `public/brand/` (schwarz, weiß, quadratisch, Icon), Komponente `BrandLogo`, Favicon `public/favicon.svg` (Drehregler des Logos).
  - Farben als Tokens in `src/index.css`: Schwarz `ink`, Grau `ink2` (#515256 aus dem Logo), Cyan `brand` (#00BCE8). `accent` (#007A99) ist die dunklere Variante für Knöpfe, damit weißer Text lesbar bleibt (Kontrast 4,9:1).
  - Auswahl- und Hilfsfarben im Plan (Konva) sind passend zum Cyan fest eingetragen. Die wählbaren Objektfarben (`store.ts`, `itemColors.ts`) bleiben bewusst unverändert.
  - Das PDF bekommt das Logo über `utils/brandAssets.ts`. Die Anmeldeseite (`LoginView`) liegt nur auf `backend-pocketbase` und muss dort mit `BrandLogo` versehen werden.

- **Code:**
  - Kommentare kurz und auf Deutsch.
  - Bestehende Struktur und Stil beibehalten, keine Massen-Umformatierung.
  - Keine neuen npm-Pakete ohne Grund.
- **UI-Texte:** Deutsch, kurz, Maße mit Komma (`1,50 m`).
- **Styles:** Tailwind-Klassen. Gemeinsame Bausteine stehen in `src/utils/ui.ts` (`btn('primary','sm')`, `input`, `island`).
- **Commits:**
  - Message auf Englisch, erste Zeile im Imperativ, darunter eine kurze Begründung.
  - Kein `dist/`. `node_modules/` und `dist/` stehen in `.gitignore`.
- **Docs:** Größere Vorhaben zuerst als Plan in `docs/plan-*.md` beschreiben, dann umsetzen. Bisher war der Ablauf oft: Plan mit einem starken Modell, Umsetzung mit mehreren kleineren Agenten in Paketen mit getrennten Dateien.
- **Lint-Warnungen:** Die bestehenden Warnungen (React-Regeln `set-state-in-effect`, `refs`) sind bekannt. Keine neuen hinzufügen.

---

## 16. Testen im Browser (Playwright)

Für visuelle Prüfungen von 2D und 3D wird Playwright mit Chromium genutzt. Three.js braucht dafür WebGL über SwiftShader:

```js
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
await p.goto('http://localhost:5173')                 // npm run dev
await p.getByText('+ Neues Projekt').click()
// Store direkt ansprechen (nur im Dev-Server, nicht im Build):
await p.evaluate(async () => {
  const { useEventStore } = await import('/src/store/store.ts')
  useEventStore.getState().addItem('table_round', 30 * 20, 18 * 20)   // x/y in px (20 px/m)
  localStorage.setItem('stadthalle-3d-view', JSON.stringify({ position: [35, 11, 37], target: [35, 0, 22] }))
})
await p.getByRole('button', { name: '3D', exact: true }).click()
await p.waitForTimeout(6000)
await p.screenshot({ path: '3d.png' })
```

**Tipps:**
- Die Konva-Stage ist im Browser als `window.Konva.stages[0]` erreichbar. Plan-Koordinaten rechnet man mit `stage.getAbsoluteTransform().point({x, y})` in Bildschirmkoordinaten um.
- Nach vielen HMR-Updates kann `import('/src/store/store.ts')` eine **andere** Store-Instanz liefern als die App. Dann den Dev-Server neu starten.
- Die Bühne liegt etwa bei x 16–24 m und z 12–30 m, der große Saal rechts davon bei etwa x 24–55 m.

---

## 17. Bekannte Fallstricke

- **Datenformat:** Bei Rechtecken ist x/y die linke obere Ecke, bei runden Objekten die Mitte. Wer das ändert, bricht 3D, PDF und alle gespeicherten Projekte.
- **Phasen:** Direktes `set({ items: … })` an einem Objekt, das in mehreren Phasen sichtbar ist, ändert **alle** Phasen. Das ist fast nie gewollt, deshalb `patchItemInCurrentPhase` nutzen.
- **Formularfelder:** Felder, deren lokaler State aus dem Objekt kommt, brauchen einen `key` mit Objekt-ID und Wert. Sonst übernehmen sie beim Objektwechsel den alten Wert. Siehe `LabelField` und `FoamLetterField` in `SelectionControls.tsx`.
- **localStorage:** Auf `main` ist der Speicher begrenzt (ca. 5 MB). Druckbilder deshalb immer über `downscaleImage` bzw. `slicePrint` verkleinern.
- **Three.js:** Nicht im 2D-Code importieren, sonst landet es im Haupt-Chunk.
- **Server-Merge:** Siehe [Abschnitt 5](#5-branches-deployment-und-live-gang). In `App.tsx` und `projectStorage.ts` gewinnt beim Merge die Backend-Seite.

---

## 18. Weitere Dokumente

| Datei | Inhalt |
|---|---|
| `docs/plan-3d.md` | Ursprünglicher Plan der 3D-Ansicht |
| `docs/auswertung-stadthalle-bilder.md` | Was aus Fotos und Bauplänen der Stadthalle abgelesen wurde (Höhen, Türen, Trennwände) |
| `docs/stadthalle-bilder/` | Fotos der Pläne |
| `docs/plan-objekte-3d.md` | Plan der 3D-Objektmodelle (models3d) |
| `docs/plan-forex.md`, `docs/forex-entwurf.png` | Forex-Blenden und gemeinsames Format mit dem NivTec-Tool |
| `docs/plan-2d-ueberarbeitung.md` | Recherche und Plan zur 2D-Bedienung inkl. Prüfliste |
| `server/README.md` *(backend)* | PocketBase installieren, Datenmodell, lokal entwickeln |
| `docs/server-autodeploy.md` *(backend)* | Automatisches Ausrollen per GitHub Action |
| `docs/live-schalten.md` *(backend)* | Was zum Live-Gang auf dem Server nötig war |

Verwandtes Repository: `beeeeenio/whu-event-NivTec` (Tool zum Bauen von NivTec-Bühnen, Export → Import hier).

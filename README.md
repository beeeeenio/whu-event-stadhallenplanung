# WHU Event – Stadthallenplanung

Browserbasierte Web-App zur maßstabsgetreuen Planung von Events in der Stadthalle. Objekte werden in Metern auf einem Hallenplan platziert, und der Aufbau lässt sich über mehrere Phasen (z. B. Aufbau, Event, Abbau) planen.

## Funktionen

- **Objektbibliothek:** Tische (rund, eckig, Stehtisch), Stühle, Bars, Traversen, Vorhänge, Podeste, Messestände, Sofas, Sessel, Garderoben, Pflanzen, Leinwände, Textlabels sowie eigene Objekte mit frei wählbarem Namen, Maß, Form und Farbe
- **Stuhlreihen-Generator** zum schnellen Anlegen von Bestuhlung
- **NivTec-Import** für Podest- und Bühnenelemente
- **Phasen-Timeline:** Position und Sichtbarkeit jedes Objekts pro Phase, inklusive Vergleich zwischen den Phasen
- **Inventar:** automatische Zählung aller Objekte
- **Export:** Inventarliste, Bild, PDF sowie das komplette Projekt als ZIP (wieder importierbar)
- **Projekte, Vorlagen und Versionen** werden lokal im Browser gespeichert
- **Editor-Werkzeuge:** Raster und Einrasten (Snapping), Zoom, Messwerkzeug, Befehlsleiste, Präsentationsmodus
- **Hintergrundpläne:** Strom- und Rigging-Plan unterlegbar; Steckdosen-Codes lassen sich ausblenden

## Tech-Stack

React 19, TypeScript, Vite, Konva / react-konva, Zustand, Tailwind CSS 4, jsPDF, JSZip

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Produktions-Build
npm run lint     # Linting mit oxlint
npm run preview  # Build lokal ansehen
```

## Projektstruktur

```
src/
  components/   UI und Editor (CanvasEditor, EditorView, Panels, Dialoge)
  store/        Zustand-Stores (Editor-Zustand, Projekte)
  data/         Objektbibliothek und Rigging-Daten
  utils/        Export/Import, Snapping, Platzierung, Speicherung
  types/        Gemeinsame TypeScript-Typen
public/plans/   Hintergrundpläne (Strom, Overlay)
```

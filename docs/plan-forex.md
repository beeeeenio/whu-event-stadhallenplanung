# Plan: Forex-Blenden an NivTec-Bühnen

Ziel: An die Außenkanten einer NivTec-Bühne (vor allem vorne) lassen sich **bedruckte Forex-Platten** anbringen. Sie werden in der Stadthallenplanung in 2D und 3D angezeigt. Das NivTec-Tool legt fest, wo die Platten hängen, und liefert sie im Export mit.

Entwurf: `docs/forex-entwurf.png`. Er zeigt eine Bühne von 6 × 3 m auf 60 cm Höhe mit drei Forex-Platten à 2 m vorne. Ein Druck läuft über alle drei Platten, an den Seiten hängt Molton.

## Annahmen (bitte bestätigen)

- **Material:** Forex (PVC-Hartschaum), **5 mm** stark, einseitig bedruckt.
- **Höhe:** Die Platten reichen vom Boden bis knapp unter die Bühnenkante, also Bühnenhöhe minus ca. 1 cm.
- **Breite:** Normalerweise **eine Platte je Podest-Kante**, also 1 oder 2 m. Ein Druck kann über mehrere Platten laufen, wie bei Visiova.
- **Befestigung:** Klett oder Clips am Rahmen. Optisch spielt das keine Rolle, in der Materialliste wird es nur mitgezählt.
- **Andere Kanten:** Wo keine Forex-Platte hängt, bleibt der Molton in der Objektfarbe.

## Gemeinsame Schnittstelle der beiden Tools

Der „Mod“ ist eine **gemeinsame Datenschnittstelle**: Beide Tools lesen und schreiben dasselbe Format. Das NivTec-Tool exportiert bisher `KastenbuehneSavedState = { heightCm, pieces }`. Neu kommt ein **optionales** Feld dazu. Alte Dateien bleiben damit gültig, und ältere Versionen der Tools ignorieren das Feld einfach.

```ts
interface KastenbuehneSavedState {
  heightCm?: number
  pieces: Piece2D[]          // unverändert
  forexPanels?: ForexPanel[] // NEU, optional
}

interface ForexPanel {
  id: string                 // stabil, z. B. "fx-1"
  pieceId: string            // Podest, an dem die Platte hängt (Piece2D.id)
  side: 'top' | 'right' | 'bottom' | 'left' | 'hyp'  // Kante im Plan; 'hyp' = Schräge bei Dreiecken
  thicknessMm?: number       // Standard 5
  printGroup?: string        // gleiche Gruppe = ein Druck läuft über diese Platten
}
```

- **Lage aus Podest und Kante:** Die Lage ergibt sich vollständig aus `pieceId` und `side`. Breite und Position sind die Kante des Podests, die Höhe ist `heightCm`. Koordinaten müssen nicht doppelt gespeichert werden.
- **Drucke reisen nicht mit:** Die Druckbilder sind **nicht** Teil des NivTec-Exports, weil sie groß sind. Sie werden in der Stadthallenplanung je Platte bzw. je `printGroup` hochgeladen, wie bei Visiova.
- **Zuordnung bleibt stabil:** Wird ein Podest im NivTec-Tool verschoben, wandert die Platte mit. Wird es gelöscht, fällt die Platte beim Import still weg.

## Umsetzung NivTec-Tool (`beeeeenio/whu-event-NivTec`)

1. **Typen und Validierung:**
   - `ForexPanel` in `src/domain/types.ts` ergänzen.
   - In `src/domain/savedState.ts` `forexPanels` prüfen: `pieceId` muss existieren, `side` muss gültig sein. Ungültige Einträge werden verworfen.
2. **Bedienung:**
   - In der Grundriss-Ansicht der Kastenbühne außen an jeder freien Kante ein Schalter „Forex“. Ein Klick fügt die Platte hinzu oder entfernt sie.
   - Zusätzlich „Alle Vorderkanten“ als Schnellaktion.
3. **3D (`AufbauScene3D.tsx`):** Die Platte als 5 mm starke weiße Fläche vor der Kante darstellen, bis knapp unter die Belagoberkante.
4. **Materialliste:** Platten nach Breite zählen (z. B. „Forex 2000 × 590 mm: 3 Stück“) und Höhe angeben.
5. **Tests:** Für `sanitize`, für den Roundtrip Export → Import und für die Materialliste.

## Umsetzung Stadthallenplanung (dieses Repository)

1. **Typen:** `NivtecData` um `forexPanels?: ForexPanel[]` erweitern, im Import (`useNivtecImport.tsx`) übernehmen.
2. **Drucke:** `EventItem.forexPrints?: Record<string, string>`, Schlüssel ist die `ForexPanel.id` oder die `printGroup`. Die Bilder werden verkleinert gespeichert, wie bei Visiova über `src/utils/printImage.ts`.
3. **Eigenschaften-Panel einer NivTec-Bühne:**
   - Liste der Forex-Platten mit „Druck hochladen“ je Platte bzw. je Gruppe.
   - Ein Druck für eine Gruppe wird mit `slicePrint` über ihre Platten verteilt.
   - Forex-Platten auch hier an- und abschaltbar, falls im NivTec-Tool vergessen.
4. **3D (`src/components/nivtec3d.ts`):**
   - Forex-Platten an den gewählten Kanten mit Druck-Textur.
   - Der Molton nur noch an Kanten **ohne** Forex.
5. **2D:** Bedruckte Kanten als farbige Linie an der Bühnenkante, damit man im Plan sieht, wo Forex hängt.
6. **Stückliste:** Forex-Platten mitzählen.

## Reihenfolge

1. Entwurf und Annahmen von dir bestätigen lassen.
2. Format festlegen: genau den Abschnitt „Gemeinsame Schnittstelle“, in beiden Repositories als Doku.
3. Beide Tools parallel umsetzen: NivTec-Tool in einer eigenen Sitzung auf dessen Repository, die Stadthallenplanung hier.
4. Gemeinsamer Test: Bühne im NivTec-Tool bauen, Forex setzen, exportieren, hier importieren, Druck hochladen, 3D prüfen.

## Übergabe an das NivTec-Tool

Text, mit dem die Umsetzung im NivTec-Repository startet, z. B. in einer eigenen Claude-Code-Sitzung:

> Erweitere die Kastenbühne um Forex-Blenden. Halte dich exakt an das Format im Abschnitt „Gemeinsame Schnittstelle“ aus `docs/plan-forex.md` im Repository `beeeeenio/whu-event-stadhallenplanung`. `forexPanels` ist optional, alte Dateien müssen weiter laden. Umfang: Typ und Validierung in `savedState.ts`, Schalter „Forex“ an freien Außenkanten im Grundriss plus „Alle Vorderkanten“, Darstellung in `AufbauScene3D.tsx` als 5 mm weiße Platte bis knapp unter Belag-Oberkante, Zählung in der Materialliste, Tests für sanitize/Roundtrip/Materialliste. Keine Druckbilder im Export.

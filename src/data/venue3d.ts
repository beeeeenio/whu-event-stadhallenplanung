/**
 * Maße, Materialien und Wände der Stadthalle für die 3D-Ansicht.
 * Höhen und Farben sind SCHÄTZUNGEN aus dem virtuellen Rundgang
 * (rundgang.stadthalle-vallendar.de, Bilder 1–5) — bei besseren Angaben hier korrigieren.
 */
export const VENUE = {
  /** Wandhöhe (Saal-Decke ca. 7 m; Türen ~2,5 m als Maßstab). */
  wallHeight: 7,
  /** Wandstärke der nachgezeichneten Wände. */
  wallThickness: 0.3,
  /** Holzvertäfelung im Saal reicht etwa bis hier, darüber weiße Wand. */
  woodPanelHeight: 3.8,
  woodColor: '#e0b77f',
  upperWallColor: '#f3f4f6',
  /** Bühne: Podesthöhe und Hauptvorhang (dunkelrot) in der Bühnenöffnung. */
  /** Lichte Höhe der Türöffnungen. */
  doorHeight: 2.6,
  stageHeight: 0.9,
  stageColor: '#b98350',
  curtainColor: '#7f1d1d',
  curtainHeight: 6,
  background: '#dfe3e8',
} as const

/**
 * Wände als Strecken [x1, y1, x2, y2] in Pixeln des Grundriss-Bilds (1755×1240,
 * 23,6 px/m) — von Hand aus power-plan-simple.png nachgezeichnet, nur die Hauptwände.
 */
export const WALL_SEGMENTS_PX: [number, number, number, number][] = [
  // Großer Saal
  [375, 268, 1372, 268],
  [1368, 268, 1368, 545],
  [1368, 540, 1432, 540],
  [1432, 540, 1432, 690],
  [1365, 615, 1365, 720],
  [275, 720, 1365, 720],
  // Bühne: Rückwand und schräge Portalwände
  [380, 268, 380, 720],
  [562, 275, 545, 365],
  [545, 630, 562, 718],
  // Nebenräume links oben
  [0, 460, 378, 460],
  [233, 465, 233, 850],
  [0, 850, 233, 850],
  [275, 650, 275, 720],
  // Foyer und kleiner Saal rechts unten
  [1432, 720, 1432, 1085],
  [1238, 728, 1238, 1085],
  [1232, 1085, 1432, 1085],
  [515, 1040, 1232, 1040],
  [515, 1040, 515, 1085],
  [0, 1085, 515, 1085],
  [0, 915, 660, 915],
]

/** Bühnenpodest (Rechteck in Plan-Pixeln) und Lage des Hauptvorhangs. */
export const STAGE_PX = { x: 385, y: 290, w: 190, h: 410 }
export const MAIN_CURTAIN_PX: [number, number, number, number] = [572, 365, 572, 630]

/**
 * Türöffnungen als [Mitte x, Mitte y, Breite] in Plan-Pixeln. Liegt eine Öffnung auf einer
 * Wand-Strecke (Abstand < 8 px), wird die Wand dort bis `doorHeight` ausgespart.
 * Aus den Türbögen im Grundriss abgelesen (Positionen ± ca. 0,5 m).
 */
export const DOORS_PX: [number, number, number][] = [
  // Saal → Terrasse (oben)
  [628, 268, 38], [790, 268, 38], [890, 268, 38], [1050, 268, 38], [1310, 268, 38],
  // Saal → Foyer (Doppeltüren)
  [776, 720, 55], [906, 720, 55], [1036, 720, 55], [1166, 720, 55],
  // Bühne hinten
  [380, 491, 40],
  // Nebenräume links
  [233, 664, 20],
  [34, 915, 22], [104, 915, 25], [174, 915, 22],
  // Foyer → draußen (Glastüren unten)
  [805, 1040, 36], [841, 1040, 36], [987, 1040, 37], [1026, 1040, 37], [1169, 1040, 37], [1208, 1040, 37],
]

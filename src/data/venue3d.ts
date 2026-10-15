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
  /** Höhe der Verglasung zur Terrasse (Schätzung, darüber Wand). */
  glassHeight: 3.8,
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
  // Großer Saal (Terrassenseite: massiv nur bis zur Glasfassade und an den Pfeilern, siehe GLASS_SEGMENTS_PX)
  [375, 268, 615, 268],
  [807, 268, 875, 268],
  [1069, 268, 1136, 268],
  [1330, 268, 1372, 268],
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
  [515, 1040, 515, 1085],
  [0, 1085, 515, 1085],
  [0, 915, 675, 915],
  // Raum neben dem Haupteingang (4F4): rechte Wand zum Foyer
  [673, 915, 673, 1040],
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
  // Saal → Terrasse: 6 Einzeltüren in der Glasfassade (Türbögen im Grundriss)
  [631, 268, 32], [788, 268, 32], [894, 268, 32], [1050, 268, 32], [1155, 268, 32], [1312, 268, 32],
  // Saal → Foyer: 4 Doppeltüren (Öffnungen zwischen den Wandscheiben)
  [775, 720, 63], [905, 720, 63], [1037, 720, 63], [1168, 720, 63],
  // Bühne hinten
  [380, 491, 40],
  // Nebenräume links
  [233, 664, 20],
  [34, 915, 22], [104, 915, 25], [174, 915, 22],
  // Raum neben dem Haupteingang (4F4) → Foyer: 2 Doppeltüren
  [551, 915, 66], [625, 915, 64],
  // Foyer ↔ kleiner Saal (Raum 1): 2 Doppeltüren
  [1238, 834, 63], [1238, 964, 64],
  // Foyer-Glasfassade unten: Haupteingang (Windfang, 2 Türen) und 3 Doppeltüren nach draußen
  [553, 1040, 60], [622, 1040, 60], [734, 1040, 63], [916, 1040, 63], [1099, 1040, 63],
]

/**
 * Glasfassaden (Terrasse oben, Foyer unten) (Strecken in Plan-Pixeln): verglast bis `glassHeight`, darüber Wand.
 * Türen aus DOORS_PX werden auch hier ausgespart.
 */
export const GLASS_SEGMENTS_PX: [number, number, number, number][] = [
  [615, 268, 807, 268],
  [875, 268, 1069, 268],
  [1136, 268, 1330, 268],
  // Foyer-Fassade unten (Haupteingang und Ausgänge)
  [515, 1040, 1232, 1040],
]

/**
 * Mobile Trennwände im großen Saal (teilen ihn in drei Teile, laut Werkplan und Fluchtplan).
 * In 3D ein-/ausblendbar, standardmäßig offen (eingefahren).
 */
export const PARTITIONS_PX: [number, number, number, number][] = [
  [842, 275, 842, 716],
  [1102, 275, 1102, 716],
]

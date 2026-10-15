# Plan: Objekte in 3D schön darstellen (models3d)

Ziel: Jeder Objekttyp sieht in der 3D-Ansicht wie das echte Möbel/Bauteil aus (Bankett-Tisch = Tisch mit Tuch, Sofa = Sofa …), bleibt auf einen Blick erkennbar und ist über `item.color` einfärbbar. Mäßig detailliert, performant auch bei mehreren hundert Objekten.

Grundregel Farbe: `item.color` (bzw. Standardfarbe) färbt das **Haupt-Sichtmaterial** (Tischtuch/Platte, Polster, Stoff, Front). Gestelle, Metall, Holz, Belag bleiben **neutral** (`NEUTRAL` in `common.ts`).

Ablauf:
1. **P0 (Hauptagent):** `src/components/models3d/common.ts` wörtlich aus Abschnitt 2 anlegen, `npx tsc -b` grün.
2. **P1–P7 parallel (Haiku-Agents):** jeder legt GENAU EINE Datei an (Tabelle 1.1). Keine anderen Dateien ändern.
3. **P8 (Hauptagent):** `models3d/index.ts`, Einbau in `Venue3D.tsx`, Aufräumen, Build/Lint, Sichtprüfung.

---

## 1. Architektur

### 1.1 Dateien und Zuständigkeit

| Paket | Datei (`src/components/models3d/…`) | Typen | Export-Konstante | Wer |
|---|---|---|---|---|
| P0 | `common.ts` | – (Helfer) | – | Hauptagent, vorab |
| P1 | `tables.ts` | table_round, table_rect, table_high, table_low_round | `TABLE_MODELS` | Haiku |
| P2 | `lounge.ts` | sofa_2, sofa_3, sofa_corner, armchair | `LOUNGE_MODELS` | Haiku |
| P3 | `barStage.ts` | bar, podium, exhibition_stand | `BAR_STAGE_MODELS` | Haiku |
| P4 | `textiles.ts` | curtain, pipe_drape, screen | `TEXTILE_MODELS` | Haiku |
| P5 | `riggingDeco.ts` | truss, coat_rack, plant | `RIGGING_DECO_MODELS` | Haiku |
| P6 | `misc.ts` | area, custom_rect, custom_round | `MISC_MODELS` | Haiku |
| P7 | `chairs.ts` | chair, chair_row_group | `CHAIR_MODELS` | Haiku |
| P8 | `index.ts` + `Venue3D.tsx` | Einbau | `MODELS` | Hauptagent, danach |

Nicht angefasst: `visiova_frame` (bleibt `buildVisiovaFrame` in Venue3D), `nivtec_group` (`nivtec3d.ts`), `text_label` (kein 3D).

### 1.2 Builder-Signatur und Export (verbindlich)

```ts
export function buildXxx(item: EventItem, color: string): THREE.Group
export const XXX_MODELS: ModelMap = { typ_a: buildA, typ_b: buildB }
```
- `color` ist schon aufgelöst (Venue3D: `item.color || DEFAULT_3D_COLOR[type] || getDefaultColor(type)`). Builder rufen **nie** `getDefaultColor` auf.
- Rückgabe: Gruppe im **lokalen** Koordinatensystem des Objekts. Position/Drehung im Saal setzt Venue3D (die äußere Gruppe), nicht der Builder.
- Nicht genutzte Parameter mit `_` beginnen (`noUnusedParameters`).
- Nichts aus `Venue3D.tsx` importieren (Zirkelbezug). Erlaubt: `three`, `../../types`, `./common`, `../../data/venue3d` (nur `VENUE`).

### 1.3 Koordinaten (wie heute in `buildItem`)
- Meter. **x = rechts, y = oben, z = Plan-y** (im 2D-Plan nach unten).
- `w = item.width`, `d = item.height` → **`item.height` ist die Plan-TIEFE, nicht die Höhe!** Höhen sind Konstanten im Paket.
- **Rechteck-Typen:** Grundfläche von (0,0) bis (w,d) in x/z. Das gilt auch für `table_low_round`, `plant`, `coat_rack` (in 2D Rechtecke!) → deren Mitte liegt bei `(w/2, d/2)`.
- **Runde Typen** `table_round`, `table_high`, `custom_round`: um den Ursprung zentriert, Radius `w/2`, `d` ignorieren.
- **`curtain`:** Linie entlang x von 0 bis w bei z = 0 (Stoff mittig auf z = 0), `d` ignorieren.
- **Vorderseite = −z (Plan-Oberkante):** Sitzmöbel schauen nach −z, Lehne an der Kante z = d (wie der bestehende Stuhl). Bar: Gästeseite z = 0. Messestand: offen nach z = 0.
- Boden y = 0. Alles steht auf dem Boden, außer der Traverse (Unterkante 5 m).

### 1.4 Performance-Regeln
- Geometrien **nur über die Helfer** aus `common.ts` (geteilte Einheitsgeometrien, skaliert). Eigene Geometrien nur als **einmal gecachte Modul-Konstante** (Beispiel: P1-Tuchrock, P7-Stuhl).
- Materialien **nur über `mat(farbe, finish)`** (Cache). Kein `new THREE.MeshStandardMaterial` in Paketen. **Keine Texturen.**
- **Nie `dispose()`** auf Geometrien/Materialien (geteilt).
- Kleine Teile (Beine, Haken, Deko, Diagonalen) mit `cast = false` (keine Schatten).
- Mesh-Budget je Objekt siehe Paket. Faustregel ≤ 15, Ausnahmen genannt.
- Segmente: große Rundungen 32–40, Beine/Rohre 6–12.

### 1.5 Höhen (übernommen aus `HEIGHTS` in Venue3D, nicht ändern)
table_round/rect 0,75 · table_high 1,10 · table_low_round 0,45 · chair 0,9 · bar 1,10 · truss Querschnitt 0,3 auf 5 m · curtain `VENUE.woodPanelHeight` (3,8) · pipe_drape 3,0 · podium 1,2 · exhibition_stand 2,5 · Sofas/Sessel 0,8 · coat_rack 1,8 · plant 1,5 · screen 3,0 (Bildunterkante 1,0) · custom 1,0.

---

## 2. `common.ts` (P0, wörtlich übernehmen; Agents ändern diese Datei NICHT)

```ts
import * as THREE from 'three'
import type { EventItem, ItemType } from '../../types'

/**
 * Gemeinsame Bausteine der 3D-Objektmodelle (siehe docs/plan-objekte-3d.md).
 * Einheiten Meter; x = rechts, y = oben, z = Plan-y (im 2D-Plan nach unten).
 * Geometrien und Materialien sind geteilt (Cache) — nie dispose() darauf aufrufen.
 */

/** Baut ein Objekt im lokalen Koordinatensystem (Position/Drehung im Saal setzt Venue3D). */
export type ModelBuilder = (item: EventItem, color: string) => THREE.Group
export type ModelMap = Partial<Record<ItemType, ModelBuilder>>
export type P3 = [number, number, number]

/** Neutrale Farben für Gestelle, Metall, Holz — nicht über die Objektfarbe änderbar. */
export const NEUTRAL = {
  chrome: '#c0c4c8',
  alu: '#cfd2d6',
  steel: '#9ca3af',
  black: '#1f2937',
  anthracite: '#374151',
  white: '#f8fafc',
  wood: '#b08560',
  darkWood: '#5b4433',
  glass: '#dbeafe',
} as const

/** Oberflächen: matt (Lack/Holz), fabric (Stoff, beidseitig), satin (Polster/Kunststoff), metal, chrome, leaf (facettiertes Laub), glass. */
export type Finish = 'matt' | 'fabric' | 'satin' | 'metal' | 'chrome' | 'leaf' | 'glass'

const FINISH: Record<Finish, THREE.MeshStandardMaterialParameters> = {
  matt: { roughness: 0.8, metalness: 0 },
  fabric: { roughness: 1, metalness: 0, side: THREE.DoubleSide },
  satin: { roughness: 0.5, metalness: 0.05 },
  // ohne Environment-Map wirkt hohe Metalness sehr dunkel → moderat
  metal: { roughness: 0.45, metalness: 0.6 },
  chrome: { roughness: 0.3, metalness: 0.85 },
  leaf: { roughness: 0.9, metalness: 0, flatShading: true },
  glass: { roughness: 0.1, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false },
}

const MATERIALS = new Map<string, THREE.MeshStandardMaterial>()

/** Geteiltes Material je Farbe + Oberfläche (+ Deckkraft). Farbe als Hex oder rgb()/rgba(). */
export function mat(color: string, finish: Finish = 'matt', opacity = 1): THREE.MeshStandardMaterial {
  const key = `${color}|${finish}|${opacity}`
  let m = MATERIALS.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, ...FINISH[finish] })
    if (opacity < 1) {
      m.transparent = true
      m.opacity = opacity
      m.depthWrite = false
    }
    MATERIALS.set(key, m)
  }
  return m
}

const WHITE = new THREE.Color('#ffffff')
const BLACK = new THREE.Color('#000000')

/** Farbe aufhellen (amount > 0) bzw. abdunkeln (amount < 0), amount in −1…1. Ergebnis als Hex. */
export function shade(color: string, amount: number): string {
  const c = new THREE.Color(color).lerp(amount > 0 ? WHITE : BLACK, Math.min(Math.abs(amount), 1))
  return `#${c.getHexString()}`
}

// Einheitsgeometrien, per mesh.scale auf Maß gebracht
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_BOX_EDGES = new THREE.EdgesGeometry(UNIT_BOX)
const UNIT_SPHERE = new THREE.SphereGeometry(1, 16, 12)
const UNIT_BLOB = new THREE.IcosahedronGeometry(1, 1)
const CYLINDERS = new Map<string, THREE.CylinderGeometry>()

/** Einheits-Zylinder: Radius unten 1, oben `taper`, Höhe 1, Mitte im Ursprung. */
function unitCylinder(taper: number, segments: number): THREE.CylinderGeometry {
  const key = `${taper.toFixed(3)}|${segments}`
  let g = CYLINDERS.get(key)
  if (!g) {
    g = new THREE.CylinderGeometry(taper, 1, 1, segments)
    CYLINDERS.set(key, g)
  }
  return g
}

/** Schatten-Flags: Hauptteile werfen Schatten, kleine Teile (cast = false) nur empfangen. */
export function shadows<T extends THREE.Mesh>(m: T, cast = true): T {
  m.castShadow = cast
  m.receiveShadow = true
  return m
}

/** Quader w × h × d mit Mittelpunkt (x, y, z). */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_BOX, material)
  m.scale.set(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005))
  m.position.set(x, y, z)
  return shadows(m, cast)
}

/** Kantenlinien eines Quaders (gleiche Parameter wie box), z. B. für schlichte Platzhalter. */
export function boxEdges(w: number, h: number, d: number, x: number, y: number, z: number, color: string): THREE.LineSegments {
  let lm = LINE_MATERIALS.get(color)
  if (!lm) {
    lm = new THREE.LineBasicMaterial({ color })
    LINE_MATERIALS.set(color, lm)
  }
  const l = new THREE.LineSegments(UNIT_BOX_EDGES, lm)
  l.scale.set(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005))
  l.position.set(x, y, z)
  return l
}
const LINE_MATERIALS = new Map<string, THREE.LineBasicMaterial>()

/**
 * Senkrechter Zylinder mit Radius unten `r`, Höhe `h`, Mittelpunkt (x, y, z).
 * `taper` = Radius oben / Radius unten (Kegelstumpf), `segments` Default 24.
 */
export function cylinder(
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  opts: { taper?: number; segments?: number; cast?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(unitCylinder(opts.taper ?? 1, opts.segments ?? 24), material)
  m.scale.set(Math.max(r, 0.002), Math.max(h, 0.005), Math.max(r, 0.002))
  m.position.set(x, y, z)
  return shadows(m, opts.cast ?? true)
}

/** Kugel/Ellipsoid mit Radien rx, ry, rz um (x, y, z); `faceted` = facettierte Form (Laub, Finish 'leaf'). */
export function sphere(rx: number, ry: number, rz: number, x: number, y: number, z: number, material: THREE.Material, faceted = false, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(faceted ? UNIT_BLOB : UNIT_SPHERE, material)
  m.scale.set(rx, ry, rz)
  m.position.set(x, y, z)
  return shadows(m, cast)
}

const UP = new THREE.Vector3(0, 1, 0)

/** Rundstab mit Radius r von Punkt a nach b (Rohre, Diagonalen, Haken, Stangen). */
export function rod(a: P3, b: P3, r: number, material: THREE.Material, cast = false, segments = 8): THREE.Mesh {
  const start = new THREE.Vector3(...a)
  const dir = new THREE.Vector3(...b).sub(start)
  const len = dir.length()
  const m = new THREE.Mesh(unitCylinder(1, segments), material)
  m.scale.set(r, Math.max(len, 0.005), r)
  m.position.copy(start).addScaledVector(dir, 0.5)
  if (len > 0) m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return shadows(m, cast)
}

const DRAPES = new Map<string, THREE.BufferGeometry>()

/** Stoffbahn w × h (Mitte im Ursprung, Fläche in x/y) mit senkrechten Falten in z. */
function drapeGeometry(w: number, h: number, depth: number, fold: number): THREE.BufferGeometry {
  const key = `${w.toFixed(2)}|${h.toFixed(2)}|${depth}|${fold}`
  let g = DRAPES.get(key)
  if (!g) {
    const folds = Math.max(1, Math.round(w / fold))
    const plane = new THREE.PlaneGeometry(w, h, folds * 6, 1)
    const p = plane.attributes.position
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + 0.5) * folds * Math.PI * 2) * depth)
    plane.computeVertexNormals()
    g = plane
    DRAPES.set(key, g)
  }
  return g
}

/**
 * Senkrechte Stoffbahn (Vorhang, Molton, Skirt) w × h mit Mittelpunkt (x, y, z), Fläche parallel zur x-Achse.
 * Falten: Amplitude `depth` (Default 4 cm), eine Falte je `fold` m (Default 0,25). Für Seitenflächen danach
 * `mesh.rotation.y = Math.PI / 2` setzen. Material mit Finish 'fabric' (beidseitig) verwenden.
 */
export function drape(
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  opts: { depth?: number; fold?: number; cast?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(drapeGeometry(Math.max(w, 0.05), Math.max(h, 0.05), opts.depth ?? 0.04, opts.fold ?? 0.25), material)
  m.position.set(x, y, z)
  return shadows(m, opts.cast ?? true)
}

/** Gruppe aus Teilen. */
export function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group()
  if (parts.length) g.add(...parts)
  return g
}
```

Hinweise zur Benutzung:
- `box`/`cylinder`/`sphere`/`drape` bekommen immer den **Mittelpunkt**. Ein Teil von y0 bis y1 hat also `h = y1 - y0` und `y = (y0 + y1) / 2`.
- `cylinder(r, …)`: `r` ist der **untere** Radius, oben `r * taper`. Ist oben der Radius `rTop` gewünscht: `taper: rTop / r`.
- Drehen: Rückgabewert ist ein `THREE.Mesh`, z. B. `const m = box(…); m.rotation.x = 0.12`.

---

## 3. Code-Stil (Beispiel = fertiger Builder aus P1, darf übernommen werden)

```ts
import * as THREE from 'three'
import type { EventItem } from '../../types'
import { cylinder, group, mat, NEUTRAL, type ModelMap } from './common'

/** Lounge-Tisch: Höhe 45 cm (Schätzung). */
const LOW_H = 0.45

/** Niedriger Rundtisch — in 2D ein Rechteck ab (0,0), daher Mitte bei (w/2, d/2). Platte in Objektfarbe. */
export function buildTableLowRound(item: EventItem, color: string): THREE.Group {
  const cx = item.width / 2
  const cz = item.height / 2 // item.height = Plan-Tiefe
  const r = Math.min(item.width, item.height) / 2
  return group(
    cylinder(r, 0.03, cx, LOW_H - 0.015, cz, mat(color, 'satin'), { segments: 32 }),
    cylinder(0.025, LOW_H - 0.05, cx, 0.02 + (LOW_H - 0.05) / 2, cz, mat(NEUTRAL.chrome, 'chrome'), { segments: 12, cast: false }),
    cylinder(r * 0.55, 0.02, cx, 0.01, cz, mat(NEUTRAL.black, 'metal'), { taper: 0.9, cast: false }),
  )
}

export const TABLE_MODELS: ModelMap = {
  table_low_round: buildTableLowRound,
  // …
}
```
Stil: knappe deutsche Kommentare (JSDoc über jeder Funktion/Konstante), benannte Konstanten für Maße oben in der Datei, keine Default-Exports, keine Emojis, 2 Leerzeichen, keine Semikolons (wie die Codebasis).

---

## 4. Pakete

Gemeinsame Abnahme für JEDES Paket (zusätzlich zu den paketspezifischen Punkten):
- [ ] Nur die eigene Datei `src/components/models3d/<datei>.ts` neu angelegt, sonst nichts geändert.
- [ ] `npx tsc -b 2>&1 | grep "models3d/<datei>"` liefert **nichts** (Fehler anderer, gleichzeitig arbeitender Pakete ignorieren).
- [ ] `npx oxlint src/components/models3d/<datei>.ts` ohne Fehler/Warnungen.
- [ ] Export-Konstante enthält genau die Typen des Pakets.
- [ ] Kein `new THREE.MeshStandardMaterial`, keine Texturen, kein `dispose`, keine Geometrie-Erzeugung pro Aufruf (außer über Helfer bzw. einmal gecacht).
- [ ] Alle Teile innerhalb der Grundfläche ±5 cm (Ausnahmen stehen beim Typ).
- [ ] Objektfarbe nur auf den als „Farbe“ markierten Teilen, sonst `NEUTRAL`/feste Farben.
- [ ] Mesh-Budget eingehalten.

Legende in den Tabellen: **Farbe** = `color` (Finish in Klammern), **c±x** = `shade(color, x)`.

### P1 – `tables.ts` (`TABLE_MODELS`)

Konstanten: `TABLE_H = 0.75`, `HIGH_H = 1.1`, `LOW_H = 0.45`.

**table_round** (Bankett rund, Ursprung = Mitte, `R = w/2`): bodenlanges Tafeltuch mit Faltenwurf, Vase in der Mitte. Budget 3.

| Teil | Helfer / Maße | Mitte | Material |
|---|---|---|---|
| Tuch oben | `cylinder(R + 0.02, 0.02, …, {segments: 40})` | (0, 0.75, 0) | Farbe (fabric) |
| Tuch-Behang mit Falten | eigene gecachte Geometrie `skirtGeometry()` (s. u.), `scale.set(R + 0.05, 0.74, R + 0.05)` | (0, 0.375, 0) | Farbe (fabric) |
| Vase | `cylinder(0.06, 0.22, …, {segments: 12, cast: false})` | (0, 0.87, 0) | `mat(NEUTRAL.glass, 'glass')` |

```ts
let skirtGeo: THREE.BufferGeometry | null = null
/** Tuch-Behang (Einheitsgröße: Radius unten 1, oben 0,96, Höhe 1, offen) mit nach unten stärkeren Falten. */
function skirtGeometry(): THREE.BufferGeometry {
  if (skirtGeo) return skirtGeo
  const g = new THREE.CylinderGeometry(0.96, 1, 1, 64, 1, true)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = 1 + 0.03 * Math.sin(Math.atan2(z, x) * 18) * (0.5 - y)
    p.setXYZ(i, x * k, y, z * k)
  }
  g.computeVertexNormals()
  skirtGeo = g
  return g
}
// Verwendung: const skirt = shadows(new THREE.Mesh(skirtGeometry(), mat(color, 'fabric')))
//             skirt.scale.set(R + 0.05, 0.74, R + 0.05); skirt.position.y = 0.375
```

**table_rect** (Bankett eckig, Ursprung oben links, w × d): Tischtuch mit 30 cm Überhang, darunter schwarze Klappbeine sichtbar. Budget 5.

| Teil | Maße | Mitte | Material |
|---|---|---|---|
| Tuch (Platte + Überhang als ein Quader) | `box(w + 0.04, 0.30, d + 0.04)` | (w/2, 0.615, d/2) | Farbe (fabric) |
| 4 Beine | `cylinder(0.018, 0.465, …, {segments: 8, cast: false})` | x ∈ {0.08, w−0.08}, z ∈ {0.08, d−0.08}, y 0.2325 | `mat(NEUTRAL.black, 'metal')` |

Tuch oben bei 0,765 m. Ausnahme Grundfläche: Tuch 2 cm über den Rand.

**table_high** (Stehtisch, Ursprung = Mitte, `R = w/2`, `rf = Math.min(0.3, R * 0.75)`): Stretch-Husse in Sanduhrform. Budget 4.

| Teil | Maße | Mitte (y) | Material |
|---|---|---|---|
| Platte | `cylinder(R, 0.03, …, {segments: 32})` | 1.085 | Farbe (fabric) |
| Husse oben (Trichter) | `cylinder(0.07, 0.30, …, {taper: R / 0.07, segments: 32})` | 0.92 | Farbe (fabric) |
| Bund/Knoten | `cylinder(0.09, 0.05, …, {segments: 16, cast: false})` | 0.77 | c−0.15 (fabric) |
| Husse unten | `cylinder(rf, 0.75, …, {taper: 0.07 / rf, segments: 24})` | 0.375 | Farbe (fabric) |

**table_low_round**: siehe Code-Beispiel in Abschnitt 3 (Mitte (w/2, d/2)!). Budget 3.

Abnahme P1: Runde Tische zentriert im Ursprung, `table_rect` und `table_low_round` ab (0,0). Tischoberkanten 0,76 / 0,765 / 1,10 / 0,45 m.

### P2 – `lounge.ts` (`LOUNGE_MODELS`)

Gemeinsamer, **nicht exportierter** Helfer:
```ts
/** Sofa mit Grundfläche (0,0)–(len, depth), Lehne an z = depth, Sitzrichtung −z. */
function sofa(len: number, depth: number, color: string, armL: boolean, armR: boolean): THREE.Group
```
Konstanten: `ARM = 0.18` (Armlehnenbreite), `BACK = 0.2` (Lehnentiefe), `LEG = 0.08`, `BASE_TOP = 0.30`, `SEAT_TOP = 0.44`, `ARM_TOP = 0.62`, `BACK_TOP = 0.80`.
Materialien: `polster = mat(color, 'fabric')`, `korpus = mat(shade(color, -0.12), 'fabric')`, `fuss = mat(NEUTRAL.black, 'satin')`.
`x0 = armL ? ARM : 0`, `inner = len - x0 - (armR ? ARM : 0)`, `seats = Math.max(1, Math.round(inner / 0.6))`, `cw = inner / seats`.

| Teil | Maße | Mitte | Material |
|---|---|---|---|
| 4 Füße | `box(0.05, LEG, 0.05, …, false)` | x ∈ {0.06, len−0.06}, z ∈ {0.06, depth−0.06}, y LEG/2 | fuss |
| Korpus | `box(len, BASE_TOP − LEG, depth)` | (len/2, (LEG+BASE_TOP)/2, depth/2) | korpus |
| Armlehne links/rechts (falls armL/armR) | `box(ARM, ARM_TOP − BASE_TOP, depth)` | x = ARM/2 bzw. len − ARM/2, y (BASE_TOP+ARM_TOP)/2, z depth/2 | polster |
| Rückenlehne | `box(len, BACK_TOP − BASE_TOP, BACK)` | (len/2, (BASE_TOP+BACK_TOP)/2, depth − BACK/2) | polster |
| Sitzkissen i (0…seats−1) | `box(cw − 0.015, SEAT_TOP − BASE_TOP, depth − BACK − 0.02)` | x = x0 + (i+0.5)·cw, y (BASE_TOP+SEAT_TOP)/2, z 0.01 + (depth−BACK)/2 | polster |
| Rückenkissen i | `box(cw − 0.03, 0.34, 0.12)`, danach `rotation.x = 0.12` (oben nach hinten) | x wie Sitzkissen, y SEAT_TOP + 0.18, z depth − BACK − 0.06 | polster |

Builder:
- **sofa_2, sofa_3, armchair:** `return sofa(w, d, color, true, true)`. Budget sofa_3 ≤ 14, armchair ≤ 10.
- **sofa_corner:** Bei `d >= 1.6` ein L-Sofa mit `D = Math.min(0.9, d / 2)`:
  - Teil A (hinten, volle Breite): `a = sofa(w, D, color, false, true)`, `a.position.z = d - D`
  - Teil B (links, Richtung Plan-oben): `b = sofa(d - D, D, color, true, false)`, `b.rotation.y = -Math.PI / 2`, `b.position.x = D` (lokales x → Plan-z, Lehne landet bei x = 0, Sitzrichtung +x)
  - Ecklehne: `box(BACK, BACK_TOP − BASE_TOP, D, BACK/2, (BASE_TOP+BACK_TOP)/2, d − D/2)` in polster
  - Sonst (`d < 1.6`): `sofa(w, d, color, true, true)`. Budget ≤ 28.

Abnahme P2: Lehne immer an der Plan-Unterkante (z = d) bzw. beim L zusätzlich bei x = 0. Oberkante 0,80 m. Kissenzahl 2 (sofa_2), 3 (sofa_3), 1 (armchair) bei Standardgrößen.

### P3 – `barStage.ts` (`BAR_STAGE_MODELS`)

**bar** (Mobile Theke, w × d, Gästeseite z = 0, `F = Math.min(0.3, d * 0.4)`, `back = d - F - 0.1`). Budget 9.

| Teil | Maße | Mitte | Material |
|---|---|---|---|
| Front-Korpus | `box(w, 1.0, F)` | (w/2, 0.56, 0.08 + F/2) | Farbe (satin) |
| Sockel | `box(w − 0.04, 0.06, F − 0.02, …, false)` | (w/2, 0.03, 0.1 + (F − 0.02)/2) | `NEUTRAL.black` (matt) |
| Thekenplatte | `box(w + 0.04, 0.04, F + 0.12)` | (w/2, 1.08, (F + 0.12)/2) | `NEUTRAL.black` (satin) |
| *nur wenn back > 0.2:* Unterschrank | `box(w − 0.04, 0.84, back)` | (w/2, 0.44, F + 0.09 + back/2) | `NEUTRAL.anthracite` (matt) |
| Arbeitsplatte | `box(w − 0.04, 0.04, back)` | (w/2, 0.88, F + 0.09 + back/2) | `NEUTRAL.steel` (metal) |
| 3 Flaschen | `cylinder(0.035, 0.28, …, {segments: 10, cast: false})` | x ∈ {w/2 − 0.15, w/2, w/2 + 0.15}, y 1.04, z wie Arbeitsplatte | `'#14532d'` (satin) |

Ausnahme Grundfläche: Thekenplatte ±2 cm.

**podium** (Bühnenpodest, `PODIUM_H = 1.2`, Konstante mit Kommentar „aus HEIGHTS übernommen“). Budget 6.

| Teil | Maße | Mitte | Material |
|---|---|---|---|
| Alu-Rahmen | `box(w, 0.08, d)` | (w/2, PODIUM_H − 0.05, d/2) | `NEUTRAL.alu` (metal) |
| Belag | `box(w − 0.04, 0.012, d − 0.04)` | (w/2, PODIUM_H − 0.006, d/2) | `'#2b2724'` (matt) |
| Molton vorn/hinten | `drape(w + 0.06, PODIUM_H − 0.09, w/2, (PODIUM_H − 0.09)/2, z, …, {depth: 0.025, fold: 0.15})`, z = −0.03 bzw. d + 0.03 | | Farbe (fabric) |
| Molton links/rechts | `drape(d + 0.06, …, x, …, d/2, …)` + `rotation.y = Math.PI / 2`, x = −0.03 bzw. w + 0.03 | | Farbe (fabric) |

**exhibition_stand** (Messe-Reihenstand, `H = 2.5`, Rückwand bei z = d, offen nach z = 0). Budget 12.

| Teil | Maße | Mitte | Material |
|---|---|---|---|
| Teppich | `box(w, 0.012, d, …, false)` | (w/2, 0.006, d/2) | `NEUTRAL.anthracite` (fabric) |
| Rückwand | `box(w, H, 0.04)` | (w/2, H/2, d − 0.02) | `NEUTRAL.white` (matt) |
| Seitenwände (2) | `box(0.04, H, d − 0.04)` | x ∈ {0.02, w − 0.02}, y H/2, z (d − 0.04)/2 | `NEUTRAL.white` (matt) |
| Rückwand-Grafik | `box(w − 0.3, H − 0.7, 0.006)` | (w/2, H/2, d − 0.043) | Farbe (satin) |
| Alu-Abschlussprofile vorn (2) | `box(0.05, H − 0.3, 0.05)` | x ∈ {0.025, w − 0.025}, y (H − 0.3)/2, z 0.025 | `NEUTRAL.alu` (metal) |
| Blende (Header) vorn | `box(w, 0.3, 0.04)` | (w/2, H − 0.15, 0.02) | Farbe (satin) |
| *nur wenn d ≥ 1.2:* Theke, `tw = Math.min(1, w * 0.45)` | `box(tw, 0.98, 0.5)` | (w/2, 0.49, 0.45) | Farbe (satin) |
| Thekenplatte | `box(tw + 0.04, 0.03, 0.54)` | (w/2, 0.995, 0.45) | `NEUTRAL.white` (satin) |

Abnahme P3: Bar ist von z = 0 aus als Theke erkennbar. Podest-Oberkante 1,20 m, Molton ringsum. Messestand nach vorn (z = 0) offen.

### P4 – `textiles.ts` (`TEXTILE_MODELS`)

**curtain** (`import { VENUE } from '../../data/venue3d'`, `H = VENUE.woodPanelHeight`, Linie von x = 0 bis w bei z = 0). Budget 2.
- Stoff: `drape(w, H − 0.05, w/2, (H − 0.05)/2, 0, mat(color, 'fabric'), {depth: 0.05, fold: 0.3})`
- Schiene: `box(w, 0.04, 0.06, w/2, H − 0.02, 0, mat(NEUTRAL.alu, 'metal'), false)`
- `item.height` ignorieren. Ausnahme Grundfläche: z ±5 cm (Falten).

**pipe_drape** (`PIPE_H = 3`, `zc = d/2`). Budget 2·n + 2.
- Pfosten: `n = Math.max(2, Math.ceil(w / 3) + 1)`, gleichmäßig von x = 0.03 bis w − 0.03. Je Pfosten `cylinder(0.025, PIPE_H, x, PIPE_H/2, zc, mat(NEUTRAL.alu, 'metal'), {segments: 12})` und Fußplatte `box(0.4, 0.01, 0.4, x, 0.005, zc, mat(NEUTRAL.anthracite, 'metal'), false)`.
- Querstange: `rod([0, PIPE_H − 0.04, zc], [w, PIPE_H − 0.04, zc], 0.015, mat(NEUTRAL.alu, 'metal'))`.
- Stoff: `drape(w − 0.02, PIPE_H − 0.08, w/2, 0.02 + (PIPE_H − 0.08)/2, zc, mat(color, 'fabric'), {depth: 0.04, fold: 0.25})`.
- Ausnahme Grundfläche: Fußplatten 40 × 40 cm.

**screen** (Fast-Fold-Leinwand, `H = 3`, Bildunterkante 1,0 m, `zc = d/2`). Die Bildfläche bleibt immer weiß, die **Objektfarbe färbt Rahmen und Stützen**. Budget 9.

| Teil | Maße | Mitte | Material |
|---|---|---|---|
| Bildfläche | `box(w − 0.08, H − 1.08, 0.01)` | (w/2, 1 + (H − 1)/2, zc) | `NEUTRAL.white` (matt) |
| Rahmen oben/unten | `box(w, 0.04, 0.04)` | y = H − 0.02 bzw. 1.02 | Farbe (satin) |
| Rahmen links/rechts | `box(0.04, H − 1, 0.04)` | x ∈ {0.02, w − 0.02}, y 1 + (H − 1)/2 | Farbe (satin) |
| Stützen (2) | `box(0.04, 1.0, 0.04)` | x ∈ {0.02, w − 0.02}, y 0.5, z zc | Farbe (satin) |
| Füße (2) | `box(0.05, 0.03, 0.8, …, false)` | x wie Stützen, y 0.015, z zc | `NEUTRAL.black` (metal) |

Ausnahme Grundfläche: Füße 80 cm tief.

### P5 – `riggingDeco.ts` (`RIGGING_DECO_MODELS`)

**truss** (4-Punkt-Traverse, `TRUSS_ELEVATION = 5` (Unterkante), `s = Math.min(Math.max(d, 0.2), 0.6)`, `zc = d/2`, `yc = TRUSS_ELEVATION + s/2`, `c = s/2 − 0.024`, `m = mat(color, 'metal')`). Budget ≤ 36 bei 3 m.
- Gurtrohre: Punkte `TF = [yc + c, zc − c]`, `TB = [yc + c, zc + c]`, `BF = [yc − c, zc − c]`, `BB = [yc − c, zc + c]` (je [y, z]). Je Gurt `rod([0, y, z], [w, y, z], 0.024, m, true, 12)`.
- Diagonalen: `n = Math.max(1, Math.round(w / 0.6))`, `L = w / n`. Für jede Fläche `[[TF, TB], [BF, BB], [TF, BF], [TB, BB]]` und i = 0…n−1 im Zickzack: i gerade → von P1 bei x = i·L nach P2 bei x = (i+1)·L, i ungerade → von P2 nach P1. `rod(a, b, 0.008, m, false, 6)`.
- Kettenzüge (nur wenn w ≥ 1.5) bei x ∈ {0.3, w − 0.3}: Motor `box(0.22, 0.3, 0.22, x, TRUSS_ELEVATION + s + 0.9, zc, mat(NEUTRAL.black, 'satin'), false)`, Kette unten `rod([x, TRUSS_ELEVATION + s, zc], [x, TRUSS_ELEVATION + s + 0.75, zc], 0.006, mat(NEUTRAL.black, 'metal'), false, 4)`, Kette oben `rod([x, TRUSS_ELEVATION + s + 1.05, zc], [x, VENUE.wallHeight, zc], …)` (`import { VENUE } from '../../data/venue3d'`).

**coat_rack** (`H = 1.8`, `m = mat(color, 'satin')`). Budget ≤ 12.
- Wenn `Math.max(w, d) < 1.0` → **Garderobenständer**, `cx = w/2`, `cz = d/2`:
  - Säule `cylinder(0.02, H − 0.02, cx, 0.02 + (H − 0.02)/2, cz, m, {segments: 12})`
  - Fußteller `cylinder(Math.min(w, d) * 0.4, 0.02, cx, 0.01, cz, mat(NEUTRAL.black, 'metal'), {segments: 24})`
  - 6 Haken, k = 0…5, `a = k·π/3`: `rod([cx + 0.02·cos a, H − 0.12, cz + 0.02·sin a], [cx + 0.16·cos a, H − 0.02, cz + 0.16·sin a], 0.01, m, false, 6)`
  - Knauf `sphere(0.03, 0.03, 0.03, cx, H + 0.01, cz, m, false, false)`
  - 2 Mäntel `box(0.12, 0.85, 0.36, cx ± 0.2, H − 0.55, cz)` in `mat('#334155', 'fabric')` bzw. `mat('#7c2d12', 'fabric')`
- Sonst → **Garderobenwagen** entlang der längeren Seite. Innere Gruppe mit `L = Math.max(w, d)`, `D = Math.min(w, d)`, Stange entlang x:
  - 2 Steher `rod([x, 0.08, D/2], [x, H − 0.1, D/2], 0.016, m, true)` bei x ∈ {0.05, L − 0.05}
  - Stange `rod([0.05, H − 0.1, D/2], [L − 0.05, H − 0.1, D/2], 0.016, m)`
  - 2 Fußstreben `box(0.04, 0.03, D, x, 0.08, D/2, m)`
  - 4 Rollen `sphere(0.03, 0.03, 0.03, x, 0.03, z, mat(NEUTRAL.black, 'satin'), false, false)` mit z ∈ {0.03, D − 0.03}
  - 3 Mäntel `box(0.1, 0.85, 0.4, L·t, H − 0.55, D/2)` mit t ∈ {0.3, 0.5, 0.7}, Farben wie oben plus `'#1e3a8a'`
  - Wenn `d > w`: `inner.rotation.y = -Math.PI / 2`, `inner.position.x = w`.

**plant** (`H = 1.5`, `cx = w/2`, `cz = d/2`, `R = Math.min(w, d)/2`). Budget 6.

| Teil | Helfer | Mitte | Material |
|---|---|---|---|
| Topf | `cylinder(R·0.55, 0.42, …, {taper: 1.25, segments: 20})` | (cx, 0.21, cz) | `NEUTRAL.anthracite` (satin) |
| Erde | `cylinder(R·0.66, 0.02, …, {segments: 20, cast: false})` | (cx, 0.41, cz) | `'#3f2a1d'` (matt) |
| Stamm | `cylinder(0.025, 0.55, …, {segments: 8, cast: false})` | (cx, 0.695, cz) | `NEUTRAL.darkWood` (matt) |
| Laub 1 | `sphere(R, 0.32, R, …, true)` | (cx, 0.95, cz) | Farbe (leaf) |
| Laub 2 | `sphere(R·0.8, 0.28, R·0.8, …, true)` | (cx + 0.06, 1.18, cz − 0.04) | `shade(color, 0.08)` (leaf) |
| Laub 3 | `sphere(R·0.55, 0.22, R·0.55, …, true)` | (cx − 0.04, 1.33, cz + 0.03) | `shade(color, 0.15)` (leaf) |

Ausnahmen Grundfläche: Laub (bis +10 cm), Traversen-Ketten bis zur Decke, Mäntel.

### P6 – `misc.ts` (`MISC_MODELS`)

**area** (Fläche am Boden, wie 2D gestrichelt umrandet). Budget 5.
- Fläche `box(w, 0.01, d, w/2, 0.006, d/2, mat(color, 'matt', 0.35), false)`
- Rand oben/unten `box(w, 0.02, 0.04, w/2, 0.01, z, mat(color, 'satin'), false)` mit z ∈ {0.02, d − 0.02}
- Rand links/rechts `box(0.04, 0.02, d, x, 0.01, d/2, …, false)` mit x ∈ {0.02, w − 0.02}

**custom_rect** (`H = 1`). Budget 2.
- Körper `box(w, H, d, w/2, H/2, d/2, mat(color, 'satin'))`
- Kanten `boxEdges(w, H, d, w/2, H/2, d/2, shade(color, -0.45))`

**custom_round** (`H = 1`, Ursprung = Mitte, `R = w/2`). Budget 2.
- Körper `cylinder(R, H, 0, H/2, 0, mat(color, 'satin'), {segments: 32})`
- Deckelrand `cylinder(R + 0.005, 0.02, 0, H − 0.01, 0, mat(shade(color, -0.3), 'satin'), {segments: 32, cast: false})`

### P7 – `chairs.ts` (`CHAIR_MODELS`)

Ein Stuhl besteht aus 2 zusammengeführten Geometrien (Polster + Chromgestell). Stuhlreihen werden als `InstancedMesh` gebaut, also 2 Draw-Calls je Reihe statt 6 je Stuhl. Code (so übernehmen):

```ts
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { EventItem } from '../../types'
import { mat, NEUTRAL, shadows, type ModelMap } from './common'

/** Bankettstuhl (ca. 44 × 42 cm, Sitzhöhe 46 cm, Lehne bis ca. 0,92 m); Lehne hinten (+z), Mitte im Ursprung. */
let chairGeo: { cushion: THREE.BufferGeometry; frame: THREE.BufferGeometry } | null = null

/** Kopie einer Grundform, um rotX gekippt (positiv = oben nach hinten) und nach (x, y, z) verschoben. */
function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, rotX = 0): THREE.BufferGeometry {
  const g = geo.clone()
  if (rotX) g.rotateX(rotX)
  return g.translate(x, y, z)
}

function chairGeometry() {
  if (chairGeo) return chairGeo
  const seat = new THREE.BoxGeometry(0.44, 0.06, 0.42)
  const back = new THREE.BoxGeometry(0.42, 0.4, 0.05)
  const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6)
  const post = new THREE.CylinderGeometry(0.011, 0.011, 0.5, 6)
  const legs = [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].map(([x, z]) => placed(leg, x, 0.22, z))
  chairGeo = {
    // Polster: Sitz + leicht nach hinten geneigte Lehne
    cushion: mergeGeometries([placed(seat, 0, 0.46, 0), placed(back, 0, 0.72, 0.2, 0.1)]),
    // Chromgestell: 4 Beine + 2 Lehnenholme
    frame: mergeGeometries([...legs, placed(post, -0.2, 0.68, 0.205, 0.1), placed(post, 0.2, 0.68, 0.205, 0.1)]),
  }
  return chairGeo
}

/** Einzelner Stuhl in der Mitte seiner 2D-Fläche (Rechteck ab (0,0)). Polster in Objektfarbe. */
export function buildChair(item: EventItem, color: string): THREE.Group {
  const { cushion, frame } = chairGeometry()
  const g = new THREE.Group()
  const seat = shadows(new THREE.Mesh(cushion, mat(color, 'satin')))
  const legs = shadows(new THREE.Mesh(frame, mat(NEUTRAL.chrome, 'chrome')))
  seat.position.set(item.width / 2, 0, item.height / 2)
  legs.position.copy(seat.position)
  g.add(seat, legs)
  return g
}

/** Stuhlreihen als zwei InstancedMeshes (Polster + Gestell) — ein Draw-Call je Teil statt je Stuhl. */
export function buildChairRowGroup(item: EventItem, color: string): THREE.Group {
  const g = new THREE.Group()
  const grid = item.grid
  if (!grid || grid.rows * grid.cols === 0) return g
  const { cushion, frame } = chairGeometry()
  const n = grid.rows * grid.cols
  const seats = new THREE.InstancedMesh(cushion, mat(color, 'satin'), n)
  const frames = new THREE.InstancedMesh(frame, mat(NEUTRAL.chrome, 'chrome'), n)
  const m = new THREE.Matrix4()
  let i = 0
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      m.makeTranslation((c + 0.5) * grid.spacingM, 0, (r + 0.5) * grid.spacingM)
      seats.setMatrixAt(i, m)
      frames.setMatrixAt(i, m)
      i++
    }
  }
  for (const inst of [seats, frames]) {
    inst.instanceMatrix.needsUpdate = true
    inst.computeBoundingBox()
    inst.computeBoundingSphere()
    g.add(shadows(inst))
  }
  return g
}

export const CHAIR_MODELS: ModelMap = { chair: buildChair, chair_row_group: buildChairRowGroup }
```
Abnahme P7: Stuhlpositionen identisch zu heute (`(c + 0.5)·spacingM`, `(r + 0.5)·spacingM`), Lehne bei +z, Oberkante ≈ 0,92 m.

---

## 5. Integration (P8, Hauptagent)

1. **Vorab (P0):** `src/components/models3d/common.ts` aus Abschnitt 2 anlegen, `npx tsc -b` grün. Erst danach die Haiku-Agents P1–P7 parallel starten (Prompt-Vorlage in Abschnitt 6).
2. **`models3d/index.ts`:**
   ```ts
   import type { ModelMap } from './common'
   import { TABLE_MODELS } from './tables'
   import { LOUNGE_MODELS } from './lounge'
   import { BAR_STAGE_MODELS } from './barStage'
   import { TEXTILE_MODELS } from './textiles'
   import { RIGGING_DECO_MODELS } from './riggingDeco'
   import { MISC_MODELS } from './misc'
   import { CHAIR_MODELS } from './chairs'

   /** 3D-Modelle je Objekttyp (visiova_frame, nivtec_group und text_label behandelt Venue3D selbst). */
   export const MODELS: ModelMap = { ...TABLE_MODELS, ...LOUNGE_MODELS, ...BAR_STAGE_MODELS, ...TEXTILE_MODELS, ...RIGGING_DECO_MODELS, ...MISC_MODELS, ...CHAIR_MODELS }
   ```
3. **`Venue3D.tsx` → `buildItem`:**
   - Farbe auflösen: `const color = item.color || DEFAULT_3D_COLOR[item.type] || getDefaultColor(item.type)` mit
     `const DEFAULT_3D_COLOR: Partial<Record<ItemType, string>> = { chair: CHAIR_COLOR, chair_row_group: CHAIR_COLOR, curtain: VENUE.curtainColor }` (bisheriges 3D-Verhalten beibehalten).
   - `switch` nur noch für `visiova_frame` und `nivtec_group` (unverändert). `default:` → `const build = MODELS[item.type]`, dann `g.add(build ? build(item, color) : box(item.width, 1, item.height, item.width / 2, 0.5, item.height / 2, color))`.
   - Entfernen: `buildChair`, `CHROME`, `TRUSS_ELEVATION`, `HEIGHTS` (Werte stecken jetzt in den Paketen) und alle alten `case`-Zweige. `mesh`/`box` bleiben (Wände, Bühne).
   - Beim Neuaufbau vor `s.items.clear()` die Instanz-Puffer freigeben: `s.items.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose() })`. Geometrien/Materialien NICHT freigeben (geteilt).
   - Kommentar der Komponente anpassen („Objekte als einfache Modelle …“).
4. **Prüfen:** `npm run build`, `npm run lint` ohne neue Fehler/Warnungen.
5. **Sichtprüfung:** Testprojekt mit je einem Objekt pro Typ in Standardfarbe und einmal mit eigener Farbe (InventoryPanel → Farbe wählen). Jeweils um 0°/45°/90° gedreht. Dabei prüfen:
   - Lage deckt sich mit dem 2D-Grundriss (runde zentriert, `table_low_round`/`plant`/`coat_rack` innerhalb ihres Rechtecks, Vorhang auf der Linie).
   - Sitzrichtungen und Barfront zeigen nach Plan-oben.
   - Nur die Hauptteile ändern die Farbe.
   - Übersicht und Augenhöhe, Schatten an/aus.
   - Optional temporär Bounding-Boxen je Typ loggen: `new THREE.Box3().setFromObject(build(item, '#f00'))` gegen Grundfläche/Höhe.
6. **Performance:** z. B. 60 runde Tische, 10 Stuhlreihen à 8×8, 20 Traversen, 30 Stehtische, 10 Sofas. `renderer.info.render.calls` temporär loggen (Ziel: wenige tausend Calls), flüssiges Orbit auf dem Laptop.
7. Commit, PR.

---

## 6. Prompt-Vorlage für die Haiku-Agents

> Repo `/home/user/whu-event-stadhallenplanung`. Lies `docs/plan-objekte-3d.md`, Abschnitte 1–3 und **Paket P<n>** (nur deins), sowie `src/components/models3d/common.ts`.
> Lege **ausschließlich** `src/components/models3d/<datei>.ts` an und setze die Spezifikation von P<n> exakt um (Maße, Positionen, Materialien, Export-Konstante `<NAME>`).
> Ändere keine anderen Dateien, insbesondere nicht `common.ts` oder `Venue3D.tsx`. Fehlt dir ein Helfer, schreibe ihn als nicht exportierte Funktion in deine eigene Datei.
> Beachte: `item.height` ist die Plan-Tiefe (z), nicht die Höhe. Helfer bekommen den Mittelpunkt. Farbe nur über `mat(...)`.
> Prüfe am Ende: `npx tsc -b 2>&1 | grep "models3d/<datei>"` (muss leer sein; Fehler anderer Dateien ignorieren) und `npx oxlint src/components/models3d/<datei>.ts` (keine Fehler/Warnungen). Gehe die Abnahme-Checkliste aus Abschnitt 4 durch.
> Kein git commit. Antworte mit einer kurzen Liste: Datei, exportierte Funktionen, Abweichungen von der Spezifikation (falls nötig, mit Begründung).

---

## 7. Offene Entscheidungen (Hauptagent)
- **Podesthöhe 1,2 m** (aus `HEIGHTS`) wirkt hoch für ein 2×1-Podest (Saalbühne 0,9 m). Konstante `PODIUM_HEIGHT` in `barStage.ts`, leicht änderbar.
- **Standardfarben:** 2D-Signalfarben (gelbe Tischtücher, rote Sofas) bleiben auch in 3D, wie in 2D. Optional `DEFAULT_3D_COLOR` z. B. um `table_round/table_rect: '#ffffff'` ergänzen. Dann weicht aber der Farbknopf im InventoryPanel (zeigt `getDefaultColor`) vom 3D-Bild ab. Für Stühle ist das heute schon so (rot in 2D, schwarz in 3D).
- **Leinwand:** Die Objektfarbe färbt den Rahmen, nicht die Bildfläche (bewusst, sonst nicht als Leinwand erkennbar).

export type ItemType =
  | 'table_round'
  | 'table_rect'
  | 'table_high'
  | 'chair'
  | 'chair_row_group'
  | 'bar'
  | 'truss'
  | 'curtain'
  | 'podium'
  | 'nivtec_group'
  | 'area'
  | 'exhibition_stand'
  | 'sofa_3'
  | 'sofa_2'
  | 'sofa_corner'
  | 'armchair'
  | 'table_low_round'
  | 'coat_rack'
  | 'plant'
  | 'screen'
  | 'pipe_drape'

export interface PhaseData {
  x: number
  y: number
  rotation: number
  visible: boolean
  /** for curtain / line-path items: additional points relative to x,y */
  points?: number[]
}

export interface Piece2D {
  x: number
  y: number
  w: number
  d: number
  corner?: boolean
  /** von NivTec vergebene Stück-ID, nur informativ */
  id?: string
}

export interface NivtecData {
  /** NivTec-Exporte haben i.d.R. keinen Namen; wird beim Import ggf. aus dem Dateinamen ergänzt. */
  name?: string
  /** Gesamthöhe in cm, so wie NivTec sie exportiert (Feldname "heightCm"). */
  heightCm?: number
  pieces: Piece2D[]
}

export interface EventItem {
  id: string
  type: ItemType
  label: string
  /** size in meters */
  width: number
  height: number
  seats?: number
  phaseData: Record<string, PhaseData>
  nivtecData?: NivtecData
  /** Hex-Farbe, aktuell nur für type 'area' genutzt (Bereiche/Stände farblich markieren) */
  color?: string
  /** Nur für type 'chair_row_group': Anzahl Reihen/Stühle je Reihe und Abstand, damit die Gruppe als ein Objekt gezogen werden kann. */
  grid?: { rows: number; cols: number; spacingM: number }
  /** Freitext-Notiz zum Objekt (z. B. „Kabel bis Bühne legen“). */
  note?: string
}

export interface Phase {
  id: string
  name: string
  order: number
  /** Freitext-Notiz zur Phase (z. B. Ablauf-/Umbauhinweise). */
  note?: string
}

export type LayerId = 'walls' | 'rigging' | 'power' | 'simplified'

export interface LayerState {
  walls: boolean
  rigging: boolean
  /** Strom-Overlay (CEE-Anschlüsse, Bodentanks) unabhängig ein-/ausblendbar. */
  power: boolean
  /** Vereinfachter (entrümpelter/aufgehellter) statt des detaillierten Original-Scans. */
  simplified: boolean
}

export interface EventState {
  eventName: string
  currentPhaseId: string
  phases: Phase[]
  items: Record<string, EventItem>
  itemOrder: string[]
  layers: LayerState
}

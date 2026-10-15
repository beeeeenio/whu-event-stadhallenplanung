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

/** Einmal gebaute, geteilte Stuhlgeometrie: Polster und Chromgestell (je ein zusammengeführtes Stück). */
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

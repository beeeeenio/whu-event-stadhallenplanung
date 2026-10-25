import type { NivtecData, Piece2D } from '../types'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Nur gültige Podeste übernehmen (Zahlen, Breite/Tiefe > 0). */
function cleanPieces(raw: unknown): Piece2D[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is Piece2D => !!p && isNum(p.x) && isNum(p.y) && isNum(p.w) && isNum(p.d) && p.w > 0 && p.d > 0)
}

/**
 * NivTec-Datei (JSON) in `NivtecData` umwandeln. Zwei Formate:
 * - Kastenbühne: `{ heightCm, pieces, forexPanels? }`
 * - Tresen (`kind: "tresen"`): `{ baseHeightCm, spindelHeightCm, basePieces, topPieces }`. Die Podeste (`basePieces`)
 *   werden wie eine Kastenbühne behandelt, die Aufsatz-Platten kommen als `topPieces` dazu.
 */
export function parseNivtecFile(json: unknown): NivtecData {
  const j = (json ?? {}) as Record<string, unknown>
  const pieces = cleanPieces(j.pieces)
  if (pieces.length > 0) return { ...(j as unknown as NivtecData), pieces }
  const basePieces = cleanPieces(j.basePieces)
  if (basePieces.length > 0) {
    return {
      name: typeof j.name === 'string' ? j.name : undefined,
      heightCm: isNum(j.baseHeightCm) ? j.baseHeightCm : undefined,
      pieces: basePieces,
      topPieces: cleanPieces(j.topPieces),
      spindelHeightCm: isNum(j.spindelHeightCm) ? j.spindelHeightCm : undefined,
    }
  }
  throw new Error('Datei enthält weder "pieces" (Kastenbühne) noch "basePieces" (Tresen) mit Podesten')
}

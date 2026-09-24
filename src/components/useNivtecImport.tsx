import { useRef } from 'react'
import { useEventStore } from '../store/store'
import type { NivtecData } from '../types'

/**
 * NivTec-Bühnen/Theken-Import (JSON) als wiederverwendbarer Hook, damit Import sowohl aus
 * dem Objekt-Blatt als auch aus der Befehlszeile erreichbar ist.
 * `getPosition` liefert die Einfügeposition in Canvas-Koordinaten (z. B. Bildmitte).
 */
export function useNivtecImport(getPosition: () => { x: number; y: number }) {
  const importNivtec = useEventStore((s) => s.importNivtec)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleNivtecFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text) as NivtecData
      if (!Array.isArray(json.pieces) || json.pieces.length === 0) {
        throw new Error('Datei enthält kein "pieces"-Array mit Podesten')
      }
      // NivTec-Exporte haben meist keinen eigenen Namen – Dateiname als Fallback nutzen
      const nameFromFile = file.name.replace(/\.json$/i, '').replace(/[-_]+/g, ' ')
      const pos = getPosition()
      importNivtec({ ...json, name: json.name || nameFromFile }, pos.x, pos.y)
    } catch (err) {
      alert('NivTec-Datei konnte nicht gelesen werden: ' + (err as Error).message)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const inputElement = (
    <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleNivtecFile} />
  )

  return { open: () => fileInputRef.current?.click(), inputElement }
}

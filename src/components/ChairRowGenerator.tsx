import { useState } from 'react'
import { useEventStore } from '../store/store'
import { btn, input, sectionLabel } from '../utils/ui'

export default function ChairRowGenerator() {
  const [rows, setRows] = useState(5)
  const [perRow, setPerRow] = useState(10)
  const addChairRowGroup = useEventStore((s) => s.addChairRowGroup)

  const generate = () => {
    // Wird als EIN Objekt angelegt, damit die ganze Stuhlreihe gemeinsam verschoben werden kann
    // statt jeden Stuhl einzeln ziehen zu müssen.
    addChairRowGroup(200, 200, rows, perRow)
  }

  return (
    <div className="p-3 border-b border-gray-100">
      <h3 className={`${sectionLabel} mb-2`}>Stuhlreihen-Generator</h3>
      <p className="text-[10px] text-gray-400 mb-2">
        Erzeugt eine zusammenhängende Gruppe, die als Ganzes verschoben werden kann.
      </p>
      <div className="flex gap-2 mb-2">
        <label className="flex-1 text-[11px] text-gray-500">
          Reihen
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
            className={`w-full mt-0.5 ${input}`}
          />
        </label>
        <label className="flex-1 text-[11px] text-gray-500">
          Stühle/Reihe
          <input
            type="number"
            min={1}
            value={perRow}
            onChange={(e) => setPerRow(Math.max(1, Number(e.target.value)))}
            className={`w-full mt-0.5 ${input}`}
          />
        </label>
      </div>
      <button onClick={generate} className={`w-full ${btn('dark', 'md')}`}>
        {rows * perRow} Stühle als Gruppe generieren
      </button>
    </div>
  )
}

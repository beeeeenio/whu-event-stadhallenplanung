import { useState } from 'react'
import { btn, input } from '../utils/ui'

interface Props {
  /**
   * Stuhlreihen erzeugen. 'tap' = danach in den Plan tippen (Konzept B),
   * 'center' = sofort in der Mitte des sichtbaren Ausschnitts einfügen.
   * Erzeugt wird immer EIN Gruppen-Objekt (addChairRowGroup), keine Einzelstühle.
   */
  onCreate: (rows: number, perRow: number, mode: 'tap' | 'center') => void
  initialRows?: number
  initialPerRow?: number
}

export default function ChairRowGenerator({ onCreate, initialRows = 5, initialPerRow = 10 }: Props) {
  const [rows, setRows] = useState(initialRows)
  const [perRow, setPerRow] = useState(initialPerRow)

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink">Stuhlreihen-Generator</h3>
        <p className="text-[11px] text-ink3 mt-0.5">
          Erzeugt eine zusammenhängende Gruppe, die als Ganzes verschoben werden kann.
        </p>
      </div>
      <div className="flex gap-2 items-end">
        <label className="flex-1 text-[11px] text-ink2">
          Reihen
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
            className={`w-full mt-0.5 ${input} text-sm`}
          />
        </label>
        <span className="pb-2 text-ink3">×</span>
        <label className="flex-1 text-[11px] text-ink2">
          Stühle/Reihe
          <input
            type="number"
            min={1}
            value={perRow}
            onChange={(e) => setPerRow(Math.max(1, Number(e.target.value)))}
            className={`w-full mt-0.5 ${input} text-sm`}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onCreate(rows, perRow, 'tap')} className={`flex-1 ${btn('primary', 'md')}`}>
          {rows * perRow} Stühle im Plan platzieren
        </button>
        <button
          onClick={() => onCreate(rows, perRow, 'center')}
          className={btn('outline', 'md')}
          title="Direkt in der Mitte des sichtbaren Ausschnitts einfügen"
        >
          In Bildmitte
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useEventStore } from '../store/store'
import type { EventItem } from '../types'
import { loadTemplates, saveTemplates, type LayoutTemplate, type TemplateItem } from '../utils/templateStorage'
import { island, islandBtn } from '../utils/ui'

/** „Vorlagen“-Dropdown: sichtbaren Aufbau der aktuellen Phase speichern bzw. als Vorlage einfügen. */
export default function TemplatesMenu() {
  const addItemsBatch = useEventStore((s) => s.addItemsBatch)
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<LayoutTemplate[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setTemplates(loadTemplates())
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const update = (next: LayoutTemplate[]) => {
    saveTemplates(next)
    setTemplates(next)
  }

  const commitSave = () => {
    const { items, itemOrder, currentPhaseId } = useEventStore.getState()
    const captured: TemplateItem[] = []
    for (const id of itemOrder) {
      const item = items[id]
      const pd = item?.phaseData[currentPhaseId]
      if (!item || !pd?.visible) continue
      const { id: _id, phaseData: _pd, ...rest } = item
      captured.push({ ...rest, x: pd.x, y: pd.y, rotation: pd.rotation, ...(pd.points ? { points: pd.points } : {}) })
    }
    if (captured.length > 0) {
      const tpl: LayoutTemplate = { id: uuid(), name: name.trim() || 'Vorlage', createdAt: Date.now(), items: captured }
      update([tpl, ...loadTemplates()])
    }
    setName('')
    setNaming(false)
  }

  const apply = (tpl: LayoutTemplate) => {
    const { phases, currentPhaseId } = useEventStore.getState()
    const batch: EventItem[] = tpl.items.map(({ x, y, rotation, points, ...rest }) => {
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        phaseData[p.id] = { x, y, rotation, visible: p.id === currentPhaseId, ...(points ? { points } : {}) }
      }
      return { ...rest, id: uuid(), phaseData }
    })
    if (batch.length > 0) addItemsBatch(batch)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className={islandBtn(open ? 'chip' : 'plain')} title="Aufbau-Vorlagen">
        Vorlagen ▾
      </button>
      {open && (
        <div className={`absolute right-0 top-full mt-2 z-30 w-64 p-3 space-y-2 text-[13px] ${island}`} onMouseDown={(e) => e.stopPropagation()}>
          {naming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSave()
                if (e.key === 'Escape') setNaming(false)
              }}
              placeholder="Name der Vorlage…"
              className="w-full text-sm font-bold text-ink border-b border-accent focus:outline-none bg-transparent"
            />
          ) : (
            <button onClick={() => setNaming(true)} className={islandBtn('chip', 'w-full')} title="Sichtbare Objekte der aktuellen Phase als Vorlage speichern">
              Als Vorlage speichern
            </button>
          )}
          <div className="pt-2 border-t border-chip">
            <span className="font-semibold text-ink3 text-[10.5px] uppercase tracking-[0.1em]">Vorlage einfügen</span>
            <ul className="mt-1.5 space-y-0.5 max-h-64 overflow-y-auto">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-1">
                  {confirmDeleteId === t.id ? (
                    <>
                      <span className="flex-1 truncate text-xs text-ink2 px-2">„{t.name}“ löschen?</span>
                      <button
                        onClick={() => {
                          update(templates.filter((x) => x.id !== t.id))
                          setConfirmDeleteId(null)
                        }}
                        className="px-2 py-1 rounded-md bg-red-600 text-white text-xs font-semibold"
                      >
                        Löschen
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded-md bg-chip text-ink text-xs">
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => apply(t)}
                        className="flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg text-ink hover:bg-chip flex items-center gap-2"
                        title="In die aktuelle Phase einfügen"
                      >
                        <span className="truncate flex-1">{t.name}</span>
                        <span className="font-mono text-[11px] text-ink3 shrink-0">{t.items.length} Obj.</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(t.id)}
                        title="Vorlage löschen"
                        className="text-ink3 hover:text-red-700 hover:bg-red-50 text-sm w-6 h-6 rounded flex items-center justify-center leading-none transition-colors"
                      >
                        ×
                      </button>
                    </>
                  )}
                </li>
              ))}
              {templates.length === 0 && <li className="text-xs text-ink3 text-center py-3">Noch keine Vorlagen gespeichert</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

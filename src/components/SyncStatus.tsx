import { useEffect, useState } from 'react'
import { resolveConflict, retrySave, useSyncStore } from '../backend/projectSync'
import { btn, island, Z } from '../utils/ui'

const REMOTE_HINT_MS = 4000

/** Kurzer Speicherstand unter dem Projektnamen. */
export function SyncStatusLine() {
  const status = useSyncStore((s) => s.status)
  const role = useSyncStore((s) => s.role)

  let dot = 'bg-emerald-500'
  let text = 'Gespeichert'
  if (role === 'viewer') {
    dot = 'bg-ink3'
    text = 'Nur Ansicht'
  } else if (status === 'saving') {
    dot = 'bg-amber-400'
    text = 'Speichert…'
  } else if (status === 'offline') {
    dot = 'bg-amber-500'
    text = 'Offline – wird erneut versucht'
  } else if (status === 'error' || status === 'conflict') {
    dot = 'bg-red-600'
    text = 'Nicht gespeichert'
  }

  return (
    <span className="text-[11px] text-ink3 px-1 leading-tight inline-flex items-center gap-1.5" title="Speicherstand auf dem Server">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  )
}

/** Hinweise über dem Plan: Konflikt, Fehler beim Speichern, Nur-Ansicht, Änderungen anderer. */
export function SyncBanner() {
  const status = useSyncStore((s) => s.status)
  const role = useSyncStore((s) => s.role)
  const message = useSyncStore((s) => s.message)
  const remoteAppliedAt = useSyncStore((s) => s.remoteAppliedAt)
  const [showRemote, setShowRemote] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!remoteAppliedAt) return
    setShowRemote(true)
    const t = setTimeout(() => setShowRemote(false), REMOTE_HINT_MS)
    return () => clearTimeout(t)
  }, [remoteAppliedAt])

  const resolve = async (choice: 'theirs' | 'mine') => {
    setBusy(true)
    try {
      await resolveConflict(choice)
    } finally {
      setBusy(false)
    }
  }

  const position = 'fixed top-[84px] left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)]'

  if (status === 'conflict') {
    return (
      <div className={`${position} w-[460px] p-4 ${island} border-red-200`} style={{ zIndex: Z.notifications }}>
        <p className="text-sm font-semibold text-ink">Jemand anderes hat dieses Projekt inzwischen gespeichert.</p>
        <p className="text-xs text-ink2 mt-1">
          Ihre letzten Änderungen sind noch nicht auf dem Server. Die Fassung, die Sie nicht wählen, bleibt unter
          „Versionen“ erhalten.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => resolve('theirs')} disabled={busy} className={btn('primary', 'sm')}>
            Neuen Stand laden
          </button>
          <button onClick={() => resolve('mine')} disabled={busy} className={btn('outline', 'sm')}>
            Meinen Stand behalten
          </button>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={`${position} flex items-center gap-3 px-4 py-2.5 ${island} border-red-200`} style={{ zIndex: Z.notifications }}>
        <span className="text-sm text-red-800">Speichern fehlgeschlagen{message ? `: ${message}` : ''}</span>
        <button onClick={retrySave} className={btn('outline', 'sm', 'shrink-0')}>
          Erneut versuchen
        </button>
      </div>
    )
  }

  if (role === 'viewer') {
    return (
      <div className={`${position} px-3 py-1.5 text-xs text-ink2 ${island}`} style={{ zIndex: Z.notifications }}>
        Nur Ansicht – Ihre Änderungen werden nicht gespeichert.
      </div>
    )
  }

  if (showRemote) {
    return (
      <div className={`${position} px-3 py-1.5 text-xs text-ink2 ${island}`} style={{ zIndex: Z.notifications }}>
        Änderungen von anderen übernommen
      </div>
    )
  }

  return null
}

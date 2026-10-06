import { useEffect, useState, type FormEvent } from 'react'
import * as api from '../backend/api'
import { errorMessage, pb, type Role } from '../backend/pb'
import { btn, Z } from '../utils/ui'

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Eigentümer',
  editor: 'Kann bearbeiten',
  viewer: 'Nur ansehen',
}

const field =
  'border border-line bg-white rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50'

interface Props {
  projectId: string
  projectName: string
  myRole: Role
  onClose: () => void
  /** Nach dem Austragen aus dem Projekt (eigene Mitgliedschaft entfernt). */
  onLeft?: () => void
}

/** Wer hat Zugriff auf das Projekt? Der Eigentümer lädt per E-Mail ein und vergibt Rollen. */
export default function ShareDialog({ projectId, projectName, myRole, onClose, onLeft }: Props) {
  const [members, setMembers] = useState<api.Member[] | null>(null)
  const [accounts, setAccounts] = useState<{ id: string; email: string; name: string }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const me = pb.authStore.record?.id
  const isOwner = myRole === 'owner'

  useEffect(() => {
    api.listMembers(projectId).then(setMembers, (err) => setError(errorMessage(err)))
  }, [projectId])

  // Bestehende Accounts als Vorschläge – freigeben geht nur für die.
  useEffect(() => {
    if (isOwner) api.listAccounts().then(setAccounts, () => {})
  }, [isOwner])
  const memberIds = new Set(members?.map((m) => m.id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (action: () => Promise<api.Member[]>) => {
    setBusy(true)
    setError(null)
    try {
      setMembers(await action())
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (await run(() => api.inviteMember(projectId, email.trim(), role))) setEmail('')
  }

  const leave = async () => {
    if (!me || !window.confirm(`Sich aus „${projectName}“ austragen? Danach ist das Projekt für Sie nicht mehr sichtbar.`)) return
    if (await run(() => api.removeMember(projectId, me))) onLeft?.()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4" style={{ zIndex: Z.modals }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Projekt teilen"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Projekt teilen</h2>
            <p className="text-xs text-ink3 truncate">{projectName}</p>
          </div>
          <button onClick={onClose} className={btn('ghost', 'icon', 'text-base')} title="Schließen">
            ×
          </button>
        </div>

        {isOwner && (
          <form onSubmit={invite} className="flex flex-wrap gap-2 mb-1">
            <input
              type="email"
              required
              autoFocus
              list="share-accounts"
              placeholder="E-Mail-Adresse oder Name"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${field} flex-1 min-w-0 basis-48`}
            />
            <datalist id="share-accounts">
              {accounts
                .filter((a) => !memberIds.has(a.id))
                .map((a) => (
                  <option key={a.id} value={a.email}>
                    {a.name}
                  </option>
                ))}
            </datalist>
            <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} className={field}>
              <option value="editor">{ROLE_LABELS.editor}</option>
              <option value="viewer">{ROLE_LABELS.viewer}</option>
            </select>
            <button type="submit" disabled={busy} className={btn('primary', 'md')}>
              Freigeben
            </button>
          </form>
        )}
        {isOwner && (
          <p className="text-[11px] text-ink3 mb-4">Nur für bestehende Accounts. Neue Accounts legt ein Admin unter „Benutzer“ an.</p>
        )}

        {error && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <ul className="divide-y divide-line border-t border-line">
          {members === null && !error && <li className="py-3 text-sm text-ink3">Lade Mitglieder…</li>}
          {members?.map((m) => (
            <li key={m.id} className="py-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">
                  {m.name || m.email}
                  {m.id === me && <span className="text-ink3"> (Sie)</span>}
                </div>
                {m.name && <div className="text-xs text-ink3 truncate">{m.email}</div>}
              </div>
              {isOwner && m.role !== 'owner' ? (
                <>
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => run(() => api.inviteMember(projectId, m.email, e.target.value as 'editor' | 'viewer'))}
                    className="text-xs border border-line rounded-md px-1.5 py-1 bg-white text-ink2"
                  >
                    <option value="editor">{ROLE_LABELS.editor}</option>
                    <option value="viewer">{ROLE_LABELS.viewer}</option>
                  </select>
                  <button
                    onClick={() => run(() => api.removeMember(projectId, m.id))}
                    disabled={busy}
                    title="Zugriff entfernen"
                    className={btn('ghost', 'icon', 'hover:text-red-700 hover:bg-red-50')}
                  >
                    ×
                  </button>
                </>
              ) : (
                <span className="text-xs text-ink3 shrink-0">{ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>

        {!isOwner && (
          <div className="mt-4 flex justify-end">
            <button onClick={leave} disabled={busy} className={btn('dangerOutline', 'sm')}>
              Aus Projekt austragen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

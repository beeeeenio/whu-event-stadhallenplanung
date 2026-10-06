import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as api from '../backend/api'
import { errorMessage, isSuperAdmin, pb } from '../backend/pb'
import { useProjectsStore } from '../store/projectsStore'
import { btn, Z } from '../utils/ui'

const ROLE_LABELS: Record<api.AccountRole, string> = { user: 'Normal', admin: 'Admin', superadmin: 'Super-Admin' }
const MIN_PASSWORD = 8

const field =
  'border border-line bg-white rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50'

/**
 * Benutzerverwaltung für Admins: Accounts anlegen (Admin oder Normal), Rolle ändern,
 * Passwort neu setzen, löschen. Rechte prüft der Server (1791158800_superadmin.js):
 * Normale Accounts verwalten alle Admins; Admin-Accounts stuft nur der Super-Admin zurück,
 * löschen kann sich ein Admin nur selbst; den Super-Admin fasst niemand an.
 */
export default function UsersDialog({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<api.Account[] | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const me = pb.authStore.record?.id
  const superAdmin = isSuperAdmin()
  const logout = useProjectsStore((s) => s.logout)

  const reload = useCallback(() => api.listAllAccounts().then(setAccounts, (err) => setError(errorMessage(err))), [])
  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Aktion ausführen, Liste neu laden; true bei Erfolg. */
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      await reload()
      setNotice(success)
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run(
      () => api.createAccount({ email: email.trim(), name: name.trim(), password, role }),
      `Account für ${email.trim()} angelegt.`,
    )
    if (ok) {
      setName('')
      setEmail('')
      setPassword('')
      setRole('user')
    }
  }

  const savePassword = async (e: FormEvent, a: api.Account) => {
    e.preventDefault()
    if (await run(() => api.updateAccount(a.id, { password: newPassword }), `Neues Passwort für ${a.email} gesetzt.`)) {
      setPasswordFor(null)
      setNewPassword('')
    }
  }

  const remove = (a: api.Account) => {
    const msg = `Account ${a.email} löschen? Die Person kann sich danach nicht mehr anmelden; ihre Projekte gehen an den Super-Admin.`
    if (!window.confirm(msg)) return
    void run(() => api.deleteAccount(a.id), `${a.email} gelöscht.`)
  }

  const removeSelf = async (a: api.Account) => {
    const msg = 'Ihren eigenen Admin-Account löschen? Ihre Projekte gehen an den Super-Admin, und Sie werden abgemeldet.'
    if (!window.confirm(msg)) return
    if (await run(() => api.deleteAccount(a.id), 'Account gelöscht.')) logout()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4" style={{ zIndex: Z.modals }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Benutzer verwalten"
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-5 max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Benutzer verwalten</h2>
            <p className="text-xs text-ink3">
              Admins legen Accounts an und sehen alle Projekte. Admin-Accounts stuft nur der Super-Admin zurück; löschen kann
              sich ein Admin nur selbst.
            </p>
          </div>
          <button onClick={onClose} className={btn('ghost', 'icon', 'text-base')} title="Schließen">
            ×
          </button>
        </div>

        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <input
            required
            type="email"
            placeholder="E-Mail-Adresse"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          <input
            required
            type="text"
            minLength={MIN_PASSWORD}
            placeholder={`Passwort (mind. ${MIN_PASSWORD} Zeichen)`}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          <div className="flex gap-2">
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')} className={`${field} flex-1`}>
              <option value="user">{ROLE_LABELS.user}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
            <button type="submit" disabled={busy} className={btn('primary', 'md')}>
              Anlegen
            </button>
          </div>
        </form>
        <p className="text-[11px] text-ink3 mb-3">Das Passwort der Person mitteilen; sie meldet sich damit unter dieser Adresse an.</p>

        {error && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {notice && <p className="mb-3 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>}

        <ul className="divide-y divide-line border-t border-line overflow-y-auto">
          {accounts === null && !error && <li className="py-3 text-sm text-ink3">Lade Accounts…</li>}
          {accounts?.map((a) => (
            <li key={a.id} className="py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink truncate">
                    {a.name || a.email}
                    {a.id === me && <span className="text-ink3"> (Sie)</span>}
                  </div>
                  {a.name && <div className="text-xs text-ink3 truncate">{a.email}</div>}
                </div>
                {a.id === me ? (
                  <>
                    <span className="text-xs text-ink3 shrink-0">{ROLE_LABELS[a.role]}</span>
                    {a.role === 'admin' && (
                      <button onClick={() => removeSelf(a)} disabled={busy} className={btn('dangerOutline', 'sm')}>
                        Konto löschen
                      </button>
                    )}
                  </>
                ) : a.role === 'superadmin' || (a.role === 'admin' && !superAdmin) ? (
                  // Super-Admin fasst niemand an; andere Admins nur der Super-Admin.
                  <span className="text-xs text-ink3 shrink-0">{ROLE_LABELS[a.role]}</span>
                ) : (
                  <>
                    <select
                      value={a.role}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.target.value as 'admin' | 'user'
                        void run(() => api.updateAccount(a.id, { role: next }), `${a.email} ist jetzt ${ROLE_LABELS[next]}.`)
                      }}
                      className="text-xs border border-line rounded-md px-1.5 py-1 bg-white text-ink2"
                      title="Rolle"
                    >
                      <option value="user">{ROLE_LABELS.user}</option>
                      <option value="admin">{ROLE_LABELS.admin}</option>
                    </select>
                    <button
                      onClick={() => {
                        setPasswordFor(passwordFor === a.id ? null : a.id)
                        setNewPassword('')
                      }}
                      className={btn('outline', 'sm')}
                    >
                      Passwort
                    </button>
                    {/* Admin-Accounts löschen sich nur selbst. */}
                    {a.role === 'user' && (
                      <button
                        onClick={() => remove(a)}
                        disabled={busy}
                        title="Account löschen"
                        className={btn('ghost', 'icon', 'hover:text-red-700 hover:bg-red-50')}
                      >
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>
              {passwordFor === a.id && (
                <form onSubmit={(e) => savePassword(e, a)} className="flex gap-2 mt-2">
                  <input
                    required
                    autoFocus
                    type="text"
                    minLength={MIN_PASSWORD}
                    placeholder={`Neues Passwort (mind. ${MIN_PASSWORD} Zeichen)`}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`${field} flex-1 min-w-0`}
                  />
                  <button type="submit" disabled={busy} className={btn('primary', 'sm')}>
                    Setzen
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

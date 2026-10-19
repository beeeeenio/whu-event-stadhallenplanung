import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import * as api from '../backend/api'
import { errorMessage, isSuperAdmin, parseDate, pb } from '../backend/pb'
import { useProjectsStore } from '../store/projectsStore'
import { btn, Z } from '../utils/ui'
import UsersDialogLegacy from './UsersDialogLegacy'
import LinkBox from './LinkBox'

const ROLE_LABELS: Record<api.AccountRole, string> = { user: 'Normal', admin: 'Admin', superadmin: 'Super-Admin' }
const STATUS_LABELS: Record<api.AccountStatus, string> = { active: 'Aktiv', invited: 'Eingeladen', disabled: 'Gesperrt' }
const STATUS_STYLE: Record<api.AccountStatus, string> = {
  active: 'bg-plus-soft text-plus',
  invited: 'bg-accent-soft text-accent',
  disabled: 'bg-minus-soft text-minus',
}

type Filter = 'all' | api.AccountStatus | 'admins'
const FILTERS: [Filter, string][] = [
  ['all', 'Alle'],
  ['active', 'Aktiv'],
  ['invited', 'Eingeladen'],
  ['disabled', 'Gesperrt'],
  ['admins', 'Admins'],
]

const field =
  'border border-line bg-white rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50'

/** Darf der angemeldete Account diesen Account verwalten? Wie auf dem Server (server/pb_hooks/lib/accounts.js). */
function canManage(a: api.AccountOverview, superAdmin: boolean): boolean {
  if (a.role === 'superadmin') return false
  return superAdmin || a.role === 'user'
}

function formatLogin(iso: string): string {
  if (!iso) return 'noch nie'
  const ms = parseDate(iso)
  const days = Math.floor((Date.now() - ms) / 86400000)
  const date = new Date(ms)
  if (days <= 0) return `heute, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'gestern'
  if (days < 30) return `vor ${days} Tagen`
  return date.toLocaleDateString('de-DE')
}

/**
 * Benutzerverwaltung für Admins: Personen per Link einladen (statt ihnen ein Passwort zu nennen), Passwort-Links,
 * Sperren statt Löschen, Projekte übertragen, Übersicht mit Status, letztem Login und Projektzahl.
 * Rechte prüft der Server (server/pb_hooks/account_admin.pb.js). Ohne aktualisierten Server zeigt die App die
 * einfache Verwaltung von früher.
 */
export default function UsersDialog({ onClose }: { onClose: () => void }) {
  const [features, setFeatures] = useState<api.ServerFeatures | null | undefined>(undefined)
  useEffect(() => {
    void api.serverFeatures().then(setFeatures)
  }, [])
  if (features === undefined) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center" style={{ zIndex: Z.modals }}>
        <div className="bg-white rounded-2xl px-6 py-4 text-sm text-ink3">Lade…</div>
      </div>
    )
  }
  if (features === null) return <UsersDialogLegacy onClose={onClose} />
  return <UsersManager onClose={onClose} features={features} />
}

function UsersManager({ onClose, features }: { onClose: () => void; features: api.ServerFeatures }) {
  const [accounts, setAccounts] = useState<api.AccountOverview[] | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Zuletzt erzeugter Link (Einladung oder Reset) – gehört zu einer Zeile oder zur Einladung. */
  const [link, setLink] = useState<{ forId: string | null; url: string; info: string } | null>(null)
  const [transferFor, setTransferFor] = useState<string | null>(null)
  const [transferTo, setTransferTo] = useState('')
  const me = pb.authStore.record?.id
  const superAdmin = isSuperAdmin()
  const logout = useProjectsStore((s) => s.logout)

  const reload = useCallback(() => api.accountsOverview().then(setAccounts, (err) => setError(errorMessage(err))), [])
  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Aktion ausführen, Liste neu laden; true bei Erfolg. */
  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      await reload()
      if (success) setNotice(success)
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const mailInfo = (sent: boolean) =>
    sent
      ? 'Der Link wurde zusätzlich per E-Mail verschickt.'
      : features.mailEnabled
        ? 'Die E-Mail konnte nicht verschickt werden. Bitte den Link selbst weitergeben.'
        : 'Es ist kein E-Mail-Versand eingerichtet: Den Link bitte selbst weitergeben (z. B. per WhatsApp oder Teams).'

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    setLink(null)
    const ok = await run(async () => {
      const res = await api.inviteAccount({ email: email.trim(), name: name.trim(), role })
      setLink({ forId: null, url: api.tokenLink('invite', res.token), info: `Einladung für ${res.account.name}, 7 Tage gültig. ${mailInfo(res.emailSent)}` })
    })
    if (ok) {
      setName('')
      setEmail('')
    }
  }

  const resetLink = (a: api.AccountOverview) =>
    run(async () => {
      const res = await api.createResetLink(a.id)
      setLink({
        forId: a.id,
        url: api.tokenLink(res.kind, res.token),
        info: `${res.kind === 'invite' ? 'Einladungslink' : 'Link zum Zurücksetzen des Passworts'} für ${a.name || a.email}. ${mailInfo(res.emailSent)}`,
      })
    })

  const toggleDisabled = (a: api.AccountOverview) =>
    run(() => api.updateAccount(a.id, { disabled: !a.disabled }), a.disabled ? `${a.email} ist wieder freigegeben.` : `${a.email} ist gesperrt und überall abgemeldet.`)

  const remove = (a: api.AccountOverview) => {
    const owns = a.projects > 0 ? ` Sie besitzt ${a.projects} Projekt${a.projects === 1 ? '' : 'e'}; diese gehen an den Super-Admin (besser vorher übertragen oder nur sperren).` : ''
    if (!window.confirm(`Account ${a.email} endgültig löschen?${owns}`)) return
    void run(() => api.deleteAccount(a.id), `${a.email} gelöscht.`)
  }

  const removeSelf = async (a: api.AccountOverview) => {
    if (!window.confirm('Den eigenen Admin-Account löschen? Deine Projekte gehen an den Super-Admin, und du wirst abgemeldet.')) return
    if (await run(() => api.deleteAccount(a.id))) logout()
  }

  const transfer = async (a: api.AccountOverview) => {
    if (!transferTo) return
    const target = accounts?.find((x) => x.id === transferTo)
    const ok = await run(async () => {
      const res = await api.transferProjects(a.id, transferTo)
      setNotice(`${res.projects} Projekt${res.projects === 1 ? '' : 'e'} und ${res.templates} Vorlage${res.templates === 1 ? '' : 'n'} gehören jetzt ${target?.name || target?.email}.`)
    })
    if (ok) {
      setTransferFor(null)
      setTransferTo('')
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (accounts ?? []).filter((a) => {
      if (q && !`${a.name} ${a.email}`.toLowerCase().includes(q)) return false
      if (filter === 'admins') return a.role !== 'user'
      return filter === 'all' || api.accountStatus(a) === filter
    })
  }, [accounts, query, filter])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4" style={{ zIndex: Z.modals }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Benutzer verwalten"
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-5 max-h-[92vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Benutzer verwalten</h2>
            <p className="text-xs text-ink3">
              Neue Personen bekommen einen Einladungslink und legen ihr Passwort selbst fest. Ausgeschiedene Personen sperrst du, statt sie zu löschen,
              und übergibst ihre Projekte.
            </p>
          </div>
          <button onClick={onClose} className={btn('ghost', 'icon', 'text-base')} title="Schließen">
            ×
          </button>
        </div>

        <form onSubmit={invite} className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_auto_auto] gap-2 mb-1">
          <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <input required type="email" placeholder="E-Mail-Adresse" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')} className={field} aria-label="Rolle">
            <option value="user">{ROLE_LABELS.user}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
          </select>
          <button type="submit" disabled={busy} className={btn('primary', 'md')}>
            Einladen
          </button>
        </form>
        {link && link.forId === null && <LinkBox link={link.url} info={link.info} />}

        <div className="flex flex-wrap items-center gap-2 mt-4 mb-2">
          <input
            type="search"
            placeholder="Suchen (Name oder E-Mail)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${field} flex-1 min-w-[180px] py-1.5`}
            aria-label="Suchen"
          />
          <div className="flex gap-1" role="group" aria-label="Filter">
            {FILTERS.map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={btn(filter === id ? 'dark' : 'outline', 'sm')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {notice && <p className="mb-2 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>}

        <div className="overflow-y-auto border-t border-line">
          <div className="hidden md:grid grid-cols-[minmax(0,1.7fr)_84px_92px_112px_62px_minmax(0,2.3fr)] gap-2 px-1 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink3 sticky top-0 bg-white">
            <span>Person</span>
            <span>Rolle</span>
            <span>Status</span>
            <span>Letzter Login</span>
            <span className="text-right">Projekte</span>
            <span />
          </div>
          {accounts === null && !error && <p className="py-3 text-sm text-ink3">Lade Accounts…</p>}
          {accounts && visible.length === 0 && <p className="py-4 text-sm text-ink3">Keine Accounts gefunden.</p>}
          <ul className="divide-y divide-line">
            {visible.map((a) => {
              const status = api.accountStatus(a)
              const mine = a.id === me
              const manageable = !mine && canManage(a, superAdmin)
              return (
                <li key={a.id} className={`py-2.5 px-1 ${a.disabled ? 'opacity-70' : ''}`}>
                  <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1.7fr)_84px_92px_112px_62px_minmax(0,2.3fr)] gap-2 items-center">
                    <div className="col-span-2 md:col-span-1 min-w-0">
                      <div className="text-sm text-ink truncate">
                        {a.name || a.email}
                        {mine && <span className="text-ink3"> (du)</span>}
                      </div>
                      {a.name && <div className="text-xs text-ink3 truncate">{a.email}</div>}
                    </div>
                    {manageable && a.role !== 'superadmin' ? (
                      <select
                        value={a.role}
                        disabled={busy || !superAdmin}
                        onChange={(e) => {
                          const next = e.target.value as 'admin' | 'user'
                          void run(() => api.updateAccount(a.id, { role: next }), `${a.email} ist jetzt ${ROLE_LABELS[next]}.`)
                        }}
                        className="text-xs border border-line rounded-md px-1.5 py-1 bg-white text-ink2 disabled:opacity-100 disabled:bg-transparent disabled:border-transparent"
                        title={superAdmin ? 'Rolle ändern' : 'Rollen ändert nur der Super-Admin'}
                      >
                        <option value="user">{ROLE_LABELS.user}</option>
                        <option value="admin">{ROLE_LABELS.admin}</option>
                      </select>
                    ) : (
                      <span className="text-xs text-ink2">{ROLE_LABELS[a.role]}</span>
                    )}
                    <span className={`justify-self-start text-[11px] font-medium rounded-full px-2 py-0.5 ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>
                    <span className="text-xs text-ink2">{status === 'invited' ? 'noch nicht angemeldet' : formatLogin(a.lastLogin)}</span>
                    <span className="text-xs text-ink2 md:text-right">{a.projects}</span>
                    <div className="col-span-2 md:col-span-1 flex flex-wrap gap-1.5 md:justify-end">
                      {manageable && (
                        <>
                          <button onClick={() => void resetLink(a)} disabled={busy} className={btn('outline', 'sm', 'whitespace-nowrap')} title="Neuen Link zum Passwort-Festlegen erstellen">
                            {status === 'invited' ? 'Neuer Link' : 'Passwort-Link'}
                          </button>
                          <button onClick={() => void toggleDisabled(a)} disabled={busy} className={btn('outline', 'sm', 'whitespace-nowrap')}>
                            {a.disabled ? 'Entsperren' : 'Sperren'}
                          </button>
                          {a.projects > 0 && (
                            <button
                              onClick={() => {
                                setTransferFor(transferFor === a.id ? null : a.id)
                                setTransferTo('')
                              }}
                              disabled={busy}
                              className={btn('outline', 'sm', 'whitespace-nowrap')}
                            >
                              Übertragen
                            </button>
                          )}
                          {a.role === 'user' && (
                            <button onClick={() => remove(a)} disabled={busy} title="Account endgültig löschen" className={btn('ghost', 'icon', 'hover:text-red-700 hover:bg-red-50')}>
                              ×
                            </button>
                          )}
                        </>
                      )}
                      {mine && a.role === 'admin' && (
                        <button onClick={() => void removeSelf(a)} disabled={busy} className={btn('dangerOutline', 'sm')}>
                          Konto löschen
                        </button>
                      )}
                    </div>
                  </div>
                  {link?.forId === a.id && <LinkBox link={link.url} info={link.info} />}
                  {transferFor === a.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ground p-2.5">
                      <span className="text-xs text-ink2">
                        Alle {a.projects} Projekte von {a.name || a.email} gehen an:
                      </span>
                      <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className={`${field} py-1 text-xs`} aria-label="Neue Eigentümerin oder neuer Eigentümer">
                        <option value="">Person wählen…</option>
                        {(accounts ?? [])
                          .filter((x) => x.id !== a.id && !x.disabled)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name || x.email}
                            </option>
                          ))}
                      </select>
                      <button onClick={() => void transfer(a)} disabled={busy || !transferTo} className={btn('primary', 'sm')}>
                        Übertragen
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

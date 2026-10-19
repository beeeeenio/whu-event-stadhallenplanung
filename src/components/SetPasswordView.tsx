import { useEffect, useState, type FormEvent } from 'react'
import * as api from '../backend/api'
import { errorMessage, pb } from '../backend/pb'
import { clearHash } from '../utils/hashRoute'
import { btn } from '../utils/ui'
import BrandLogo from './BrandLogo'

const field =
  'w-full border border-line bg-white rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50'

/**
 * Seite hinter einem Einladungs- oder Passwort-Link: Die Person legt ihr Passwort selbst fest und ist danach
 * angemeldet. Der Token steht in der Adresse (#/einladung/… bzw. #/passwort/…), der Server prüft ihn.
 */
export default function SetPasswordView({ token }: { token: string }) {
  const [info, setInfo] = useState<{ kind: 'invite' | 'reset'; email: string; name: string } | 'loading' | 'invalid'>('loading')
  const [minPassword, setMinPassword] = useState(8)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.tokenInfo(token).then(setInfo, () => setInfo('invalid'))
    void api.serverFeatures().then((f) => f && setMinPassword(f.minPassword))
  }, [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (typeof info === 'string') return
    setError(null)
    if (password.length < minPassword) return setError(`Das Passwort braucht mindestens ${minPassword} Zeichen.`)
    if (password !== repeat) return setError('Die beiden Passwörter stimmen nicht überein.')
    setBusy(true)
    try {
      await api.redeemToken(token, password)
      await pb.collection('users').authWithPassword(info.email, password)
      clearHash() // danach zeigt die App die Projektübersicht
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const invite = typeof info !== 'string' && info.kind === 'invite'
  return (
    <div className="min-h-screen w-screen bg-ground flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-line rounded-2xl shadow-sm p-6">
        <BrandLogo className="h-11 mb-5" />
        {info === 'loading' && <p className="text-sm text-ink3">Link wird geprüft…</p>}
        {info === 'invalid' && (
          <>
            <h1 className="text-lg font-semibold text-ink">Link nicht mehr gültig</h1>
            <p className="text-sm text-ink2 mt-2">
              Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte einen Admin um einen neuen Link.
            </p>
            <button onClick={clearHash} className={btn('primary', 'md', 'w-full mt-5')}>
              Zur Anmeldung
            </button>
          </>
        )}
        {typeof info !== 'string' && (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <h1 className="text-lg font-semibold text-ink">{invite ? `Willkommen${info.name ? `, ${info.name}` : ''}` : 'Neues Passwort festlegen'}</h1>
              <p className="text-sm text-ink2">
                {invite ? 'Lege ein Passwort fest, dann bist du angemeldet.' : 'Wähle ein neues Passwort für deinen Account.'}
              </p>
              <p className="text-xs text-ink3 mt-1">Anmeldung mit {info.email}</p>
            </div>
            <label className="block text-xs font-medium text-ink2">
              Passwort (mindestens {minPassword} Zeichen)
              <input type="password" required autoFocus autoComplete="new-password" minLength={minPassword} value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-ink2">
              Passwort wiederholen
              <input type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={`${field} mt-1`} />
            </label>
            <button type="submit" disabled={busy} className={btn('primary', 'md', 'w-full')}>
              {busy ? 'Speichere…' : invite ? 'Passwort festlegen und anmelden' : 'Passwort speichern und anmelden'}
            </button>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </form>
        )}
        {info === 'invalid' && error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  )
}

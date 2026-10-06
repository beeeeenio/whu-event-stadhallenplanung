import { useState, type FormEvent } from 'react'
import { ClientResponseError } from 'pocketbase'
import { errorMessage, pb } from '../backend/pb'
import { btn } from '../utils/ui'

type Step = { kind: 'email' } | { kind: 'code'; otpId: string } | { kind: 'password' }

/** Login per E-Mail-Code erst anbieten, wenn auf dem Server SMTP eingerichtet ist (server/README.md). */
const EMAIL_CODE_LOGIN = false

const field =
  'w-full border border-line bg-white rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50'
const link = 'text-xs text-accent hover:underline'

/**
 * Anmeldung mit E-Mail und Passwort (bzw. per Code, sobald EMAIL_CODE_LOGIN an ist).
 * Accounts legt ein Admin in der Benutzerverwaltung an.
 */
export default function LoginView() {
  const [step, setStep] = useState<Step>({ kind: EMAIL_CODE_LOGIN ? 'email' : 'password' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Bei 400 steht `rejected` da (falscher Code/Passwort), sonst die allgemeine Fehlermeldung. */
  const attempt = async (e: FormEvent, action: () => Promise<unknown>, rejected: string) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ClientResponseError && err.status === 400 ? rejected : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const requestCode = (e: FormEvent) =>
    attempt(
      e,
      async () => {
        const { otpId } = await pb.collection('users').requestOTP(email.trim())
        setCode('')
        setStep({ kind: 'code', otpId })
      },
      'Der Code konnte nicht verschickt werden. Bitte später erneut versuchen oder mit Passwort anmelden.',
    )

  const switchTo = (next: Step) => {
    setError(null)
    setStep(next)
  }

  return (
    <div className="min-h-screen w-screen bg-ground flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-line rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-semibold text-ink">Kongresshalle Vallendar</h1>
        <p className="text-sm text-ink3 mb-6">Event-Planungstool – Anmeldung</p>

        {step.kind === 'email' && (
          <form onSubmit={requestCode} className="space-y-3">
            <label className="block text-xs font-medium text-ink2">
              E-Mail-Adresse
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${field} mt-1`}
              />
            </label>
            <button type="submit" disabled={busy} className={btn('primary', 'md', 'w-full')}>
              {busy ? 'Wird gesendet…' : 'Code per E-Mail senden'}
            </button>
            <button type="button" onClick={() => switchTo({ kind: 'password' })} className={link}>
              Mit Passwort anmelden
            </button>
          </form>
        )}

        {step.kind === 'code' && (
          <form
            onSubmit={(e) =>
              attempt(e, () => pb.collection('users').authWithOTP(step.otpId, code.trim()), 'Der Code ist falsch oder abgelaufen.')
            }
            className="space-y-3"
          >
            <p className="text-sm text-ink2">
              Falls <span className="font-medium text-ink">{email.trim()}</span> Zugang hat, ist ein 6-stelliger Code
              unterwegs. Er gilt 10 Minuten.
            </p>
            <label className="block text-xs font-medium text-ink2">
              Code
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${field} mt-1 font-mono tracking-[0.3em]`}
              />
            </label>
            <button type="submit" disabled={busy} className={btn('primary', 'md', 'w-full')}>
              {busy ? 'Prüfe…' : 'Anmelden'}
            </button>
            <div className="flex justify-between">
              <button type="button" onClick={() => switchTo({ kind: 'email' })} className={link}>
                Andere E-Mail-Adresse
              </button>
              <button type="button" onClick={requestCode} disabled={busy} className={link}>
                Code erneut senden
              </button>
            </div>
          </form>
        )}

        {step.kind === 'password' && (
          <form
            onSubmit={(e) =>
              attempt(e, () => pb.collection('users').authWithPassword(email.trim(), password), 'E-Mail oder Passwort ist falsch.')
            }
            className="space-y-3"
          >
            <label className="block text-xs font-medium text-ink2">
              E-Mail-Adresse
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${field} mt-1`}
              />
            </label>
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-ink2">
                Passwort
              </label>
              <div className="relative mt-1">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${field} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-ink3 hover:text-ink focus:outline-none focus-visible:text-accent"
                >
                  <EyeIcon crossed={showPassword} />
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy} className={btn('primary', 'md', 'w-full')}>
              {busy ? 'Prüfe…' : 'Anmelden'}
            </button>
            {EMAIL_CODE_LOGIN && (
              <button type="button" onClick={() => switchTo({ kind: 'email' })} className={link}>
                Stattdessen Code per E-Mail
              </button>
            )}
          </form>
        )}

        {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <p className="mt-6 text-xs text-ink3">Accounts vergibt ein Admin. Bitte wenden Sie sich an die Projektleitung.</p>
      </div>
    </div>
  )
}

/** Auge (Passwort anzeigen) bzw. durchgestrichenes Auge (verbergen). */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M3 3l18 18" />}
    </svg>
  )
}

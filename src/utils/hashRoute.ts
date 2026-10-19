import { useSyncExternalStore } from 'react'

/** Adressen mit Token im Hash, die ohne Anmeldung funktionieren (z. B. https://…/#/einladung/<token>). */
export type HashRoute = { kind: 'einladung' | 'passwort' | 'ansicht'; token: string }

export function parseHashRoute(hash: string): HashRoute | null {
  const m = /^#\/(einladung|passwort|ansicht)\/([A-Za-z0-9_-]{8,128})\/?$/.exec(hash)
  return m ? { kind: m[1] as HashRoute['kind'], token: m[2] } : null
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/** Der Hash als String, damit useSyncExternalStore einen stabilen Wert bekommt. */
function snapshot() {
  return window.location.hash
}

export function useHashRoute(): HashRoute | null {
  const hash = useSyncExternalStore(subscribe, snapshot)
  return parseHashRoute(hash)
}

/** Adresse ohne Hash (Token aus der Adresszeile entfernen). */
export function clearHash() {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

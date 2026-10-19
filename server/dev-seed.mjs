// Legt Test-Accounts im lokalen PocketBase an (aufgerufen von dev-local.sh). Läuft beliebig oft:
// vorhandene Accounts werden übersprungen. Alle Passwörter: Passwort1234!
const base = `http://127.0.0.1:${process.env.PB_PORT ?? 8090}`
const PASSWORD = 'Passwort1234!'

async function api(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const auth = await api('POST', '/api/collections/_superusers/auth-with-password', { identity: 'dev@test.local', password: 'DevPasswort123' })
if (!auth.json.token) {
  console.error('Anmeldung als PocketBase-Admin fehlgeschlagen:', auth.json)
  process.exit(1)
}

const accounts = [
  ['super@test.local', 'Sabine Super', 'superadmin'],
  ['admin@test.local', 'Anton Admin', 'admin'],
  ['olga@test.local', 'Olga Owner', 'user'],
  ['otto@test.local', 'Otto Other', 'user'],
]
for (const [email, name, role] of accounts) {
  const res = await api('POST', '/api/collections/users/records', { email, name, role, password: PASSWORD, passwordConfirm: PASSWORD, emailVisibility: true, verified: true }, auth.json.token)
  console.log(`${res.status < 300 ? 'angelegt  ' : 'vorhanden '} ${email}  (${role})`)
}
console.log(`\nTest-Accounts, Passwort jeweils ${PASSWORD}`)

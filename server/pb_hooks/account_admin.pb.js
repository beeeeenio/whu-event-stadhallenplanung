/// <reference path="../pb_data/types.d.ts" />

// Benutzerverwaltung für Admins (19.10.2026):
//  - Übersicht mit Status, letztem Login und Projektzahl
//  - Einladen per Link und Passwort-Reset-Link (E-Mail zusätzlich, wenn SMTP eingerichtet ist)
//  - Sperren statt Löschen, Projekte an andere Personen übertragen
//  - Passwort per Link selbst setzen (öffentlich, nur mit gültigem Token)
// Rechte wie in pb_migrations/1791158800_superadmin.js: Admins verwalten normale Accounts,
// der Super-Admin zusätzlich Admins. Neue Felder: pb_migrations/1791159000_user_management.js.

// Was der Server kann – die App prüft das, damit sie mit einem älteren Server nicht ins Leere läuft.
routerAdd("GET", "/api/stadthalle/config", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  return e.json(200, { features: 2, mailEnabled: a.mailEnabled(e.app), minPassword: a.MIN_PASSWORD })
})

routerAdd("GET", "/api/stadthalle/accounts/overview", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  a.requireAdmin(e)
  const mine = e.auth.getString("role")
  const list = e.app
    .findAllRecords("users")
    .filter((u) => a.canSee(mine, u.getString("role")))
    .map((u) => a.describe(e.app, u))
  list.sort((x, y) => (x.name || x.email).localeCompare(y.name || y.email, "de"))
  return e.json(200, list)
}, $apis.requireAuth("users"))

// Body: { email, name, role: "user" | "admin" }
routerAdd("POST", "/api/stadthalle/accounts/invite", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  const m = require(`${__hooks}/lib/members.js`)
  a.requireAdmin(e)
  const body = e.requestInfo().body
  const email = String(body.email || "").trim().toLowerCase()
  const name = String(body.name || "").trim()
  const role = body.role === "admin" ? "admin" : "user"
  if (!m.EMAIL.test(email)) throw new BadRequestError("Ungültige E-Mail-Adresse.")
  if (!name) throw new BadRequestError("Bitte einen Namen angeben.")

  const user = new Record(e.app.findCollectionByNameOrId("users"))
  user.set("email", email)
  user.set("name", name)
  user.set("role", role)
  user.set("verified", true)
  user.setEmailVisibility(true)
  user.set("invitedAt", a.inDays(0))
  // Zufallspasswort, das niemand kennt: angemeldet wird erst nach dem Passwort aus dem Link.
  user.setPassword($security.randomString(32))
  try {
    e.app.save(user)
  } catch (err) {
    throw new BadRequestError("Diese E-Mail-Adresse ist schon vergeben.")
  }
  const { token, expires } = a.createToken(e.app, user, "invite")
  const link = `${a.appOrigin(e)}/#/einladung/${token}`
  const emailSent = a.sendMail(
    e.app,
    email,
    "Einladung zum WHU-Event-Planungstool",
    a.linkMail(name, "Passwort festlegen und anmelden", "du wurdest zum Planungstool für die Kongresshalle Vallendar eingeladen.", link, a.TOKEN_DAYS.invite),
  )
  return e.json(200, { account: a.describe(e.app, user), token, expires, emailSent })
}, $apis.requireAuth("users"))

// Neuer Link zum Passwort-Setzen für bestehende Accounts (auch für noch nicht angenommene Einladungen).
routerAdd("POST", "/api/stadthalle/accounts/{id}/reset-link", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  a.requireAdmin(e)
  const user = a.findAccount(e.app, e.request.pathValue("id"))
  if (!a.canManage(e.auth.getString("role"), user.getString("role"))) throw new ForbiddenError("Keine Berechtigung für diesen Account.")
  const kind = user.getString("invitedAt") ? "invite" : "reset"
  const { token, expires } = a.createToken(e.app, user, kind)
  const link = `${a.appOrigin(e)}/#/${kind === "invite" ? "einladung" : "passwort"}/${token}`
  const emailSent = a.sendMail(
    e.app,
    user.email(),
    "Neues Passwort für das WHU-Event-Planungstool",
    a.linkMail(user.getString("name"), "Neues Passwort festlegen", "für deinen Account wurde ein Link zum Festlegen eines neuen Passworts erstellt.", link, a.TOKEN_DAYS[kind]),
  )
  return e.json(200, { token, kind, expires, emailSent })
}, $apis.requireAuth("users"))

// Body: { toUserId } – alle Projekte und Vorlagen von {id} gehen an die andere Person.
routerAdd("POST", "/api/stadthalle/accounts/{id}/transfer", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  a.requireAdmin(e)
  const from = a.findAccount(e.app, e.request.pathValue("id"))
  if (!a.canManage(e.auth.getString("role"), from.getString("role"))) throw new ForbiddenError("Keine Berechtigung für diesen Account.")
  const to = a.findAccount(e.app, String(e.requestInfo().body.toUserId || ""))
  if (to.id === from.id) throw new BadRequestError("Quelle und Ziel sind dieselbe Person.")
  if (to.getBool("disabled")) throw new BadRequestError("Das Ziel ist gesperrt.")
  const moved = { projects: 0, templates: 0 }
  e.app.runInTransaction((tx) => {
    for (const collection of ["projects", "templates"]) {
      const owned = tx.findRecordsByFilter(collection, "owner = {:id}", "", 0, 0, { id: from.id })
      for (const record of owned) {
        record.set("owner", to.id)
        if (collection === "projects") {
          // Die neue Eigentümerin braucht keine zusätzliche Mitgliedschaft.
          record.set("editors", record.getStringSlice("editors").filter((id) => id !== to.id))
          record.set("viewers", record.getStringSlice("viewers").filter((id) => id !== to.id))
        }
        tx.save(record)
        moved[collection]++
      }
    }
  })
  return e.json(200, moved)
}, $apis.requireAuth("users"))

// ---------- Passwort per Link (öffentlich, nur mit gültigem Token) ----------

routerAdd("GET", "/api/stadthalle/token/{token}", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  const record = a.findToken(e.app, e.request.pathValue("token"))
  if (!record) throw new NotFoundError("Dieser Link ist ungültig oder abgelaufen.")
  const user = e.app.findRecordById("users", record.getString("user"))
  if (user.getBool("disabled")) throw new NotFoundError("Dieser Link ist ungültig oder abgelaufen.")
  return e.json(200, { kind: record.getString("kind"), email: user.email(), name: user.getString("name") })
})

// Body: { password }
routerAdd("POST", "/api/stadthalle/token/{token}/redeem", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  const record = a.findToken(e.app, e.request.pathValue("token"))
  if (!record) throw new NotFoundError("Dieser Link ist ungültig oder abgelaufen.")
  const password = String(e.requestInfo().body.password || "")
  if (password.length < a.MIN_PASSWORD) throw new BadRequestError(`Das Passwort braucht mindestens ${a.MIN_PASSWORD} Zeichen.`)
  const user = e.app.findRecordById("users", record.getString("user"))
  if (user.getBool("disabled")) throw new ForbiddenError("Dieser Account ist gesperrt. Bitte beim Admin melden.")
  e.app.runInTransaction((tx) => {
    user.setPassword(password)
    user.set("invitedAt", "")
    tx.save(user)
    record.set("used", true)
    tx.save(record)
  })
  return e.json(200, { email: user.email() })
})

// „Passwort vergessen“ ohne Admin – nur mit SMTP. Antwortet immer gleich, damit sich nicht
// herausfinden lässt, welche Adressen einen Account haben. Body: { email }
routerAdd("POST", "/api/stadthalle/forgot", (e) => {
  const a = require(`${__hooks}/lib/accounts.js`)
  const enabled = a.mailEnabled(e.app)
  const email = String(e.requestInfo().body.email || "").trim().toLowerCase()
  if (enabled && email) {
    try {
      const user = e.app.findAuthRecordByEmail("users", email)
      if (!user.getBool("disabled")) {
        const kind = user.getString("invitedAt") ? "invite" : "reset"
        const { token } = a.createToken(e.app, user, kind)
        const link = `${a.appOrigin(e)}/#/${kind === "invite" ? "einladung" : "passwort"}/${token}`
        a.sendMail(
          e.app,
          email,
          "Passwort zurücksetzen – WHU-Event-Planungstool",
          a.linkMail(user.getString("name"), "Neues Passwort festlegen", "für deinen Account wurde ein neues Passwort angefordert.", link, a.TOKEN_DAYS[kind]),
        )
      }
    } catch (_) {
      // Kein Account zu dieser Adresse: nichts tun, gleiche Antwort.
    }
  }
  return e.json(200, { mailEnabled: enabled })
})

// ---------- Sperren und Login ----------

// Gesperrte Accounts melden sich nicht mehr an (auch nicht per Token-Erneuerung); jede erfolgreiche
// Anmeldung merkt sich den Zeitpunkt.
onRecordAuthRequest((e) => {
  if (e.record.getBool("disabled")) {
    throw new ForbiddenError("Dieser Account ist gesperrt. Bitte beim Admin melden.")
  }
  try {
    e.record.set("lastLogin", new Date().toISOString().replace("T", " "))
    e.app.save(e.record)
  } catch (err) {
    console.log("lastLogin konnte nicht gespeichert werden: " + err)
  }
  e.next()
}, "users")

// Wer gesperrt wird, ist sofort überall abgemeldet: der Schlüssel der bisherigen Tokens ändert sich.
onRecordUpdate((e) => {
  if (e.record.getBool("disabled") && !e.record.original().getBool("disabled")) {
    e.record.refreshTokenKey()
  }
  e.next()
}, "users")

/// <reference path="../pb_data/types.d.ts" />

// Mitglieder eines Projekts: anzeigen, einladen, Rolle ändern, entfernen.
//
// Eigene Routen statt direkter Zugriffe auf `users`, weil Accounts füreinander
// unsichtbar sind (users.viewRule) und ein Einladen per E-Mail ggf. erst einen
// Account anlegen muss – das darf die öffentliche API nicht (users.createRule).
// Nur der Eigentümer verwaltet Mitglieder; jedes Mitglied kann sich selbst
// austragen.

routerAdd("GET", "/api/stadthalle/projects/{id}/members", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const { project } = m.projectForMember(e)
  return e.json(200, m.list(e.app, project))
}, $apis.requireAuth("users"))

// Body: { email, role: "editor" | "viewer" }. Ist die Person schon Mitglied,
// wird nur ihre Rolle geändert.
routerAdd("POST", "/api/stadthalle/projects/{id}/members", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const { project, role: myRole } = m.projectForMember(e)
  if (myRole !== "owner") throw new ForbiddenError("Nur der Eigentümer kann Mitglieder einladen.")

  const body = e.requestInfo().body
  const email = String(body.email || "").trim().toLowerCase()
  const role = body.role
  if (!m.EMAIL.test(email)) throw new BadRequestError("Ungültige E-Mail-Adresse.")
  if (role !== "editor" && role !== "viewer") throw new BadRequestError('Rolle muss "editor" oder "viewer" sein.')

  e.app.runInTransaction((txApp) => {
    const user = m.findOrCreateUser(txApp, email)
    if (user.id === project.getString("owner")) throw new BadRequestError("Das ist der Eigentümer des Projekts.")
    m.setRole(project, user.id, role)
    txApp.save(project)
  })
  return e.json(200, m.list(e.app, project))
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/stadthalle/projects/{id}/members/{userId}", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const { project, role: myRole } = m.projectForMember(e)
  const userId = e.request.pathValue("userId")
  if (userId === project.getString("owner")) throw new BadRequestError("Der Eigentümer kann nicht entfernt werden.")
  if (myRole !== "owner" && userId !== e.auth.id) throw new ForbiddenError("Nur der Eigentümer kann Mitglieder entfernen.")

  m.setRole(project, userId, null)
  e.app.save(project)
  return e.json(200, m.list(e.app, project))
}, $apis.requireAuth("users"))

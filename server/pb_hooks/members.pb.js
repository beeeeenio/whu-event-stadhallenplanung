/// <reference path="../pb_data/types.d.ts" />

// Mitglieder eines Projekts: anzeigen, einladen, Rolle ändern, entfernen.
//
// Eigene Routen statt direkter Zugriffe auf `users`, weil Accounts füreinander
// unsichtbar sind (users.viewRule). Freigeben geht nur für bestehende Accounts –
// neue legt ein Admin an. Eigentümer und Admins verwalten Mitglieder; jedes
// Mitglied kann sich selbst austragen.

// Accounts (Name, E-Mail) zum Auswählen beim Freigeben – nur auf der eigenen Ebene oder
// darunter: normale Accounts sehen normale, Admins zusätzlich Admins, der Super-Admin alle.
routerAdd("GET", "/api/stadthalle/accounts", (e) => {
  const level = (role) => ({ superadmin: 3, admin: 2 })[role] || 1
  const mine = level(e.auth.getString("role"))
  const accounts = e.app
    .findAllRecords("users")
    .filter((u) => level(u.getString("role")) <= mine)
    .map((u) => ({ id: u.id, email: u.email(), name: u.getString("name") }))
  accounts.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "de"))
  return e.json(200, accounts)
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/stadthalle/projects/{id}/members", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const { project } = m.projectForMember(e)
  return e.json(200, m.list(e.app, project))
}, $apis.requireAuth("users"))

// Body: { email, role: "editor" | "viewer" }. Ist die Person schon Mitglied,
// wird nur ihre Rolle geändert.
routerAdd("POST", "/api/stadthalle/projects/{id}/members", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const { project, canManage } = m.projectForMember(e)
  if (!canManage) throw new ForbiddenError("Nur Eigentümer und Admins können Projekte freigeben.")

  const body = e.requestInfo().body
  const email = String(body.email || "").trim().toLowerCase()
  const role = body.role
  if (!m.EMAIL.test(email)) throw new BadRequestError("Ungültige E-Mail-Adresse.")
  if (role !== "editor" && role !== "viewer") throw new BadRequestError('Rolle muss "editor" oder "viewer" sein.')

  const user = m.findUser(e.app, email)
  if (user.id === project.getString("owner")) throw new BadRequestError("Das ist der Eigentümer des Projekts.")
  m.setRole(project, user.id, role)
  e.app.save(project)
  return e.json(200, m.list(e.app, project))
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/stadthalle/projects/{id}/members/{userId}", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const { project, canManage } = m.projectForMember(e)
  const userId = e.request.pathValue("userId")
  if (userId === project.getString("owner")) throw new BadRequestError("Der Eigentümer kann nicht entfernt werden.")
  if (!canManage && userId !== e.auth.id) throw new ForbiddenError("Nur Eigentümer und Admins können Mitglieder entfernen.")

  m.setRole(project, userId, null)
  e.app.save(project)
  return e.json(200, m.list(e.app, project))
}, $apis.requireAuth("users"))

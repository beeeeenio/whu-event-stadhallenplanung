/// <reference path="../pb_data/types.d.ts" />

// Betrachter-Links: Wer den Link kennt, sieht ein Projekt (nur lesen), ohne Account – etwa die
// Stadt oder Dienstleister (19.10.2026). Eigentümer und Admins erstellen und widerrufen Links.
// Gespeichert wird nur der Hash des Tokens; den Link gibt es deshalb nur direkt beim Erstellen.
// Tabelle: pb_migrations/1791159000_user_management.js (share_links).

routerAdd("GET", "/api/stadthalle/projects/{id}/share-links", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const s = require(`${__hooks}/lib/shares.js`)
  const { project, canManage } = m.projectForMember(e)
  if (!canManage) throw new ForbiddenError("Nur Eigentümer und Admins verwalten Betrachter-Links.")
  const links = e.app.findRecordsByFilter("share_links", "project = {:p}", "-created", 0, 0, { p: project.id })
  return e.json(200, links.map(s.describe))
}, $apis.requireAuth("users"))

// Body: { days } – 0 = unbegrenzt, sonst 1, 7, 30 oder 90 Tage. Antwort enthält den Token einmalig.
routerAdd("POST", "/api/stadthalle/projects/{id}/share-links", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const s = require(`${__hooks}/lib/shares.js`)
  const { project, canManage } = m.projectForMember(e)
  if (!canManage) throw new ForbiddenError("Nur Eigentümer und Admins verwalten Betrachter-Links.")
  const days = Number(e.requestInfo().body.days)
  if (!s.ALLOWED_DAYS.includes(days)) throw new BadRequestError("Ungültige Gültigkeitsdauer.")
  const token = $security.randomString(s.TOKEN_LENGTH)
  const link = new Record(e.app.findCollectionByNameOrId("share_links"))
  link.set("project", project.id)
  link.set("tokenHash", $security.sha256(token))
  link.set("createdBy", e.auth.id)
  link.set("createdByName", e.auth.getString("name") || e.auth.email())
  if (days > 0) link.set("expires", new Date(Date.now() + days * 86400000).toISOString().replace("T", " "))
  e.app.save(link)
  return e.json(200, { ...s.describe(link), token })
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/stadthalle/projects/{id}/share-links/{linkId}", (e) => {
  const m = require(`${__hooks}/lib/members.js`)
  const { project, canManage } = m.projectForMember(e)
  if (!canManage) throw new ForbiddenError("Nur Eigentümer und Admins verwalten Betrachter-Links.")
  let link
  try {
    link = e.app.findRecordById("share_links", e.request.pathValue("linkId"))
  } catch (_) {
    throw new NotFoundError("Link nicht gefunden.")
  }
  if (link.getString("project") !== project.id) throw new NotFoundError("Link nicht gefunden.")
  link.set("revoked", true)
  e.app.save(link)
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

// Öffentlich: Plan zum Token. Ungültige, widerrufene und abgelaufene Links antworten gleich.
routerAdd("GET", "/api/stadthalle/shared/{token}", (e) => {
  const s = require(`${__hooks}/lib/shares.js`)
  const link = s.findActive(e.app, e.request.pathValue("token"))
  if (!link) throw new NotFoundError("Dieser Link ist ungültig, abgelaufen oder wurde widerrufen.")
  const project = e.app.findRecordById("projects", link.getString("project"))
  try {
    link.set("lastUsed", new Date().toISOString().replace("T", " "))
    e.app.save(link)
  } catch (err) {
    console.log("lastUsed konnte nicht gespeichert werden: " + err)
  }
  return e.json(200, { name: project.getString("name"), data: project.get("data"), updated: project.getString("updated") })
})

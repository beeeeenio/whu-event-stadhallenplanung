/// <reference path="../../pb_data/types.d.ts" />
// Gemeinsame Helfer für die Benutzerverwaltung (account_admin.pb.js). Liegt in einer eigenen
// Datei, weil PocketBase jeden Hook-Handler isoliert ausführt (siehe lib/members.js).

const MIN_PASSWORD = 8
const TOKEN_DAYS = { invite: 7, reset: 2 }

function isAdminRole(role) {
  return role === "admin" || role === "superadmin"
}

/** Darf `callerRole` den Account mit `targetRole` verwalten? Wie in 1791158800_superadmin.js. */
function canManage(callerRole, targetRole) {
  if (callerRole === "superadmin") return targetRole !== "superadmin"
  if (callerRole === "admin") return targetRole !== "admin" && targetRole !== "superadmin"
  return false
}

/** Admins dürfen sich selbst nicht verwalten und niemanden außer sich und darunter sehen. */
function canSee(callerRole, targetRole) {
  return callerRole === "superadmin" || targetRole !== "superadmin"
}

function requireAdmin(e) {
  if (!isAdminRole(e.auth.getString("role"))) throw new ForbiddenError("Nur Admins dürfen das.")
}

function findAccount(app, id) {
  try {
    return app.findRecordById("users", id)
  } catch (_) {
    throw new NotFoundError("Account nicht gefunden.")
  }
}

/** Zeitstempel im PocketBase-Format, `days` Tage ab jetzt. */
function inDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().replace("T", " ")
}

function dateString(record, field) {
  const v = record.getString(field)
  return v || ""
}

function describe(app, u) {
  return {
    id: u.id,
    email: u.email(),
    name: u.getString("name"),
    role: u.getString("role") || "user",
    disabled: u.getBool("disabled"),
    lastLogin: dateString(u, "lastLogin"),
    invitedAt: dateString(u, "invitedAt"),
    created: dateString(u, "created"),
    projects: app.countRecords("projects", $dbx.hashExp({ owner: u.id })),
  }
}

/**
 * Neuer Einladungs- bzw. Reset-Link für einen Account. Der Klartext-Token steht nur in der
 * Antwort, gespeichert wird sein Hash; ältere offene Links derselben Art werden ungültig.
 */
function createToken(app, user, kind) {
  const old = app.findRecordsByFilter("account_tokens", "user = {:u} && kind = {:k}", "", 0, 0, { u: user.id, k: kind })
  for (const r of old) app.delete(r)
  const token = $security.randomString(40)
  const record = new Record(app.findCollectionByNameOrId("account_tokens"))
  record.set("user", user.id)
  record.set("kind", kind)
  record.set("tokenHash", $security.sha256(token))
  record.set("expires", inDays(TOKEN_DAYS[kind]))
  app.save(record)
  return { token, expires: record.getString("expires") }
}

/** Offener Token-Datensatz zum Klartext-Token oder null (unbekannt, benutzt, abgelaufen). */
function findToken(app, token) {
  let record
  try {
    record = app.findFirstRecordByFilter("account_tokens", "tokenHash = {:h}", { h: $security.sha256(String(token)) })
  } catch (_) {
    return null
  }
  if (record.getBool("used")) return null
  const expires = record.getDateTime("expires")
  if (!expires.isZero() && expires.unix() * 1000 < Date.now()) return null
  return record
}

/** Adresse, unter der die App erreichbar ist (für Links in Mails). */
function appOrigin(e) {
  const configured = e.app.settings().meta.appURL
  if (configured) return String(configured).replace(/\/$/, "")
  const proto = e.request.header.get("X-Forwarded-Proto") || (e.request.tls ? "https" : "http")
  return `${proto}://${e.request.host}`
}

function mailEnabled(app) {
  return !!app.settings().smtp.enabled
}

/** Verschickt eine Mail, wenn SMTP eingerichtet ist; true = abgeschickt. Fehler brechen nichts ab. */
function sendMail(app, to, subject, html) {
  if (!mailEnabled(app)) return false
  try {
    const meta = app.settings().meta
    const message = new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName },
      to: [{ address: to }],
      subject,
      html,
    })
    app.newMailClient().send(message)
    return true
  } catch (err) {
    console.log("Mail konnte nicht gesendet werden: " + err)
    return false
  }
}

function linkMail(name, headline, text, link, validDays) {
  const hello = name ? `Hallo ${name},` : "Hallo,"
  return `<p>${hello}</p><p>${text}</p><p><a href="${link}">${headline}</a></p><p>Der Link ist ${validDays} Tage gültig. Falls er nicht funktioniert, kopiere diese Adresse in den Browser:<br>${link}</p><p>WHU Event · Information &amp; Event Technology</p>`
}

module.exports = {
  MIN_PASSWORD,
  TOKEN_DAYS,
  isAdminRole,
  canManage,
  canSee,
  requireAdmin,
  findAccount,
  inDays,
  describe,
  createToken,
  findToken,
  appOrigin,
  mailEnabled,
  sendMail,
  linkMail,
}

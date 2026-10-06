/// <reference path="../../pb_data/types.d.ts" />

// Gemeinsame Helfer für die Mitglieder-Routen (members.pb.js). Liegt in einer
// eigenen Datei, weil PocketBase jeden Hook-Handler isoliert ausführt und
// Funktionen außerhalb des Handlers dort nicht sichtbar sind.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function roleOf(project, userId) {
  if (project.getString("owner") === userId) return "owner"
  if (project.getStringSlice("editors").includes(userId)) return "editor"
  if (project.getStringSlice("viewers").includes(userId)) return "viewer"
  return null
}

/**
 * Das Projekt aus dem Pfad, aber nur für Mitglieder und Admins – allen anderen ein 404,
 * damit nicht erkennbar ist, ob es existiert. `canManage`: darf Mitglieder verwalten.
 */
function projectForMember(e) {
  let project
  try {
    project = e.app.findRecordById("projects", e.request.pathValue("id"))
  } catch (_) {
    throw new NotFoundError("Projekt nicht gefunden.")
  }
  const isAdmin = e.auth.getString("role") === "admin"
  const role = roleOf(project, e.auth.id)
  if (!role && !isAdmin) throw new NotFoundError("Projekt nicht gefunden.")
  return { project, role, canManage: role === "owner" || isAdmin }
}

function list(app, project) {
  const entries = project.getString("owner") ? [[project.getString("owner"), "owner"]] : []
  for (const id of project.getStringSlice("editors")) entries.push([id, "editor"])
  for (const id of project.getStringSlice("viewers")) entries.push([id, "viewer"])

  const out = []
  for (const [id, role] of entries) {
    try {
      const user = app.findRecordById("users", id)
      out.push({ id, email: user.email(), name: user.getString("name"), role })
    } catch (_) {
      // Account gelöscht – Eintrag überspringen.
    }
  }
  return out
}

/** Setzt die Rolle eines Mitglieds (oder entfernt es bei role = null). */
function setRole(project, userId, role) {
  const editors = project.getStringSlice("editors").filter((id) => id !== userId)
  const viewers = project.getStringSlice("viewers").filter((id) => id !== userId)
  if (role === "editor") editors.push(userId)
  if (role === "viewer") viewers.push(userId)
  project.set("editors", editors)
  project.set("viewers", viewers)
}

/** Bestehender Account zur E-Mail – Accounts legt nur ein Admin an (Benutzerverwaltung). */
function findUser(app, email) {
  try {
    return app.findAuthRecordByEmail("users", email)
  } catch (_) {
    throw new BadRequestError("Kein Account mit dieser E-Mail-Adresse. Neue Accounts legt ein Admin an.")
  }
}

module.exports = { EMAIL, roleOf, projectForMember, list, setRole, findUser }

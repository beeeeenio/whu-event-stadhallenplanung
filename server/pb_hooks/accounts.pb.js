/// <reference path="../pb_data/types.d.ts" />

// Wird ein Account gelöscht (in der App oder im Admin-Bereich), gehen seine Projekte und
// Vorlagen an den Super-Admin, statt ohne Eigentümer zurückzubleiben. Freigaben für den
// gelöschten Account entfernt PocketBase selbst aus editors/viewers.

onRecordDelete((e) => {
  let superAdmin = null
  try {
    superAdmin = e.app.findFirstRecordByFilter("users", 'role = "superadmin"')
  } catch (_) {
    // Kein Super-Admin eingerichtet – Projekte bleiben ohne Eigentümer (Admins sehen sie weiter).
  }
  if (superAdmin && superAdmin.id !== e.record.id) {
    for (const collection of ["projects", "templates"]) {
      const owned = e.app.findRecordsByFilter(collection, "owner = {:id}", "", 0, 0, { id: e.record.id })
      for (const record of owned) {
        record.set("owner", superAdmin.id)
        e.app.save(record)
      }
    }
  }
  e.next()
}, "users")

// E-Mail-Adresse für Admins sichtbar (fremde Accounts sehen nur Admins, siehe users.viewRule).
onRecordCreate((e) => {
  e.record.setEmailVisibility(true)
  e.next()
}, "users")

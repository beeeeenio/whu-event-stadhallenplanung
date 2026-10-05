/// <reference path="../pb_data/types.d.ts" />

// Optimistisches Sperren für Projekte.
//
// Wer `data` speichert, schickt `version` = zuletzt geladene Version + 1 mit.
// Hat inzwischen jemand anderes gespeichert, passt die Zahl nicht mehr und die
// Anfrage endet mit 409 – die App zeigt dann „wurde inzwischen geändert“, statt
// die fremde Änderung still zu überschreiben.
//
// Prüfen und Speichern laufen in einer Transaktion: SQLite schreibt in
// PocketBase über genau eine Verbindung, also kann zwischen dem Lesen der
// gespeicherten Version und dem Schreiben niemand dazwischenspeichern.

onRecordUpdateRequest((e) => {
  const body = e.requestInfo().body
  const sendsData = body.data !== undefined
  const sendsVersion = body.version !== undefined
  if (!sendsData && !sendsVersion) return e.next()
  if (!sendsVersion) {
    throw new BadRequestError("Beim Speichern des Plans fehlt die Version.")
  }

  e.app.runInTransaction((txApp) => {
    const stored = txApp.findRecordById("projects", e.record.id).getInt("version")
    if (e.record.getInt("version") !== stored + 1) {
      throw new ApiError(409, "Das Projekt wurde inzwischen von jemand anderem gespeichert.")
    }
    e.app = txApp
    e.next()
  })
}, "projects")

// Ein neues Projekt beginnt immer bei Version 0, egal was mitgeschickt wird.
onRecordCreateRequest((e) => {
  e.record.set("version", 0)
  e.next()
}, "projects")

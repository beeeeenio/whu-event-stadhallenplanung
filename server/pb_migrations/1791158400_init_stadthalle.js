/// <reference path="../pb_data/types.d.ts" />

// Datenmodell der Stadthallenplanung.
//
// Ein Projekt ist ein Hallenplan-Entwurf, gespeichert als ganzes JSON (`data` =
// ProjectData aus src/utils/projectStorage.ts). Wer es sehen oder bearbeiten
// darf, steht direkt am Projekt: `owner`, `editors`, `viewers`. Das hält die
// Zugriffsregeln kurz und prüfbar, statt sie über eine Mitglieder-Tabelle zu
// joinen.
//
// IDs dürfen UUIDs sein (die App vergibt sie mit uuid()), damit Projekte aus
// dem localStorage beim ersten Login mit ihrer bisherigen ID übernommen werden
// und Versionen weiter auf sie zeigen.

migrate((app) => {
  const MAX_JSON = 20 * 1024 * 1024

  const MEMBER =
    '@request.auth.id != "" && (owner = @request.auth.id || editors:each ?= @request.auth.id || viewers:each ?= @request.auth.id)'
  const PROJECT_MEMBER =
    '@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id || project.viewers:each ?= @request.auth.id)'
  const PROJECT_WRITER =
    '@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id)'

  // UUIDs (36 Zeichen, mit Bindestrichen) zusätzlich zu PocketBase-eigenen IDs.
  const UUID_ID = {
    name: "id",
    type: "text",
    system: true,
    primaryKey: true,
    required: true,
    min: 15,
    max: 36,
    pattern: "^[a-z0-9-]+$",
    autogeneratePattern: "[a-z0-9]{15}",
  }

  // Nur auf Einladung: niemand kann sich selbst registrieren, und jeder sieht
  // nur seinen eigenen Account. Namen und E-Mails der Mitglieder eines Projekts
  // liefert /api/stadthalle/projects/{id}/members (pb_hooks/members.pb.js).
  const users = app.findCollectionByNameOrId("users")
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  users.createRule = null
  users.updateRule = "id = @request.auth.id"
  users.deleteRule = null
  users.otp.enabled = true
  users.passwordAuth.enabled = true
  app.save(users)

  const projects = new Collection({
    type: "base",
    name: "projects",
    listRule: MEMBER,
    viewRule: MEMBER,
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
    // Bearbeiter dürfen den Plan ändern, aber nicht, wer ihn sehen darf.
    updateRule:
      '@request.auth.id != "" && (owner = @request.auth.id || (editors:each ?= @request.auth.id && @request.body.owner:isset = false && @request.body.editors:isset = false && @request.body.viewers:isset = false))',
    deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
    fields: [
      UUID_ID,
      { name: "name", type: "text", required: true, max: 200 },
      { name: "data", type: "json", maxSize: MAX_JSON },
      // Zähler für optimistisches Sperren, siehe pb_hooks/projects.pb.js.
      { name: "version", type: "number", onlyInt: true, min: 0 },
      { name: "owner", type: "relation", collectionId: users.id, maxSelect: 1, required: true },
      { name: "editors", type: "relation", collectionId: users.id, maxSelect: 999 },
      { name: "viewers", type: "relation", collectionId: users.id, maxSelect: 999 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(projects)

  // Benannte Stände eines Projekts, wie bisher im VersionsMenu – keine
  // automatischen Snapshots bei jedem Speichern.
  const versions = new Collection({
    type: "base",
    name: "project_versions",
    listRule: PROJECT_MEMBER,
    viewRule: PROJECT_MEMBER,
    createRule: PROJECT_WRITER + " && @request.body.createdBy = @request.auth.id",
    updateRule: PROJECT_WRITER + " && @request.body.project:isset = false",
    deleteRule: PROJECT_WRITER,
    fields: [
      UUID_ID,
      { name: "project", type: "relation", collectionId: projects.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "name", type: "text", required: true, max: 200 },
      { name: "data", type: "json", maxSize: MAX_JSON },
      // Zeitpunkt aus der App (ms), damit übernommene Versionen ihr Datum behalten.
      { name: "createdAt", type: "number", onlyInt: true },
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_project_versions_project ON project_versions (project)"],
  })
  app.save(versions)

  // Aufbau-Vorlagen gehören vorerst einer Person, wie bisher pro Browser.
  const templates = new Collection({
    type: "base",
    name: "templates",
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
    updateRule: "owner = @request.auth.id && @request.body.owner:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      UUID_ID,
      { name: "owner", type: "relation", collectionId: users.id, maxSelect: 1, required: true },
      { name: "name", type: "text", required: true, max: 200 },
      { name: "items", type: "json", maxSize: MAX_JSON },
      { name: "createdAt", type: "number", onlyInt: true },
      { name: "created", type: "autodate", onCreate: true },
    ],
  })
  app.save(templates)

  const settings = app.settings()
  settings.meta.appName = "Stadthallenplanung"
  settings.meta.appURL = "https://stadthalle.whu-event.de"
  settings.rateLimits.enabled = true
  // PocketBase läuft nur hinter Caddy auf 127.0.0.1; Caddy setzt X-Forwarded-For
  // neu, also ist der Eintrag ganz rechts die echte Client-IP.
  settings.trustedProxy.headers = ["X-Forwarded-For"]
  settings.trustedProxy.useLeftmostIP = false
  // Tägliche Sicherung nach pb_data/backups, die letzten 7 bleiben liegen.
  settings.backups.cron = "0 3 * * *"
  settings.backups.cronMaxKeep = 7
  app.save(settings)
}, (app) => {
  for (const name of ["templates", "project_versions", "projects"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
})

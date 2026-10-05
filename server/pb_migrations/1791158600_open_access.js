/// <reference path="../pb_data/types.d.ts" />

// Vorübergehend offener Zugang (ab 06.10.2026): Ohne Anmeldung sehen und bearbeiten alle
// alle Projekte, Versionen und Vorlagen. Geschützt bleiben Löschen (Projekte, Versionen,
// Vorlagen) und wer Mitglied/Eigentümer ist – das geht nur angemeldet bzw. im Admin-Bereich.
//
// Gegenstück im Frontend: OPEN_ACCESS in src/backend/pb.ts. Zurück zum Login: OPEN_ACCESS
// auf false und eine neue Migration mit den Regeln aus down() (= 1791158400_init_stadthalle.js).
// Projekte, die ohne Anmeldung angelegt wurden, haben keinen Eigentümer; vor dem Schließen
// im Admin-Bereich einen zuweisen, sonst sieht sie danach niemand mehr.

migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects")
  projects.listRule = ""
  projects.viewRule = ""
  projects.createRule = "@request.body.owner:isset = false || @request.body.owner = @request.auth.id"
  projects.updateRule =
    '(@request.auth.id != "" && owner = @request.auth.id) || (@request.body.owner:isset = false && @request.body.editors:isset = false && @request.body.viewers:isset = false)'
  projects.fields.getByName("owner").required = false
  app.save(projects)

  const versions = app.findCollectionByNameOrId("project_versions")
  versions.listRule = ""
  versions.viewRule = ""
  versions.createRule = "@request.body.createdBy:isset = false || @request.body.createdBy = @request.auth.id"
  app.save(versions)

  const templates = app.findCollectionByNameOrId("templates")
  templates.listRule = ""
  templates.viewRule = ""
  templates.createRule = "@request.body.owner:isset = false || @request.body.owner = @request.auth.id"
  // Ohne Login wäre „owner = @request.auth.id“ bei Vorlagen ohne Eigentümer „leer = leer“, also wahr.
  templates.updateRule = '@request.auth.id != "" && owner = @request.auth.id && @request.body.owner:isset = false'
  templates.deleteRule = '@request.auth.id != "" && owner = @request.auth.id'
  templates.fields.getByName("owner").required = false
  app.save(templates)
}, (app) => {
  const MEMBER =
    '@request.auth.id != "" && (owner = @request.auth.id || editors:each ?= @request.auth.id || viewers:each ?= @request.auth.id)'
  const PROJECT_MEMBER =
    '@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id || project.viewers:each ?= @request.auth.id)'
  const PROJECT_WRITER =
    '@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id)'

  const projects = app.findCollectionByNameOrId("projects")
  projects.listRule = MEMBER
  projects.viewRule = MEMBER
  projects.createRule = '@request.auth.id != "" && @request.body.owner = @request.auth.id'
  projects.updateRule =
    '@request.auth.id != "" && (owner = @request.auth.id || (editors:each ?= @request.auth.id && @request.body.owner:isset = false && @request.body.editors:isset = false && @request.body.viewers:isset = false))'
  projects.fields.getByName("owner").required = true
  app.save(projects)

  const versions = app.findCollectionByNameOrId("project_versions")
  versions.listRule = PROJECT_MEMBER
  versions.viewRule = PROJECT_MEMBER
  versions.createRule = PROJECT_WRITER + " && @request.body.createdBy = @request.auth.id"
  app.save(versions)

  const templates = app.findCollectionByNameOrId("templates")
  templates.listRule = '@request.auth.id != "" && owner = @request.auth.id'
  templates.viewRule = '@request.auth.id != "" && owner = @request.auth.id'
  templates.createRule = '@request.auth.id != "" && @request.body.owner = @request.auth.id'
  templates.fields.getByName("owner").required = true
  app.save(templates)
})

/// <reference path="../pb_data/types.d.ts" />

// Login wieder Pflicht, Accounts verwaltet ein Admin (ab 06.10.2026, beendet 1791158600_open_access.js).
//
// - users.role: "admin" oder "user" (leer = user). Admins legen Accounts an, vergeben Rollen,
//   setzen Passwörter und löschen Accounts – alles über die normale API (manageRule).
//   Niemand registriert sich selbst, und niemand ändert seine eigene Rolle.
// - Admins sehen und verwalten alle Projekte, Versionen und Vorlagen; alle anderen wie vorher
//   nur, was ihnen gehört oder für sie freigegeben ist.
// - Eigentümer bleibt optional: Projekte aus der offenen Phase haben keinen. Admins sehen sie
//   und können sie bearbeiten oder teilen.

migrate((app) => {
  const ADMIN = '@request.auth.role = "admin"'
  const NO_MEMBERSHIP_CHANGES =
    "@request.body.owner:isset = false && @request.body.editors:isset = false && @request.body.viewers:isset = false"
  const PROJECT_READ = `@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id || project.viewers:each ?= @request.auth.id || ${ADMIN})`
  const PROJECT_WRITE = `@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id || ${ADMIN})`

  const users = app.findCollectionByNameOrId("users")
  if (!users.fields.getByName("role")) {
    users.fields.add(new SelectField({ name: "role", values: ["admin", "user"], maxSelect: 1 }))
  }
  users.listRule = `id = @request.auth.id || ${ADMIN}`
  users.viewRule = `id = @request.auth.id || ${ADMIN}`
  users.createRule = ADMIN
  // Eigene Daten (Name, Passwort mit altem Passwort) ja, eigene Rolle nie – auch nicht als Admin,
  // damit sich der letzte Admin nicht versehentlich selbst zurückstuft.
  users.updateRule = `(id = @request.auth.id && @request.body.role:isset = false) || (${ADMIN} && id != @request.auth.id)`
  users.deleteRule = `${ADMIN} && id != @request.auth.id`
  users.manageRule = ADMIN
  app.save(users)

  const projects = app.findCollectionByNameOrId("projects")
  projects.listRule = `@request.auth.id != "" && (owner = @request.auth.id || editors:each ?= @request.auth.id || viewers:each ?= @request.auth.id || ${ADMIN})`
  projects.viewRule = projects.listRule
  projects.createRule = '@request.auth.id != "" && @request.body.owner = @request.auth.id'
  projects.updateRule = `@request.auth.id != "" && (owner = @request.auth.id || ${ADMIN} || (editors:each ?= @request.auth.id && ${NO_MEMBERSHIP_CHANGES}))`
  projects.deleteRule = `@request.auth.id != "" && (owner = @request.auth.id || ${ADMIN})`
  app.save(projects)

  const versions = app.findCollectionByNameOrId("project_versions")
  versions.listRule = PROJECT_READ
  versions.viewRule = PROJECT_READ
  versions.createRule = `${PROJECT_WRITE} && @request.body.createdBy = @request.auth.id`
  versions.updateRule = `${PROJECT_WRITE} && @request.body.project:isset = false`
  versions.deleteRule = PROJECT_WRITE
  app.save(versions)

  const templates = app.findCollectionByNameOrId("templates")
  const OWN_TEMPLATE = `@request.auth.id != "" && (owner = @request.auth.id || ${ADMIN})`
  templates.listRule = OWN_TEMPLATE
  templates.viewRule = OWN_TEMPLATE
  templates.createRule = '@request.auth.id != "" && @request.body.owner = @request.auth.id'
  templates.updateRule = `${OWN_TEMPLATE} && @request.body.owner:isset = false`
  templates.deleteRule = OWN_TEMPLATE
  app.save(templates)
})

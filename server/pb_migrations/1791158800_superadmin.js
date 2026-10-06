/// <reference path="../pb_data/types.d.ts" />

// Super-Admin und geschützte Admin-Accounts (ab 06.10.2026).
//
// users.role: "superadmin" | "admin" | "user" (leer = user).
// - Super-Admin: genau die Notfall-Instanz. Kann von niemandem über die App gelöscht oder
//   zurückgestuft werden; die Rolle vergibt nur der PocketBase-Admin-Bereich (/_/).
//   Projekte und Vorlagen gelöschter Accounts gehen an ihn (pb_hooks/accounts.pb.js).
// - Admins: verwalten normale Accounts (anlegen, Passwort, Rolle, löschen), sehen alle
//   Projekte. Andere Admins fassen sie nicht an – ein Admin-Account kann sich nur selbst
//   löschen. Admins zurückstufen oder ihr Passwort setzen darf nur der Super-Admin.
// - Niemand ändert die eigene Rolle.

migrate((app) => {
  const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "superadmin")'
  const SUPER = '@request.auth.role = "superadmin"'
  const TARGET_IS_USER = 'role != "admin" && role != "superadmin"'
  const NO_SUPER_IN_BODY = '(@request.body.role:isset = false || @request.body.role != "superadmin")'
  const NO_MEMBERSHIP_CHANGES =
    "@request.body.owner:isset = false && @request.body.editors:isset = false && @request.body.viewers:isset = false"
  const PROJECT_READ = `@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id || project.viewers:each ?= @request.auth.id || ${ADMIN})`
  const PROJECT_WRITE = `@request.auth.id != "" && (project.owner = @request.auth.id || project.editors:each ?= @request.auth.id || ${ADMIN})`

  const users = app.findCollectionByNameOrId("users")
  users.fields.getByName("role").values = ["superadmin", "admin", "user"]
  users.listRule = `id = @request.auth.id || ${ADMIN}`
  users.viewRule = users.listRule
  users.createRule = `${ADMIN} && ${NO_SUPER_IN_BODY}`
  users.updateRule = [
    "(id = @request.auth.id && @request.body.role:isset = false)",
    `(${ADMIN} && id != @request.auth.id && ${TARGET_IS_USER} && ${NO_SUPER_IN_BODY})`,
    `(${SUPER} && id != @request.auth.id && role != "superadmin" && ${NO_SUPER_IN_BODY})`,
  ].join(" || ")
  // Passwort setzen ohne das alte zu kennen: dieselben Fälle wie oben, ohne den eigenen Account.
  users.manageRule = `(${ADMIN} && ${TARGET_IS_USER}) || (${SUPER} && role != "superadmin")`
  users.deleteRule = `(${ADMIN} && ${TARGET_IS_USER}) || (id = @request.auth.id && role = "admin")`
  app.save(users)

  // E-Mail-Adressen für Admins sichtbar machen – auch bei Admin-Accounts, die sie nicht
  // verwalten dürfen. Fremde Accounts sehen ohnehin nur Admins (viewRule). Neue Accounts:
  // pb_hooks/accounts.pb.js.
  for (const record of app.findAllRecords("users")) {
    if (!record.emailVisibility()) {
      record.setEmailVisibility(true)
      app.save(record)
    }
  }

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
  templates.updateRule = `${OWN_TEMPLATE} && @request.body.owner:isset = false`
  templates.deleteRule = OWN_TEMPLATE
  app.save(templates)
})

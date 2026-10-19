/// <reference path="../pb_data/types.d.ts" />
// Benutzerverwaltung für Admins, Betrachter-Links und Autoren (19.10.2026).
//
// - users.disabled (gesperrt), users.lastLogin, users.invitedAt (eingeladen, noch kein eigenes Passwort).
//   Rollen und Regeln bleiben wie in 1791158800_superadmin.js; die neuen Felder darf niemand
//   selbst setzen (lastLogin/invitedAt nur die Hooks, disabled nur Admins nach denselben Regeln).
// - account_tokens: Einladungs- und Reset-Links (nur der Hash wird gespeichert). Keine API-Regeln:
//   nur die Hooks in pb_hooks/accounts.pb.js greifen darauf zu.
// - share_links: Betrachter-Links (nur lesen, ohne Account) pro Projekt, siehe pb_hooks/shares.pb.js.
// - projects.lastEditorName, project_versions.createdByName: Wer hat zuletzt gespeichert (die Hooks
//   füllen sie, weil sich Mitglieder gegenseitig nicht als Accounts sehen).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const addField = (collection, field) => {
    if (!collection.fields.getByName(field.name)) collection.fields.add(field)
  }
  addField(users, new BoolField({ name: "disabled" }))
  addField(users, new DateField({ name: "lastLogin" }))
  addField(users, new DateField({ name: "invitedAt" }))

  const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "superadmin")'
  const SUPER = '@request.auth.role = "superadmin"'
  const TARGET_IS_USER = 'role != "admin" && role != "superadmin"'
  const NO_SUPER_IN_BODY = '(@request.body.role:isset = false || @request.body.role != "superadmin")'
  const NO_SYSTEM_FIELDS = "@request.body.lastLogin:isset = false && @request.body.invitedAt:isset = false"
  users.createRule = `${ADMIN} && ${NO_SUPER_IN_BODY} && ${NO_SYSTEM_FIELDS}`
  users.updateRule = [
    `(id = @request.auth.id && @request.body.role:isset = false && @request.body.disabled:isset = false && ${NO_SYSTEM_FIELDS})`,
    `(${ADMIN} && id != @request.auth.id && ${TARGET_IS_USER} && ${NO_SUPER_IN_BODY} && ${NO_SYSTEM_FIELDS})`,
    `(${SUPER} && id != @request.auth.id && role != "superadmin" && ${NO_SUPER_IN_BODY} && ${NO_SYSTEM_FIELDS})`,
  ].join(" || ")
  app.save(users)

  if (!app.hasTable("account_tokens")) {
    app.save(
      new Collection({
        type: "base",
        name: "account_tokens",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
          { name: "kind", type: "select", values: ["invite", "reset"], maxSelect: 1, required: true },
          { name: "tokenHash", type: "text", required: true, max: 128 },
          { name: "expires", type: "date", required: true },
          { name: "used", type: "bool" },
          { name: "created", type: "autodate", onCreate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_account_tokens_hash ON account_tokens (tokenHash)"],
      }),
    )
  }

  const projects = app.findCollectionByNameOrId("projects")
  if (!app.hasTable("share_links")) {
    app.save(
      new Collection({
        type: "base",
        name: "share_links",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "project", type: "relation", collectionId: projects.id, maxSelect: 1, required: true, cascadeDelete: true },
          { name: "tokenHash", type: "text", required: true, max: 128 },
          { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1 },
          { name: "createdByName", type: "text", max: 200 },
          { name: "expires", type: "date" },
          { name: "revoked", type: "bool" },
          { name: "lastUsed", type: "date" },
          { name: "created", type: "autodate", onCreate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_share_links_hash ON share_links (tokenHash)", "CREATE INDEX idx_share_links_project ON share_links (project)"],
      }),
    )
  }

  addField(projects, new TextField({ name: "lastEditorName", max: 200 }))
  app.save(projects)
  const versions = app.findCollectionByNameOrId("project_versions")
  addField(versions, new TextField({ name: "createdByName", max: 200 }))
  app.save(versions)
})

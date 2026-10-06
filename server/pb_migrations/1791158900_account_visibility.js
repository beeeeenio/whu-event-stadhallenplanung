/// <reference path="../pb_data/types.d.ts" />

// Accounts sieht man nur auf der eigenen Ebene oder darunter (07.10.2026):
// Super-Admin alle, Admins alle außer dem Super-Admin, normale Accounts nur sich selbst
// (Vorschläge beim Freigeben: nur normale Accounts, siehe pb_hooks/members.pb.js).
// Mitglieder eines Projekts sehen sich weiterhin gegenseitig (Mitgliederliste).

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule =
    'id = @request.auth.id || @request.auth.role = "superadmin" || (@request.auth.role = "admin" && role != "superadmin")'
  users.viewRule = users.listRule
  app.save(users)
})

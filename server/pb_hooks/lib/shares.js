/// <reference path="../../pb_data/types.d.ts" />
// Helfer für Betrachter-Links (shares.pb.js): Lesezugriff auf ein Projekt ohne Account.

const TOKEN_LENGTH = 40
// Gültigkeit in Tagen; 0 = unbegrenzt bis zum Widerruf.
const ALLOWED_DAYS = [0, 1, 7, 30, 90]

function describe(link) {
  const expires = link.getString("expires")
  const expired = !!expires && link.getDateTime("expires").unix() * 1000 < Date.now()
  return {
    id: link.id,
    created: link.getString("created"),
    createdByName: link.getString("createdByName"),
    expires,
    revoked: link.getBool("revoked"),
    expired,
    lastUsed: link.getString("lastUsed"),
  }
}

/** Gültiger Link zum Klartext-Token oder null (unbekannt, widerrufen, abgelaufen). */
function findActive(app, token) {
  let link
  try {
    link = app.findFirstRecordByFilter("share_links", "tokenHash = {:h}", { h: $security.sha256(String(token)) })
  } catch (_) {
    return null
  }
  if (link.getBool("revoked")) return null
  if (describe(link).expired) return null
  return link
}

module.exports = { TOKEN_LENGTH, ALLOWED_DAYS, describe, findActive }

/// <reference path="../pb_data/types.d.ts" />

// Login per E-Mail-Code: 6 Ziffern, 10 Minuten gültig, Mail auf Deutsch.
// Verschickt wird erst, wenn in den Einstellungen ein SMTP-Server hinterlegt ist.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.otp.duration = 600
  users.otp.length = 6
  users.otp.emailTemplate.subject = "Ihr Anmeldecode für die Stadthallenplanung: {OTP}"
  users.otp.emailTemplate.body = `<p>Guten Tag,</p>
<p>Ihr Code für die Anmeldung bei der Stadthallenplanung lautet:</p>
<p style="font-size:26px;font-weight:bold;letter-spacing:6px">{OTP}</p>
<p>Er gilt 10 Minuten. Falls Sie sich nicht anmelden wollten, können Sie diese E-Mail ignorieren.</p>
<p><a href="{APP_URL}">{APP_URL}</a></p>`
  app.save(users)
})

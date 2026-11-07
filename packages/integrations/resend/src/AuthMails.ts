import { oklchToHex } from "@insyte/tokens/color"
import { colors } from "@insyte/tokens/tokens"

/*
 * The account mails (M2), in Dutch, rendered for Resend: a subject, a plain-text body and a small HTML one. The text
 * comes first in the design: it is what a careful mail client shows, and the HTML says the same thing with one button.
 * Colours are the tokens' own, as hex, because mail clients know no OKLCH; no black anywhere (the brand's rule).
 */

export type AuthMailKind = "auth.verify" | "auth.reset" | "auth.signup_existing"

export interface Rendered {
  readonly subject: string
  readonly text: string
  readonly html: string
}

const C = {
  ink: oklchToHex(colors.ink),
  muted: oklchToHex(colors["ink-3"]),
  page: oklchToHex(colors.glacier),
  card: oklchToHex(colors.paper),
  button: oklchToHex(colors.abyss),
  buttonText: oklchToHex(colors.paper)
}

const escape = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;")

interface Copy {
  readonly subject: string
  readonly heading: string
  readonly lead: string
  readonly action?: string | undefined
  readonly after: string
}

const COPY: Record<AuthMailKind, Copy> = {
  "auth.verify": {
    subject: "Bevestig je e-mailadres voor Insyte",
    heading: "Bevestig je e-mailadres",
    lead: "Klik op de knop om je e-mailadres te bevestigen. Daarna ben je meteen ingelogd en ga je verder waar je was.",
    action: "E-mailadres bevestigen",
    after: "De link is 24 uur geldig. Heb je geen account aangemaakt bij Insyte? Dan kun je deze mail negeren."
  },
  "auth.reset": {
    subject: "Kies een nieuw wachtwoord voor Insyte",
    heading: "Kies een nieuw wachtwoord",
    lead: "Je vroeg om een nieuw wachtwoord voor je Insyte-account. Klik op de knop om er een te kiezen.",
    action: "Nieuw wachtwoord kiezen",
    after:
      "De link is 30 minuten geldig en werkt één keer. Vroeg je dit niet aan? Dan hoef je niets te doen: je wachtwoord blijft hetzelfde."
  },
  "auth.signup_existing": {
    subject: "Je hebt al een account bij Insyte",
    heading: "Je hebt al een account",
    lead: "Iemand probeerde een account aan te maken met dit e-mailadres, maar je hebt er al een.",
    after:
      "Wachtwoord vergeten? Kies op de inlogpagina voor \"Vergeten?\". Was jij dit niet? Dan hoef je niets te doen."
  }
}

/** A mail of one kind, with its link where it has one. A kind that needs a link and has none is a bug: it throws. */
export const renderAuthMail = (kind: AuthMailKind, url: string | undefined): Rendered => {
  const copy = COPY[kind]
  if (copy.action !== undefined && url === undefined) throw new Error(`${kind} needs a link`)
  const link = copy.action !== undefined ? url : undefined

  const text = [
    copy.heading,
    "",
    copy.lead,
    ...(link === undefined ? [] : ["", `${copy.action}: ${link}`]),
    "",
    copy.after,
    "",
    "Insyte"
  ]
    .join("\n")

  const button = link === undefined
    ? ""
    : `<p style="margin:28px 0"><a href="${
      escape(link)
    }" style="display:inline-block;background:${C.button};color:${C.buttonText};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${
      escape(copy.action!)
    }</a></p>
<p style="margin:0 0 20px;color:${C.muted};font-size:13px;line-height:1.5">Werkt de knop niet? Open dan deze link:<br><a href="${
      escape(link)
    }" style="color:${C.muted};word-break:break-all">${escape(link)}</a></p>`

  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${
    escape(copy.subject)
  }</title></head>
<body style="margin:0;background:${C.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.card};border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:15px;font-weight:600;color:${C.ink}">insyte</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:${C.ink}">${escape(copy.heading)}</h1>
<p style="margin:0;font-size:15px;line-height:1.55;color:${C.ink}">${escape(copy.lead)}</p>
${button}
<p style="margin:0;color:${C.muted};font-size:13px;line-height:1.5">${escape(copy.after)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`

  return { subject: copy.subject, text, html }
}

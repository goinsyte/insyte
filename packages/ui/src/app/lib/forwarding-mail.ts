/*
 * "Klant mailen" on a forwarding row: what its dialog opens on. The design app drafts it itself, from the row; a host
 * with its own draft (the console's `Forwarding.customerDraft`) opens on that one alone, and the dialog cannot send
 * until it is in, so a placeholder never goes to a shopper.
 */

/** A mail to a shopper as the host drafted it; `to` is null when there is no address to mail. */
export type MailDraft = { to: string | null; subject: string; body: string }

/** The host's draft as it stands: in, still coming, or not to be had. */
export type ServedDraft = MailDraft | "loading" | "failed"

/** What of a forwarding row the dialog reads (a `QueueRow` is one). */
export interface MailRow {
  reasonNow?: string | undefined
  order: { number: string; customer_name: string; customer_email: string }
  lines: ReadonlyArray<{ title: string; variant_title?: string | undefined }>
}

/** What of a forwarding row the dialog reads (a `QueueRow` is one). */
export interface MailRow {
  reasonNow?: string | undefined
  order: { number: string; customer_name: string; customer_email: string }
  lines: ReadonlyArray<{ title: string; variant_title?: string | undefined }>
}

export interface MailDialogState {
  subject: string
  body: string
  description: string | undefined
  /** Whether Versturen may send (the words aside). */
  ready: boolean
}

/** The design's own draft for the row, as the design app shows it. */
const designDraft = (row: MailRow): MailDraft => {
  const first = row.order.customer_name.split(" ")[0] ?? ""
  const what = row.lines[0] ? `${row.lines[0].title} (${row.lines[0].variant_title})` : "een artikel"
  return {
    to: row.order.customer_email,
    subject: `Over je bestelling ${row.order.number}`,
    body: row.reasonNow === "address"
      ? `Hoi ${first},\n\nBedankt voor je bestelling ${row.order.number}. Om hem te kunnen versturen, missen we je huisnummer. Kun je het adres even aanvullen door op deze mail te antwoorden?\n\nGroet,\nNorthwind`
      : `Hoi ${first},\n\nBedankt voor je bestelling ${row.order.number}. ${what} is bij onze leverancier helaas net uitverkocht. We kunnen hem over ongeveer twee weken alsnog sturen, of je het bedrag meteen terugbetalen. Laat je weten wat je wilt?\n\nGroet,\nNorthwind`
  }
}

const SENT_BY = "Insyte schreef het concept; jij verstuurt het."

/**
 * The dialog for `row`: `served` is the host's draft, or `undefined` when the host has none (the design app), which
 * drafts it as the design does.
 */
export function mailDialogState(row: MailRow | null, served: ServedDraft | undefined): MailDialogState {
  if (row === null) return { subject: "", body: "", description: undefined, ready: false }
  if (served === undefined) {
    const own = designDraft(row)
    return { subject: own.subject, body: own.body, description: `Aan ${own.to}. ${SENT_BY}`, ready: true }
  }
  if (served === "loading") return { subject: "", body: "", description: "Insyte schrijft het concept…", ready: false }
  if (served === "failed") {
    return {
      subject: "",
      body: "",
      description: "Het concept kon niet worden geladen. Sluit dit venster en probeer het zo opnieuw.",
      ready: false
    }
  }
  if (served.to === null) {
    return {
      subject: served.subject,
      body: served.body,
      description: "Er is geen e-mailadres bekend voor deze klant.",
      ready: false
    }
  }
  return { subject: served.subject, body: served.body, description: `Aan ${served.to}. ${SENT_BY}`, ready: true }
}

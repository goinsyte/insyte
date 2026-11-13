import type { EvidenceKind, Provider, Reason } from "./Chargebacks.ts"
import { PROVIDER_NAME } from "./Rules.ts"

/*
 * An evidence pack's documents (M13 step 4; widgets/04 §E): what Insyte knows about a case, as one page per kind, each
 * rendered to a PDF of its own so a provider gets it where it asks for it (Stripe's shipping documentation, customer
 * communication, receipt, its text). Only what is on file: a kind with nothing behind it is not made, and the account
 * (`narrative`) says what the documents show and nothing they do not. The words are Dutch, as the console's. The
 * account is a template now; the AI drafts it in M15.
 */

/** The documents a pack can hold, in the order they are gathered. `chat` is the team's own talk about the order. */
export const DOCUMENTS = ["tracking", "delivery", "correspondence", "chat", "invoice", "narrative"] as const
export type DocumentKind = (typeof DOCUMENTS)[number]

/** The evidence item each document becomes. */
export const ITEM_KIND: Record<DocumentKind, typeof EvidenceKind.Type> = {
  tracking: "tracking",
  delivery: "delivery",
  correspondence: "correspondence",
  chat: "correspondence",
  invoice: "invoice",
  narrative: "narrative"
}

export interface Shipment {
  readonly carrier: string | null
  readonly trackingNumber: string | null
  readonly trackingUrl: string | null
  readonly shippedAt: number | null
  readonly deliveredAt: number | null
  /** The carrier's last word: `delivered`, `in_transit`, … */
  readonly status: string | null
  readonly checkpoint: string | null
}

export interface Mail {
  readonly inbound: boolean
  readonly from: string
  readonly at: number
  readonly subject: string
  readonly body: string
}

export interface CaseFacts {
  readonly caseNumber: string
  readonly provider: Provider
  readonly reason: Reason
  /** The reason in the dialog's words. */
  readonly reasonLabel: string
  readonly amountMinor: number
  readonly currency: string
  readonly customerName: string
  readonly customerEmail: string | null
  readonly openedAt: number
  readonly deadlineAt: number
  /** The store the order is from, else the workspace. */
  readonly brand: string
  readonly timezone: string
  readonly order: {
    readonly number: string
    readonly placedAt: number
    readonly paidAt: number | null
    readonly paymentGateway: string | null
    readonly cardLast4: string | null
    readonly currency: string
    readonly totalMinor: number
    readonly subtotalMinor: number
    readonly shippingMinor: number
    readonly taxMinor: number
    readonly discountsMinor: number
    readonly address: ReadonlyArray<string>
    readonly lines: ReadonlyArray<{
      readonly title: string
      readonly variant: string | null
      readonly sku: string | null
      readonly quantity: number
      readonly unitPriceMinor: number
    }>
    readonly refunds: ReadonlyArray<{ readonly amountMinor: number; readonly currency: string; readonly at: number }>
  } | null
  readonly shipments: ReadonlyArray<Shipment>
  /**
   * What was written with the customer, oldest first: mail in and mail sent. Tickets are the team's own work (their
   * titles and notes are internal) and are not here.
   */
  readonly threads: ReadonlyArray<{ readonly subject: string; readonly mails: ReadonlyArray<Mail> }>
  readonly chat: ReadonlyArray<
    { readonly where: string; readonly author: string; readonly at: number; readonly body: string }
  >
}

/** Which documents the facts can carry, in gathering order: the account always. */
export const documentsFor = (f: CaseFacts): ReadonlyArray<DocumentKind> =>
  DOCUMENTS.filter((kind) => {
    switch (kind) {
      case "tracking":
        return f.shipments.some((s) => s.trackingNumber !== null)
      case "delivery":
        return f.shipments.some(delivered)
      case "correspondence":
        return f.threads.length > 0
      case "chat":
        return f.chat.length > 0
      case "invoice":
        return f.order !== null
      case "narrative":
        return true
    }
  })

const delivered = (s: Shipment) => s.deliveredAt !== null || s.status === "delivered"

/* ── words ─────────────────────────────────────────────────────────────────────────────────────── */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c)

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(minor / 100)

const day = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(ms)

const moment = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: tz }).format(ms)

const STATUS: Record<string, string> = {
  pending: "Aangemeld",
  in_transit: "Onderweg",
  out_for_delivery: "In bezorging",
  delivered: "Bezorgd",
  exception: "Probleem bij de vervoerder",
  expired: "Niet meer gevolgd",
  returned: "Teruggestuurd"
}

/** The order's reference in a file name: `1042` for `#1042`, else the case. */
const refOf = (f: CaseFacts) => (f.order?.number ?? f.caseNumber).replace(/^#/, "").replace(/[^\w-]+/g, "-")

/** The file each document is kept as, before its extension. */
export const fileStem = (kind: DocumentKind, f: CaseFacts) => {
  switch (kind) {
    case "tracking":
      return `verzendgegevens-${refOf(f)}`
    case "delivery":
      return `bezorgbevestiging-${refOf(f)}`
    case "correspondence":
      return `klantcontact-${refOf(f)}`
    case "chat":
      return `teamberichten-${refOf(f)}`
    case "invoice":
      return `bestelling-${refOf(f)}`
    case "narrative":
      return `toelichting-${f.caseNumber.replace(/[^\w-]+/g, "-")}`
  }
}

const TITLE: Record<DocumentKind, string> = {
  tracking: "Verzendgegevens",
  delivery: "Bezorgbevestiging",
  correspondence: "Contact met de klant",
  chat: "Berichten van het team",
  invoice: "Bestelgegevens",
  narrative: "Toelichting"
}

/* ── the account ───────────────────────────────────────────────────────────────────────────────── */

/** The account a provider reads first: what happened, from the documents in the pack, in plain sentences. */
export const narrativeOf = (f: CaseFacts): string => {
  const tz = f.timezone
  const provider = PROVIDER_NAME[f.provider]
  const out: Array<string> = []
  const order = f.order
  out.push(
    `${f.customerName} betwist via ${provider} een betaling van ${money(f.amountMinor, f.currency)}${
      order === null ? "" : ` voor bestelling ${order.number} bij ${f.brand}, geplaatst op ${day(order.placedAt, tz)}`
    }. Opgegeven reden: ${f.reasonLabel.toLowerCase()}. Zaak ${f.caseNumber}.`
  )
  if (order !== null) {
    const paid = order.paidAt === null ? "" : `Betaald op ${day(order.paidAt, tz)}`
    const how = [
      order.paymentGateway === null ? "" : ` via ${order.paymentGateway}`,
      order.cardLast4 === null ? "" : ` (kaart eindigend op ${order.cardLast4})`
    ].join("")
    const to = order.address.length === 0 ? "" : ` De bestelling ging naar ${order.address.join(", ")}.`
    if (paid !== "" || to !== "") out.push(`${paid === "" ? "" : `${paid}${how}.`}${to}`.trim())
  }
  const sent = f.shipments.filter((s) => s.trackingNumber !== null)
  for (const s of sent) {
    out.push(
      `Verzonden${s.shippedAt === null ? "" : ` op ${day(s.shippedAt, tz)}`}${
        s.carrier === null ? "" : ` met ${s.carrier}`
      }, trackingnummer ${s.trackingNumber}.`
    )
  }
  const arrived = f.shipments.filter(delivered)
  for (const s of arrived) {
    out.push(
      `De vervoerder meldt het pakket als bezorgd${s.deliveredAt === null ? "" : ` op ${moment(s.deliveredAt, tz)}`}.`
    )
  }
  const contacts = f.threads.length
  if (contacts > 0) {
    out.push(
      `Er ${contacts === 1 ? "is één gesprek" : `zijn ${contacts} gesprekken`} met de klant${
        order === null ? "" : " over deze bestelling"
      }; ${contacts === 1 ? "het staat" : "ze staan"} in dit pakket.`
    )
  }
  for (const r of order?.refunds ?? []) {
    out.push(`Op ${day(r.at, tz)} is al ${money(r.amountMinor, r.currency)} terugbetaald.`)
  }
  if (f.reason === "item_not_received" && arrived.length > 0) {
    out.push("De bezorging is bevestigd door de vervoerder, op het adres dat de klant bij de bestelling opgaf.")
  }
  out.push(
    order === null
      ? "Er is geen bestelling aan deze zaak gekoppeld; de bijgevoegde stukken zijn wat het team heeft aangeleverd."
      : "De bijgevoegde stukken onderbouwen dit. Wij vragen u het geschil op grond daarvan af te wijzen."
  )
  return out.join("\n\n")
}

/* ── the pages ─────────────────────────────────────────────────────────────────────────────────── */

const page = (f: CaseFacts, kind: DocumentKind, body: string) =>
  `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(TITLE[kind])} · ${
    esc(f.caseNumber)
  }</title><style>
body{font:13px/1.55 system-ui,sans-serif;color:#111;margin:0}main{padding:36px}h1{font-size:19px;margin:0}
header p{color:#555;margin:4px 0 22px}h2{font-size:14px;margin:22px 0 6px}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:6px 0;border-bottom:1px solid #ddd;vertical-align:top}th{color:#555;font-weight:500;width:34%}
.num{text-align:right}.muted{color:#666}.mail{border-left:2px solid #ddd;padding:2px 0 2px 12px;margin:10px 0}
.mail p{white-space:pre-wrap;margin:6px 0 0}footer{margin-top:28px;color:#666;font-size:11px}</style></head><body><main>
<header><h1>${esc(TITLE[kind])}</h1><p>${esc(f.brand)} · zaak ${esc(f.caseNumber)} bij ${
    esc(PROVIDER_NAME[f.provider])
  }${f.order === null ? "" : ` · bestelling ${esc(f.order.number)}`}</p></header>
${body}
<footer>Samengesteld door Insyte uit de gegevens van ${esc(f.brand)}.</footer></main></body></html>`

const rows = (pairs: ReadonlyArray<readonly [string, string | null]>) =>
  `<table>${
    pairs.filter((p): p is readonly [string, string] => p[1] !== null && p[1] !== "")
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")
  }</table>`

const shipmentRows = (s: Shipment, tz: string) =>
  rows([
    ["Vervoerder", s.carrier],
    ["Trackingnummer", s.trackingNumber],
    ["Volgen", s.trackingUrl],
    ["Verzonden", s.shippedAt === null ? null : moment(s.shippedAt, tz)],
    ["Status", s.status === null ? null : STATUS[s.status] ?? s.status],
    ["Laatste melding", s.checkpoint],
    ["Bezorgd", s.deliveredAt === null ? null : moment(s.deliveredAt, tz)]
  ])

const body = (kind: DocumentKind, f: CaseFacts): string => {
  const tz = f.timezone
  switch (kind) {
    case "tracking":
      return f.shipments.filter((s) => s.trackingNumber !== null)
        .map((s, i) => `<h2>Zending ${i + 1}</h2>${shipmentRows(s, tz)}`).join("")
    case "delivery": {
      const address = f.order?.address ?? []
      return `${
        rows([
          ["Ontvanger", f.customerName],
          ["Bezorgadres", address.length === 0 ? null : address.join(", ")]
        ])
      }${f.shipments.filter(delivered).map((s, i) => `<h2>Bezorging ${i + 1}</h2>${shipmentRows(s, tz)}`).join("")}`
    }
    case "correspondence": {
      const threads = f.threads.map((t) =>
        `<h2>${esc(t.subject === "" ? "(geen onderwerp)" : t.subject)}</h2>${
          t.mails.map((m) =>
            `<div class="mail"><strong>${esc(m.from)}</strong> · <span class="muted">${
              esc(m.inbound ? "van de klant" : `van ${f.brand}`)
            }, ${esc(moment(m.at, tz))}</span><p>${esc(m.body)}</p></div>`
          ).join("")
        }`
      )
      return threads.join("")
    }
    case "chat":
      return `<p class="muted">Wat het team in Insyte over deze bestelling of zaak schreef.</p>${
        f.chat.map((m) =>
          `<div class="mail"><strong>${esc(m.author)}</strong> · <span class="muted">${esc(m.where)}, ${
            esc(moment(m.at, tz))
          }</span><p>${esc(m.body)}</p></div>`
        ).join("")
      }`
    case "invoice": {
      const o = f.order!
      const lines = o.lines.map((l) =>
        `<tr><td>${l.quantity}×</td><td>${esc(l.title)}${l.variant ? ` · ${esc(l.variant)}` : ""}${
          l.sku ? ` <span class="muted">${esc(l.sku)}</span>` : ""
        }</td><td class="num">${esc(money(l.unitPriceMinor * l.quantity, o.currency))}</td></tr>`
      ).join("")
      const sum = (label: string, minor: number) =>
        `<tr><th colspan="2">${esc(label)}</th><td class="num">${esc(money(minor, o.currency))}</td></tr>`
      return `${
        rows([
          ["Bestelling", o.number],
          ["Geplaatst", moment(o.placedAt, tz)],
          ["Klant", f.customerName],
          ["E-mail", f.customerEmail],
          ["Adres", o.address.length === 0 ? null : o.address.join(", ")],
          ["Betaald", o.paidAt === null ? null : moment(o.paidAt, tz)],
          [
            "Betaalmethode",
            [o.paymentGateway, o.cardLast4 === null ? null : `kaart •••• ${o.cardLast4}`]
              .filter((x) => x !== null).join(" · ") || null
          ]
        ])
      }<h2>Artikelen</h2><table>${lines}${sum("Subtotaal", o.subtotalMinor)}${sum("Verzending", o.shippingMinor)}${
        o.discountsMinor > 0 ? sum("Korting", -o.discountsMinor) : ""
      }${sum("Btw", o.taxMinor)}${sum("Totaal", o.totalMinor)}</table>${
        o.refunds.length === 0 ?
          "" :
          `<h2>Terugbetaald</h2>${
            rows(o.refunds.map((r) => [day(r.at, tz), money(r.amountMinor, r.currency)] as const))
          }`
      }`
    }
    case "narrative":
      return `${
        rows([
          ["Zaak", f.caseNumber],
          ["Aanbieder", PROVIDER_NAME[f.provider]],
          ["Betwist bedrag", money(f.amountMinor, f.currency)],
          ["Reden", f.reasonLabel],
          ["Geopend", day(f.openedAt, tz)],
          ["Deadline", day(f.deadlineAt, tz)]
        ])
      }<h2>Toelichting</h2>${narrativeOf(f).split("\n\n").map((p) => `<p>${esc(p)}</p>`).join("")}`
  }
}

/** One document of the pack as a whole HTML page, ready to render. */
export const documentHtml = (kind: DocumentKind, f: CaseFacts) => page(f, kind, body(kind, f))

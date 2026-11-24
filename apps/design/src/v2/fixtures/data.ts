import { CUSTOMERS, PRODUCTS } from "./records.ts"
import type { Customer } from "./records.ts"
import type { PEOPLE } from "./workspace.ts"

/**
 * Data: getting records in and out of Insyte and keeping them clean. Rebuilt from the current demo's
 * `data-screen.tsx` and `data-demo-source.tsx` on this version's records: the sample file is Allure's
 * stock list for this version's products (the original's tees and caps are not in this shop), the
 * export columns are the order fields every list shows, and the duplicates are the three second
 * profiles in `fixtures/records.ts`.
 */

/** Allure's stock list as it arrives by mail on Mondays: one unknown sku, one product sold out. */
export const SAMPLE_NAME = "voorraad-allure-23-nov.csv"
export const SAMPLE_CSV = [
  "sku;naam;voorraad;inkoopprijs",
  ...PRODUCTS.filter((p) => p.supplierId === "allure-fulfillment").map((p, i) =>
    `${p.sku};${p.name};${i === 2 ? 0 : p.stock + 40 + i * 12};${p.cost.toFixed(2).replace(".", ",")}`
  ),
  "NW-AUR-VEST;Aurora Vest;60;28,00"
].join("\n")

export type Parsed = { readonly header: ReadonlyArray<string>; readonly rows: ReadonlyArray<ReadonlyArray<string>> }

/** A small CSV reader: `;` or `,` between fields, quotes around a field with a separator in it. */
export function parseCsv(text: string): Parsed {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "")
  const first = lines[0] ?? ""
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ","
  const split = (line: string) => {
    const out: Array<string> = []
    let cur = ""
    let quoted = false
    for (const ch of line) {
      if (ch === "\"") quoted = !quoted
      else if (ch === sep && !quoted) {
        out.push(cur.trim())
        cur = ""
      } else cur += ch
    }
    out.push(cur.trim())
    return out
  }
  const [header = [], ...rows] = lines.map(split)
  return { header, rows }
}

/** Whether a row's sku is a product Insyte knows. */
export const knownSku = (sku: string) => PRODUCTS.some((p) => p.sku === sku)

export type ExportKind = "bestellingen" | "klanten" | "producten"
export const EXPORT_COLUMNS: Readonly<
  Record<ExportKind, ReadonlyArray<{ readonly id: string; readonly label: string }>>
> = {
  bestellingen: [
    { id: "nummer", label: "Bestelnummer" },
    { id: "datum", label: "Geplaatst" },
    { id: "klant", label: "Klant" },
    { id: "email", label: "E-mail" },
    { id: "status", label: "Status" },
    { id: "totaal", label: "Totaal incl. btw" },
    { id: "betaling", label: "Betaling" },
    { id: "leverancier", label: "Leverancier" }
  ],
  klanten: [
    { id: "naam", label: "Naam" },
    { id: "email", label: "E-mail" },
    { id: "land", label: "Land" },
    { id: "bestellingen", label: "Bestellingen" },
    { id: "waarde", label: "Totaal besteed" }
  ],
  producten: [
    { id: "sku", label: "SKU" },
    { id: "naam", label: "Naam" },
    { id: "voorraad", label: "Voorraad" },
    { id: "prijs", label: "Prijs" },
    { id: "inkoopprijs", label: "Inkoopprijs" },
    { id: "leverancier", label: "Leverancier" }
  ]
}
export const EXPORT_LABEL: Readonly<Record<ExportKind, string>> = {
  bestellingen: "Bestellingen",
  klanten: "Klanten",
  producten: "Producten"
}

export type ExportStatus = "wachtrij" | "schrijven" | "klaar" | "mislukt" | "verlopen"
export const EXPORT_STATUS: Readonly<
  Record<ExportStatus, { readonly label: string; readonly tone: "neutral" | "good" | "bad" | "accent" }>
> = {
  wachtrij: { label: "In de wachtrij", tone: "neutral" },
  schrijven: { label: "Wordt geschreven", tone: "accent" },
  klaar: { label: "Klaar", tone: "good" },
  mislukt: { label: "Mislukt", tone: "bad" },
  verlopen: { label: "Verlopen", tone: "neutral" }
}

export type ExportJob = {
  readonly id: string
  readonly kind: ExportKind
  readonly period: string
  readonly rows: number
  readonly status: ExportStatus
  readonly by: keyof typeof PEOPLE
  readonly at: string
  readonly why?: string
}

export const EXPORTS: ReadonlyArray<ExportJob> = [
  {
    id: "exp-3",
    kind: "bestellingen",
    period: "16–22 nov",
    rows: 1204,
    status: "klaar",
    by: "sofia",
    at: "vandaag 08:40"
  },
  {
    id: "exp-2",
    kind: "klanten",
    period: "alles",
    rows: 0,
    status: "mislukt",
    by: "ethan",
    at: "20 nov",
    why: "De export stopte na 10 minuten. Kies minder kolommen of een kortere periode."
  },
  { id: "exp-1", kind: "bestellingen", period: "oktober", rows: 4870, status: "verlopen", by: "elena", at: "3 nov" }
]

/** A group of profiles that are the same person: the original first, then its second records. */
export type DuplicateGroup = {
  readonly keep: Customer
  readonly copies: ReadonlyArray<Customer>
  readonly reason: string
}

export function duplicateGroups(): ReadonlyArray<DuplicateGroup> {
  return CUSTOMERS.filter((c) => c.duplicateOf === undefined)
    .map((keep) => {
      const copies = CUSTOMERS.filter((c) => c.duplicateOf === keep.id)
      const same = copies.every((c) => c.email.toLowerCase() === keep.email.toLowerCase())
      const reason = same
        ? "Zelfde e-mailadres"
        : copies.every((c) => c.country === keep.country)
        ? "Zelfde naam en land"
        : "Zelfde naam"
      return { keep, copies, reason }
    })
    .filter((g) => g.copies.length > 0)
}

export type Sync = {
  readonly id: string
  readonly name: string
  /** The service it comes from, for its logo (`ServiceLogo`). */
  readonly service?: string
  readonly reads: string
  readonly last: string
  readonly status: "ok" | "achter" | "ontkoppeld"
  readonly note?: string
}

/** What Insyte reads from, and when each last came through. */
export const SYNCS: ReadonlyArray<Sync> = [
  {
    id: "store_eu",
    name: "Northwind EU",
    service: "shopify",
    reads: "Bestellingen, producten, klanten",
    last: "1 minuut geleden",
    status: "ok"
  },
  {
    id: "store_us",
    name: "Northwind US",
    service: "shopify",
    reads: "Bestellingen, producten, klanten",
    last: "3 minuten geleden",
    status: "ok"
  },
  {
    id: "store_uk",
    name: "Northwind UK",
    service: "shopify",
    reads: "Bestellingen",
    last: "2 okt",
    status: "ontkoppeld",
    note: "De winkel is ontkoppeld. Bestellingen van na 2 oktober staan niet in Insyte."
  },
  {
    id: "stripe",
    name: "Stripe",
    service: "stripe",
    reads: "Betalingen, terugbetalingen, chargebacks",
    last: "2 minuten geleden",
    status: "ok"
  },
  {
    id: "meta",
    name: "Meta Ads",
    service: "meta",
    reads: "Advertentiekosten per dag",
    last: "vandaag 06:00",
    status: "achter",
    note: "Meta stuurt de kosten één keer per dag; die van vandaag komen morgen om 06:00."
  },
  {
    id: "resend",
    name: "Resend",
    service: "resend",
    reads: "Bezorgd, geopend, gebounced",
    last: "5 minuten geleden",
    status: "ok"
  }
]

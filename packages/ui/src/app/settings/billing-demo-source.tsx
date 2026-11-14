import type { ReactNode } from "react"
import { toast } from "sonner"
import { undoable } from "../lib/undo"
import { useSettings } from "../stores/settings-store"
import { useSeats, useTeam } from "../stores/team-store"
import { useWorkspace } from "../stores/workspace-store"
import {
  type BillingCycle,
  type BillingSource,
  BillingSourceProvider,
  type InvoiceRow,
  type PlanTier,
  type TierOffer
} from "./billing-source"

/*
 * Facturatie over the design app's settings and team stores, as it was before the seam (`billing-source.tsx`): a plan,
 * a seat, a cancellation and a card change at once with Ongedaan maken, a seeded renewal and invoice list, and an
 * invoice downloaded as a page made in the browser. Its dollar prices are the design's, not Insyte's.
 */

const TIERS: Record<PlanTier, { name: string; priceMonthly: number; seats: number; stores: number; replies: number }> =
  {
    starter: { name: "Starter", priceMonthly: 149, seats: 3, stores: 1, replies: 1000 },
    growth: { name: "Growth", priceMonthly: 299, seats: 6, stores: 3, replies: 2500 },
    scale: { name: "Scale", priceMonthly: 499, seats: 12, stores: 5, replies: 5000 }
  }

const RENEWAL = "14 juli 2026"

/** Dollars the way nl-NL writes them: US$ 499, or US$ 499,00 with cents. */
const usd = (n: number, cents = 0) =>
  n.toLocaleString("nl-NL", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents,
    maximumFractionDigits: cents
  })

/** Annual is two months free, shown as what it works out to per month. */
const priceFor = (tier: PlanTier, cycle: BillingCycle) =>
  cycle === "annual" ? Math.round((TIERS[tier].priceMonthly * 10) / 12) : TIERS[tier].priceMonthly

const INVOICES = [
  { id: "INV-2026-06", date: "14 juni 2026", amount: 499 },
  { id: "INV-2026-05", date: "14 mei 2026", amount: 499 },
  { id: "INV-2026-04", date: "14 april 2026", amount: 499 },
  { id: "INV-2026-03", date: "14 maart 2026", amount: 499 }
]

const ROWS: ReadonlyArray<InvoiceRow> = INVOICES.map((inv) => ({
  id: inv.id,
  number: inv.id,
  date: inv.date,
  amount: usd(inv.amount, 2),
  status: { tone: "success", label: "Betaald" }
}))

const offer = (tier: PlanTier): TierOffer => ({
  seats: TIERS[tier].seats,
  stores: TIERS[tier].stores,
  replies: TIERS[tier].replies,
  price: (cycle) => usd(priceFor(tier, cycle))
})

/** The account keeps the English country name; the invoice prints it in Dutch. */
const COUNTRY_NL: Record<string, string> = {
  Netherlands: "Nederland",
  Belgium: "België",
  Germany: "Duitsland",
  France: "Frankrijk",
  "United Kingdom": "Verenigd Koninkrijk",
  "United States": "Verenigde Staten"
}

/** A plain HTML invoice, named by its number, so the download is a real file the browser can open and print. */
function downloadInvoice(
  inv: (typeof INVOICES)[number],
  account: { legalEntity: string; vat: string; billingEmail: string; country: string }
) {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c] ?? c)
  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>${inv.id}</title>
<style>body{font:14px/1.6 system-ui,sans-serif;color:#111;max-width:640px;margin:48px auto;padding:0 24px}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px 0;text-align:left;font-variant-numeric:tabular-nums}th{color:#666;font-weight:500}tfoot td{font-weight:600}.r{text-align:right}.muted{color:#666}</style>
</head><body>
<h1>Factuur ${inv.id}</h1>
<p class="muted">Uitgegeven ${inv.date} · Betaald</p>
<p><strong>Gefactureerd aan</strong><br>${esc(account.legalEntity)}<br>Btw ${esc(account.vat)}<br>${
    esc(COUNTRY_NL[account.country] ?? account.country)
  }<br>${esc(account.billingEmail)}</p>
<p><strong>Van</strong><br>Insyte B.V.<br>Amsterdam, Nederland</p>
<table><thead><tr><th>Omschrijving</th><th class="r">Bedrag</th></tr></thead>
<tbody><tr><td>Insyte Scale-abonnement, maandelijks</td><td class="r">${usd(inv.amount, 2)}</td></tr></tbody>
<tfoot><tr><td>Totaal betaald</td><td class="r">${usd(inv.amount, 2)}</td></tr></tfoot></table>
<p class="muted">Afgeschreven van de opgeslagen kaart. Gemaakt door de Insyte-demo.</p>
</body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${inv.id}.html`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`${inv.id}.html gedownload`)
}

export function DemoBillingSource({ children }: { children: ReactNode }) {
  const plan = useSettings((s) => s.plan)
  const cycle = useSettings((s) => s.cycle)
  const cancelsOn = useSettings((s) => s.cancelsOn)
  const card = useSettings((s) => s.card)
  const setPlan = useSettings((s) => s.setPlan)
  const setCancelsOn = useSettings((s) => s.setCancelsOn)
  const setCard = useSettings((s) => s.setCard)
  const account = useWorkspace((s) => s.account)
  const seats = useSeats()
  const tier = TIERS[plan]

  const source: BillingSource = {
    plan,
    cycle,
    name: tier.name,
    pill: cancelsOn ? { tone: "warning", label: `Stopt op ${cancelsOn}` } : { tone: "success", label: "Actief" },
    line: `${usd(priceFor(plan, cycle))} per maand${
      cycle === "annual" ? ", jaarlijks gefactureerd" : ""
    } · ${tier.seats} plekken · ${tier.stores} ${tier.stores === 1 ? "winkel" : "winkels"} · ${
      cancelsOn ? `stopt ${cancelsOn}` : `verlengt ${RENEWAL}`
    }`,
    cancelling: cancelsOn !== null,
    cancellable: true,
    periodEnd: RENEWAL,
    afterEnd: "daarna is de werkruimte alleen-lezen",
    tiers: { starter: offer("starter"), growth: offer("growth"), scale: offer("scale") },
    changeNote: "De nieuwe prijs geldt vanaf je volgende verlenging. Jaarlijks betalen geeft twee maanden gratis.",
    usage: [
      { label: "Gebruikte plekken", value: seats.used, max: seats.total },
      { label: "Gekoppelde winkels", value: 4, max: tier.stores },
      { label: "AI-antwoorden (deze periode)", value: 1284, max: tier.replies },
      { label: "Actieve automatiseringen", value: 14, max: 50 }
    ],
    seats: { included: tier.seats, extra: seats.extra, free: seats.free, full: seats.full },
    card,
    invoices: ROWS,
    change: (ask) => {
      if (ask.kind === "plan") {
        const before = { plan, cycle }
        setPlan(ask.tier, ask.cycle)
        undoable(
          `Je hebt nu ${TIERS[ask.tier].name}, ${ask.cycle === "annual" ? "jaarlijks" : "maandelijks"} gefactureerd`,
          () => setPlan(before.plan, before.cycle)
        )
      } else {
        const n = ask.delta
        useTeam.getState().addSeats(n)
        undoable(
          n > 0 ? "Plek bijgekocht" : "Extra plek opgezegd",
          () => useTeam.getState().addSeats(-n),
          n > 0 ? "Je kunt meteen iemand uitnodigen." : undefined
        )
      }
      return Promise.resolve(true)
    },
    cancel: () => {
      setCancelsOn(RENEWAL)
      undoable(`${tier.name} stopt op ${RENEWAL}`, () => setCancelsOn(null), "Tot die tijd blijft alles werken.")
      return Promise.resolve(true)
    },
    resume: () => {
      setCancelsOn(null)
      toast.success(`${tier.name} blijft actief`)
      return Promise.resolve(true)
    },
    saveCard: (next) => {
      const before = card
      setCard(next)
      undoable(`${next.brand} eindigend op ${next.last4} is nu opgeslagen`, () => setCard(before))
    },
    openInvoice: (row) => {
      const inv = INVOICES.find((i) => i.id === row.id)
      if (inv !== undefined) downloadInvoice(inv, account)
    }
  }
  return <BillingSourceProvider value={source}>{children}</BillingSourceProvider>
}

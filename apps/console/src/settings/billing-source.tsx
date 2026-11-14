import { useAtomSet } from "@effect/atom-react"
import type {
  BillingOverview,
  BillingPlans,
  BillingPreview,
  Invoice,
  InvoicePage
} from "@insyte/modules/billing/domain/Billing"
import { ZONE } from "@insyte/ui/app/lib/format"
import type { BillingAsk, BillingSource, InvoiceRow, PlanTier, Tone } from "@insyte/ui/app/settings/billing-source"
import { Exit } from "effect"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { BILLING, billingWrites } from "../data/billing.ts"
import { TEAM } from "../data/team.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"

/*
 * Facturatie over `Billing.*` (M13 step 1). Every amount is Stripe's, in the currency of its prices; what a plan
 * includes is Insyte's. A plan or a seat is previewed first (`Billing.previewChange`) and confirmed with that amount,
 * made at the preview's second so Stripe charges what the page said; it is money, so there is no Ongedaan maken. The
 * first payment is made on Stripe's page and the subscription arrives by webhook; the card is changed in Stripe's
 * Customer Portal, never on a form of Insyte's.
 */

const NAMES: Record<PlanTier, string> = { starter: "Starter", growth: "Growth", scale: "Scale" }

const keys = { reactivityKeys: [...BILLING, ...TEAM] }

/** Minor units as nl-NL writes them: "€ 299" for a whole amount, "€ 12,34" otherwise. */
const money = (minor: number, currency: string) => {
  const whole = minor % 100 === 0
  return (minor / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2
  })
}

const date = (ms: number) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: ZONE, day: "numeric", month: "long", year: "numeric" }).format(ms)

const INVOICE_STATUS: Record<Invoice["status"], { tone: Tone; label: string }> = {
  paid: { tone: "success", label: "Betaald" },
  open: { tone: "warning", label: "Open" },
  draft: { tone: "neutral", label: "Concept" },
  uncollectible: { tone: "danger", label: "Onbetaald" },
  void: { tone: "neutral", label: "Vervallen" }
}

const rowOf = (inv: Invoice): InvoiceRow => ({
  id: inv.id,
  number: inv.number ?? "Concept",
  date: date(inv.issuedAt),
  amount: money(inv.amountMinor, inv.currency),
  status: INVOICE_STATUS[inv.status]
})

/** The plan card's pill and the end of its line, from where the subscription stands. */
const standing = (o: BillingOverview): { pill: { tone: Tone; label: string }; end: string } => {
  if (o.status === "trial") {
    return {
      pill: { tone: "info", label: "Proefperiode" },
      end: o.trialEndsAt === null ? "proefperiode" : `proefperiode tot ${date(o.trialEndsAt)}`
    }
  }
  const period = o.currentPeriodEnd === null ? null : date(o.currentPeriodEnd)
  if (o.cancelAt !== null) {
    return { pill: { tone: "warning", label: `Stopt op ${date(o.cancelAt)}` }, end: `stopt ${date(o.cancelAt)}` }
  }
  switch (o.status) {
    case "active":
    case "trialing":
      return { pill: { tone: "success", label: "Actief" }, end: period === null ? "actief" : `verlengt ${period}` }
    case "past_due":
    case "unpaid":
      return { pill: { tone: "danger", label: "Betaling mislukt" }, end: "werk je kaart bij" }
    case "incomplete":
      return { pill: { tone: "warning", label: "Betaling niet afgerond" }, end: "rond je eerste betaling af" }
    case "paused":
      return { pill: { tone: "neutral", label: "Gepauzeerd" }, end: "gepauzeerd" }
    default:
      return { pill: { tone: "neutral", label: "Opgezegd" }, end: "opgezegd" }
  }
}

/** The server's refusal of a billing change, said once in Dutch. */
const refused = (error: unknown) =>
  sayRefusal(error, {
    gone: "Er is nog geen abonnement",
    other: (tagged) => {
      switch (tagged._tag) {
        case "BillingUnavailable": {
          const [title, description] = tagged["reason"] === "not_configured"
            ? ["Facturatie is nog niet ingesteld", "Betalen kan hier nog niet. Neem contact op met Insyte."]
            : tagged["reason"] === "no_price"
            ? ["Dit abonnement is nog niet te koop", "Er staat nog geen prijs voor in Stripe."]
            : tagged["reason"] === "refused"
            ? ["Stripe weigerde de wijziging", "Probeer het zo nog eens, of neem contact op met Insyte."]
            : ["Stripe reageert niet", "Er is niets gewijzigd. Probeer het zo nog eens."]
          toast.error(title, { description })
          return true
        }
        case "NoSubscription":
          toast.error("Er is nog geen abonnement", { description: "Kies eerst een abonnement." })
          return true
        case "NoExtraSeats":
          toast.error("Geen extra plekken om op te zeggen", {
            description: "De plekken van je abonnement zelf kun je niet opzeggen."
          })
          return true
        case "SeatsExceedPlan":
          toast.error("Te weinig plekken", {
            description: `Je team gebruikt ${tagged["used"]} plekken; zo houd je er ${tagged["seats"]}.`
          })
          return true
        case "StoresExceedPlan":
          toast.error("Te veel winkels voor dit abonnement", {
            description: `Je hebt ${tagged["connected"]} winkels gekoppeld; dit abonnement past er ${tagged["stores"]}.`
          })
          return true
        default:
          return false
      }
    }
  })

/** What a preview says: what is charged now, or the first payment, and the next invoice. */
const quoteOf = (p: BillingPreview, ask: BillingAsk) => {
  if (p.kind === "checkout") {
    return `Je eerste betaling is ${money(p.amountDueMinor, p.currency)}, op de betaalpagina van Stripe.`
  }
  const next = p.nextInvoiceAt === null ? "" : ` op ${date(p.nextInvoiceAt)}`
  const now = p.prorationMinor > 0
    ? `${money(p.prorationMinor, p.currency)} naar rato voor de rest van deze periode`
    : p.prorationMinor < 0
    ? `${money(-p.prorationMinor, p.currency)} tegoed voor de rest van deze periode`
    : "Niets extra voor deze periode"
  const what = ask.kind === "seats" ? (ask.delta > 0 ? "Een plek erbij: " : "Een plek minder: ") : ""
  return `${what}${now}. Je volgende factuur${next} wordt ${money(p.nextInvoiceMinor, p.currency)}.`
}

const keyOf = (ask: BillingAsk) => JSON.stringify(ask)
const asInput = (ask: BillingAsk) =>
  ask.kind === "plan"
    ? { _tag: "plan" as const, plan: ask.tier, cycle: ask.cycle }
    : { _tag: "seats" as const, delta: ask.delta }

/** A change's answer: made (said), or the first payment, on Stripe's page. */
const landed = (exit: Exit.Exit<{ _tag: "changed" } | { _tag: "checkout"; url: string }, unknown>, said: string) => {
  if (Exit.isFailure(exit)) {
    refused(failureOf(exit))
    return false
  }
  if (exit.value._tag === "checkout") {
    location.assign(exit.value.url)
    return true
  }
  toast.success(said)
  return true
}

export function useConsoleBillingSource(
  overview: BillingOverview,
  plans: BillingPlans | null,
  firstPage: InvoicePage
): BillingSource {
  const preview = useAtomSet(billingWrites.preview, { mode: "promiseExit" })
  const changePlan = useAtomSet(billingWrites.changePlan, { mode: "promiseExit" })
  const addSeats = useAtomSet(billingWrites.addSeats, { mode: "promiseExit" })
  const removeSeats = useAtomSet(billingWrites.removeSeats, { mode: "promiseExit" })
  const cancel = useAtomSet(billingWrites.cancel, { mode: "promiseExit" })
  const resume = useAtomSet(billingWrites.resume, { mode: "promiseExit" })
  const portal = useAtomSet(billingWrites.portal, { mode: "promiseExit" })
  const invoices = useAtomSet(billingWrites.invoices, { mode: "promiseExit" })
  const invoiceUrl = useAtomSet(billingWrites.invoiceUrl, { mode: "promiseExit" })

  // The preview's second, per change: confirming it charges what it said.
  const quoted = useRef(new Map<string, number>())
  const [more, setMore] = useState<{ rows: ReadonlyArray<Invoice>; next: string | null }>({ rows: [], next: null })
  useEffect(() => setMore({ rows: [], next: null }), [firstPage])

  // Back from Stripe's page: paid, and the subscription follows as soon as Stripe says so.
  useEffect(() => {
    const url = new URL(location.href)
    if (url.searchParams.get("betaald") !== "1") return
    toast.success("Betaling ontvangen", { description: "Je abonnement staat hier zodra Stripe het bevestigt." })
    url.searchParams.delete("betaald")
    history.replaceState(history.state, "", url)
  }, [])

  const currency = plans?.currency ?? "eur"
  const plan: PlanTier | null = overview.plan
  const offerOf = (tier: PlanTier) => {
    const p = plans?.plans.find((x) => x.plan === tier)
    return {
      seats: p?.seats ?? 0,
      stores: p?.stores ?? 0,
      replies: p?.aiReplies ?? 0,
      price: (cycle: "monthly" | "annual") => {
        const minor = cycle === "annual" ? p?.annualMinor : p?.monthlyMinor
        return minor === null || minor === undefined
          ? null
          : money(cycle === "annual" ? Math.round(minor / 12) : minor, currency)
      }
    }
  }
  const tiers = { starter: offerOf("starter"), growth: offerOf("growth"), scale: offerOf("scale") }
  const { pill, end } = standing(overview)
  const offer = plan === null ? null : tiers[plan]
  const price = offer?.price(overview.cycle) ?? null
  const live = overview.status !== "trial" && overview.status !== "canceled" &&
    overview.status !== "incomplete_expired"
  const line = [
    price === null
      ? null
      : `${price} per maand${overview.cycle === "annual" ? ", jaarlijks gefactureerd" : ""}${
        live ? "" : " na je proefperiode"
      }`,
    `${overview.seats.included} plekken`,
    `${overview.usage.stores.max} ${overview.usage.stores.max === 1 ? "winkel" : "winkels"}`,
    end
  ].filter((part) => part !== null).join(" · ")

  return {
    plan,
    cycle: overview.cycle,
    name: plan === null ? "Proefperiode" : NAMES[plan],
    pill,
    line,
    cancelling: live && overview.cancelAt !== null,
    cancellable: live,
    periodEnd: overview.currentPeriodEnd === null ? "het einde van deze periode" : date(overview.currentPeriodEnd),
    afterEnd: "daarna wordt er niets meer afgeschreven",
    tiers,
    changeNote: live
      ? "Een ander abonnement gaat meteen in. Het verschil voor de rest van deze periode staat op je volgende factuur."
      : "Je betaalt de eerste periode op de betaalpagina van Stripe. Jaarlijks betalen geeft twee maanden gratis.",
    usage: [
      { label: "Gebruikte plekken", value: overview.seats.used, max: overview.seats.total },
      { label: "Gekoppelde winkels", value: overview.usage.stores.value, max: overview.usage.stores.max },
      {
        label: "AI-antwoorden (deze periode)",
        value: overview.usage.aiReplies.value,
        max: overview.usage.aiReplies.max
      },
      {
        label: "Actieve automatiseringen",
        value: overview.usage.activeAutomations.value,
        max: overview.usage.activeAutomations.max
      }
    ],
    seats: {
      included: overview.seats.included,
      extra: overview.seats.extra,
      free: overview.seats.free,
      full: overview.seats.full
    },
    card: overview.card,
    invoices: [...firstPage.rows, ...more.rows].map(rowOf),
    ...((more.rows.length === 0 ? firstPage.next : more.next) === null ? {} : {
      moreInvoices: () => {
        const cursor = more.rows.length === 0 ? firstPage.next : more.next
        void invoices({ payload: { cursor } }).then((exit) => {
          if (Exit.isFailure(exit)) return refused(failureOf(exit))
          setMore((m) => ({ rows: [...m.rows, ...exit.value.rows], next: exit.value.next }))
        })
      }
    }),
    quote: async (ask) => {
      const exit = await preview({ payload: asInput(ask) })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return null
      }
      quoted.current.set(keyOf(ask), exit.value.prorationDate)
      return quoteOf(exit.value, ask)
    },
    change: async (ask) => {
      const prorationDate = quoted.current.get(keyOf(ask))
      if (ask.kind === "plan") {
        const exit = await changePlan({ payload: { plan: ask.tier, cycle: ask.cycle, prorationDate }, ...keys })
        return landed(
          exit,
          `Je hebt nu ${NAMES[ask.tier]}, ${ask.cycle === "annual" ? "jaarlijks" : "maandelijks"} gefactureerd`
        )
      }
      const payload = { n: Math.abs(ask.delta), prorationDate }
      const exit = ask.delta > 0 ? await addSeats({ payload, ...keys }) : await removeSeats({ payload, ...keys })
      return landed(exit, ask.delta > 0 ? "Plek bijgekocht" : "Extra plek opgezegd")
    },
    cancel: async (reason, note) => {
      const exit = await cancel({ payload: { reason, ...(note.trim() === "" ? {} : { note: note.trim() }) }, ...keys })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return false
      }
      const at = exit.value.cancelAt === null ? "het einde van deze periode" : date(exit.value.cancelAt)
      toast.success(`${plan === null ? "Je abonnement" : NAMES[plan]} stopt op ${at}`, {
        description: "Tot die tijd blijft alles werken."
      })
      return true
    },
    resume: async () => {
      const exit = await resume({ payload: undefined, ...keys })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return false
      }
      toast.success(`${plan === null ? "Je abonnement" : NAMES[plan]} blijft actief`)
      return true
    },
    openCardPage: () => {
      void portal({ payload: undefined }).then((exit) => {
        if (Exit.isFailure(exit)) return refused(failureOf(exit))
        location.assign(exit.value.url)
      })
    },
    openInvoice: (row) => {
      // Opened on the click, so the browser does not block it, and pointed at Stripe's PDF once its link is known.
      const tab = window.open("", "_blank")
      if (tab !== null) tab.opener = null
      void invoiceUrl({ payload: { id: row.id } }).then((exit) => {
        if (Exit.isFailure(exit)) {
          tab?.close()
          return refused(failureOf(exit))
        }
        if (tab === null) location.assign(exit.value.url)
        else tab.location.href = exit.value.url
      })
    }
  }
}

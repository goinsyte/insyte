import { useState, useSyncExternalStore } from "react"
import { formatValue } from "../../charts/format.ts"
import type { BlockId } from "../../fixtures/analytics.ts"
import { CHARGEBACKS } from "../../fixtures/chargebacks.ts"
import { getProductState, setProductState } from "../../fixtures/products.ts"
import { customer, product, supplier } from "../../fixtures/records.ts"
import { DEMO_NOW, ME } from "../../fixtures/workspace.ts"
import { navigate, paths } from "../../router.tsx"
import { cx } from "../../ui/cx.ts"
import { ChevronDown, ChevronRight } from "../../ui/icons.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Proposal } from "../../ui/proposal.tsx"
import type { ProposalState } from "../../ui/proposal.tsx"
import { dismissToast, toast } from "../../ui/toast.tsx"
import { createDraft, remove as removeFlow } from "../automations/store.ts"
import { createTicket, dropTickets, nowClock } from "../inbox/store.ts"
import { agg, blocksOf, CATS, eventsOf, lengthOf } from "./model.ts"
import type { Ctx } from "./model.ts"

/*
 * What Magnus read in the period, heaviest first: one sentence each, the number it is about one click
 * away, and where there is something to do, the proposal that does it. Filing changes the workspace
 * (a supplier ticket in the inbox, a product's ads paused, an automation drafted) and can be taken
 * back, from the proposal and from its toast. Nothing is sent and nothing switches on by itself.
 */

/** What filing did, and how to take it back. */
type Effect = { readonly undo: () => void; readonly title: string; readonly body: string; readonly to: string }

type Spec = {
  /** The same proposal, whatever the period: deciding it once decides it everywhere. */
  readonly id: string
  readonly title: string
  readonly body: string
  readonly read: ReadonlyArray<string>
  readonly where: string
  readonly draft?: string
  readonly apply: (edit: string | undefined) => Effect
}

type Finding = {
  readonly id: string
  readonly tone: "good" | "bad" | "neutral"
  readonly metric: string
  readonly headline: string
  /** The explanation the sentence opens. */
  readonly explain: string
  /** The blocks it is about: a board that shows one of them lists it first. */
  readonly blocks: ReadonlyArray<BlockId>
  readonly weight: number
  readonly proposal?: Spec
  readonly link?: { readonly label: string; readonly to: string }
}

/* ── what was decided, for the visit ───────────────────────────────────────────────────────────── */

type Decision = {
  readonly state: ProposalState
  readonly at?: number
  readonly edit?: string
  readonly undo?: () => void
  /** The toast that offers the undo, taken away once it is undone. */
  readonly toastId?: number
  /** Where what filing made can be seen. */
  readonly to?: string
}

let decisions: Readonly<Record<string, Decision>> = {}
const listeners = new Set<() => void>()
const setDecision = (id: string, next: Decision) => {
  decisions = { ...decisions, [id]: next }
  for (const l of listeners) l()
}
const useDecisions = () =>
  useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => decisions)

function decide(spec: Spec, next: ProposalState) {
  const was = decisions[spec.id] ?? { state: "open" as const }
  if (next === was.state) return
  if (was.state === "done") {
    was.undo?.()
    if (was.toastId !== undefined) dismissToast(was.toastId)
  }
  if (next === "done") {
    const effect = spec.apply(was.edit)
    const toastId = toast({
      title: effect.title,
      body: effect.body,
      tone: "good",
      duration: 10_000,
      action: { label: "Ongedaan maken", onClick: () => decide(spec, "open") }
    })
    setDecision(spec.id, { ...was, state: "done", at: Date.now(), undo: effect.undo, to: effect.to, toastId })
    return
  }
  setDecision(spec.id, { state: next, ...(was.edit === undefined ? {} : { edit: was.edit }) })
}

/* ── the proposals ─────────────────────────────────────────────────────────────────────────────── */

function pauseAds(productId: string): Spec {
  const name = product(productId)?.name ?? productId
  return {
    id: `advertenties:${productId}`,
    title: `Meta-advertenties voor de ${name} pauzeren`,
    body:
      "Zolang de maat niet klopt, levert elke advertentie vooral terugbetalingen op. Organische verkoop en Klaviyo lopen door; zet je ze terug, dan draaien ze weer.",
    read: ["Terugbetalingen per product", "Retourformulieren", "Meta-campagnes"],
    where: `Producten · ${name}`,
    apply: () => {
      const before = getProductState().edits[productId]?.adsPaused === true
      const set = (adsPaused: boolean) =>
        setProductState((s) => ({ ...s, edits: { ...s.edits, [productId]: { ...s.edits[productId], adsPaused } } }))
      set(true)
      return {
        undo: () => set(before),
        title: `Advertenties voor de ${name} gepauzeerd`,
        body: "Organische verkoop en Klaviyo lopen door.",
        to: paths.product(productId)
      }
    }
  }
}

function supplierTicket(supplierId: string, ctx: Ctx, late: number, lead: number): Spec {
  const s = supplier(supplierId)
  const name = s?.name ?? supplierId
  const first = name.split(" ")[0] ?? name
  const draft =
    `Hoi ${first}-team,\n\nIn ${ctx.label} kwamen ${late} van onze pakketten na de beloofde 5 dagen aan; gemiddeld waren ze ${
      lead.toLocaleString("nl-NL")
    } dagen onderweg. Klanten vragen ernaar en een deel vraagt zijn geld terug.\n\nKunnen jullie voor vrijdag laten weten wat er speelt en vanaf wanneer het weer binnen 5 dagen lukt?\n\nGroet,\n${ME.name}`
  return {
    id: `leverancier:${supplierId}`,
    title: `Ticket voor ${name} openen over de levertijden`,
    body:
      `${name} haalt de belofte van 5 dagen niet. Het ticket komt in Nieuw met het bericht hieronder; het gaat pas naar ${name} als iemand het verstuurt.`,
    read: ["Track & trace", "Levertijd per leverancier", "Te late pakketten"],
    where: "Inbox · Tickets",
    draft,
    apply: (edit) => {
      const number = createTicket({
        customerId: "",
        handle: s?.email ?? name,
        subject: `Levertijden ${name}: ${late} pakketten te laat`,
        channel: "email",
        status: "nieuw",
        priority: "hoog",
        assignee: "elena",
        labels: ["Leverancier", "Levering"],
        also: { kind: "supplier", id: supplierId, label: name },
        createdAt: nowClock(),
        unread: false,
        entries: [
          {
            kind: "event",
            at: nowClock(),
            text: `Magnus maakte het ticket vanuit Analyse, op verzoek van ${ME.name}.`
          },
          { kind: "note", who: "elena", at: nowClock(), text: edit ?? draft }
        ]
      })
      return {
        undo: () => dropTickets([number]),
        title: `Ticket #${number} voor ${name} staat in Nieuw`,
        body: "Het wacht tot iemand het verstuurt.",
        to: paths.ticket(number)
      }
    }
  }
}

const DAY_FIVE = "levertijd-dag-5"

function draftAutomation(): Spec {
  return {
    id: `automatisering:${DAY_FIVE}`,
    title: "Concept maken: levertijd-update op dag 5",
    body:
      "Een update op dag vijf beantwoordt ‘waar blijft mijn bestelling?’ voordat iemand het vraagt. Het concept staat bij Automatiseringen en draait pas als je het aanzet.",
    read: ["Tickets per weekdag", "Onderwerpen van de tickets", "Bestellingen onderweg"],
    where: "Automatiseringen",
    apply: () => {
      const id = createDraft(DAY_FIVE)
      return {
        undo: () => removeFlow(id),
        title: "Concept ‘Levertijd-update op dag 5’ staat klaar",
        body: "Het draait pas als je het aanzet.",
        to: paths.automation(id)
      }
    }
  }
}

/* ── the findings of a period ──────────────────────────────────────────────────────────────────── */

const n = (v: number) => v.toLocaleString("nl-NL")
const at = (label: string) => `in ${label}`

function findingsOf(ctx: Ctx): ReadonlyArray<Finding> {
  const A = agg(ctx.cur)
  const B = ctx.cmp === null ? null : agg(ctx.cmp)
  const out: Array<Finding> = []

  // A product that carries the refunds.
  const top = A.byProduct.indexOf(Math.max(...A.byProduct.slice(0, 4)))
  const topN = A.byProduct[top] ?? 0
  if (A.refunds >= 8 && topN / A.refunds >= 0.35) {
    const id = CATS.products[top] ?? ""
    const small = eventsOf(ctx.cur).refunds.filter((r) => r.product === top && r.reason === 0).length
    out.push({
      id: "terugbetalingen-product",
      tone: "bad",
      metric: "Terugbetalingen",
      headline: `De ${product(id)?.name ?? ""} telt ${n(topN)} van de ${n(A.refunds)} terugbetalingen${
        B === null ? "" : `, tegen ${n(B.byProduct[top] ?? 0)} ${at(ctx.cmpLabel)}`
      }; ${n(small)} om ‘valt te klein’.`,
      explain: `i.terugbetalingenPerProduct.${top}`,
      blocks: ["terugbetalingenPerProduct", "retourredenen", "retourPerProduct", "retourcijfers", "kerncijfers"],
      weight: 3 + topN / A.refunds,
      proposal: pauseAds(id)
    })
  }

  // A supplier past its promise.
  const slow = A.leadBySupplier.indexOf(Math.max(...A.leadBySupplier))
  const lead = A.leadBySupplier[slow] ?? 0
  const lateN = A.lateBySupplier[slow] ?? 0
  const s = CATS.suppliers[slow]
  if (s !== undefined && lead > 5 && lateN >= 5) {
    const name = supplier(s.id)?.name ?? s.label
    out.push({
      id: "leverancier-te-laat",
      tone: "bad",
      metric: "Levertijd",
      headline: `${name} haalde de belofte van 5 dagen niet: gemiddeld ${
        formatValue(lead, "days").replace(" d", " dagen")
      } onderweg, ${n(lateN)} van de ${n(A.late)} te late pakketten.`,
      explain: `i.levertijd.${slow}`,
      blocks: ["levertijd", "teLaatPerLand", "bezorging"],
      weight: 2.5 + lead / 10,
      proposal: supplierTicket(s.id, ctx, lateN, lead)
    })
  }

  // Mondays carry the weekend.
  const monday = A.tickets === 0 ? 0 : (A.ticketsByWeekday[0] ?? 0) / A.tickets
  if (lengthOf(ctx.cur) >= 7 && monday >= 0.17) {
    out.push({
      id: "tickets-maandag",
      tone: "neutral",
      metric: "Klantenservice",
      headline: `Maandag bracht ${
        Math.round(monday * 100)
      }% van de vragen: wat in het weekend bleef liggen, vooral over waar een bestelling blijft.`,
      explain: "i.ticketsPerDag.0",
      blocks: ["ticketsPerDag", "klantenservice"],
      weight: 1.5 + monday,
      proposal: draftAutomation()
    })
  }

  // Revenue that moved.
  if (B !== null && B.revenue > 0) {
    const change = A.revenue / B.revenue - 1
    if (Math.abs(change) >= 0.05) {
      const volume = (A.orders - B.orders) * (B.orders === 0 ? 0 : B.revenue / B.orders)
      const basket = A.revenue - B.revenue - volume
      out.push({
        id: "omzet",
        tone: change > 0 ? "good" : "bad",
        metric: "Omzet",
        headline: `De omzet ${change > 0 ? "steeg" : "daalde"} ${
          Math.abs(Math.round(change * 1000) / 10).toLocaleString("nl-NL")
        }% naar ${formatValue(A.revenue, "euro")}: ${
          Math.abs(volume) >= Math.abs(basket)
            ? `vooral ${A.orders >= B.orders ? "meer" : "minder"} bestellingen`
            : `vooral een ${basket > 0 ? "hoger" : "lager"} bedrag per bestelling`
        }.`,
        explain: "f.kerncijfers.0",
        blocks: ["kerncijfers", "omzetPerDag", "bestellingenPerDag", "perWinkel"],
        weight: 1 + Math.abs(change)
      })
    }
  }

  // A dispute with a deadline coming.
  const now = DEMO_NOW.date.getTime()
  const due = CHARGEBACKS.filter((c) =>
    c.status === "wacht-op-bewijs" && c.dueAt > now &&
    eventsOf(ctx.cur).disputes.some((d) => d.id === c.id)
  ).toSorted((a, b) => a.dueAt - b.dueAt)[0]
  if (due !== undefined) {
    const when = new Date(due.dueAt)
    const days = Math.round(
      (new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime() -
        new Date(2026, 10, 23).getTime()) / 86_400_000
    )
    const clock = `${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")}`
    out.push({
      id: "geschil-termijn",
      tone: "bad",
      metric: "Geschillen",
      headline: `${due.id} van ${customer(due.customerId)?.name ?? "een klant"} (${
        formatValue(due.amount, "euro")
      }) moet ${days === 1 ? "morgen" : days === 0 ? "vandaag" : `over ${days} dagen`} ${clock} beantwoord zijn.`,
      explain: `i.geschillenPerReden.${reasonAt(ctx, due.reason)}`,
      blocks: ["geschillenPerReden", "betaalmethode"],
      weight: 2.8,
      link: { label: "Geschil openen", to: paths.chargeback(due.id) }
    })
  }

  return out.toSorted((a, b) => b.weight - a.weight)
}

/** Where a dispute reason sits in the period's "Waarom betwisten klanten" block. */
function reasonAt(ctx: Ctx, reason: string): number {
  const block = blocksOf(ctx).geschillenPerReden
  return block.kind === "rank" ? Math.max(0, block.data.items.findIndex((x) => x.label === reason)) : 0
}

/* ── the section ───────────────────────────────────────────────────────────────────────────────── */

const DOT = { good: "bg-good-ink", bad: "bg-bad-ink", neutral: "bg-ink-4" } as const
const TONE_WORD = { good: "goed nieuws", bad: "verdient aandacht", neutral: "om te weten" } as const

export function Findings({ ctx, onBoard, onExplain, canEdit }: {
  readonly ctx: Ctx
  /** The blocks on this board: findings about them come first. */
  readonly onBoard: ReadonlySet<BlockId>
  readonly onExplain: (key: string) => void
  /** A role that may only read Analyse sees the findings without their proposals. */
  readonly canEdit: boolean
}) {
  const chosen = useDecisions()
  const [more, setMore] = useState(false)
  const all = findingsOf(ctx)
  const ordered = [
    ...all.filter((f) => f.blocks.some((b) => onBoard.has(b))),
    ...all.filter((f) => !f.blocks.some((b) => onBoard.has(b)))
  ]
  if (ordered.length === 0) {
    return (
      <section aria-labelledby="gevonden" className="flex flex-col gap-2">
        <Heading />
        <p className="text-sm text-ink-2">Niets dat opvalt {at(ctx.label)}: de cijfers bewegen binnen wat gewoon is.</p>
      </section>
    )
  }
  const lead = ordered.slice(0, 3)
  const rest = ordered.slice(3)
  const shown = more ? ordered : lead
  let primary = true

  return (
    <section aria-labelledby="gevonden" className="flex flex-col gap-5">
      <Heading />
      <ol className="grid gap-x-12 gap-y-8 lg:grid-cols-3">
        {shown.map((f) => {
          const decision = f.proposal === undefined ? undefined : chosen[f.proposal.id]
          const state = decision?.state ?? "open"
          const isPrimary = primary && state === "open" && f.proposal !== undefined
          if (isPrimary) primary = false
          return (
            <li key={f.id} className="flex min-w-0 flex-col gap-3">
              <button
                type="button"
                onClick={() => onExplain(f.explain)}
                className="group -mx-2 flex flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="flex items-center gap-2 text-xs text-ink-3">
                  <span aria-hidden="true" className={cx("size-1.5 rounded-full", DOT[f.tone])} />
                  {f.metric}
                  <span className="sr-only">, {TONE_WORD[f.tone]}</span>
                </span>
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm text-pretty text-ink">{f.headline}</span>
                  <ChevronRight
                    size={15}
                    className="mt-0.5 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2"
                  />
                </span>
              </button>
              {f.proposal !== undefined && canEdit && (
                <FindingProposal
                  spec={f.proposal}
                  state={state}
                  primary={isPrimary}
                  {...(decision?.at === undefined ? {} : { at: decision.at })}
                  {...(decision?.edit === undefined ? {} : { edit: decision.edit })}
                  {...(state === "done" && decision?.to !== undefined ? { to: decision.to } : {})}
                />
              )}
              {f.link !== undefined && (
                <button
                  type="button"
                  onClick={() => navigate(f.link?.to ?? paths.home)}
                  className="self-start text-xs font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  {f.link.label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {rest.length > 0 && (
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
          className="-mx-2 flex items-center gap-1 self-start rounded-sm px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink"
        >
          {more ? "Minder bevindingen" : `Nog ${rest.length} ${rest.length === 1 ? "bevinding" : "bevindingen"}`}
          <ChevronDown size={13} className={cx("transition-transform", more && "rotate-180")} />
        </button>
      )}
    </section>
  )
}

function Heading() {
  return (
    <h2 id="gevonden" className="flex items-center gap-2 text-sm font-semibold text-ink">
      <MagnusMark size={16} />
      Wat Magnus vond
    </h2>
  )
}

function FindingProposal({ spec, state, primary, at: decidedAt, edit, to }: {
  readonly spec: Spec
  readonly state: ProposalState
  readonly primary: boolean
  readonly at?: number
  readonly edit?: string
  readonly to?: string
}) {
  return (
    <div className="flex flex-col gap-1 pl-2">
      <Proposal
        from={<span className="text-ink-3">Voorstel</span>}
        title={spec.title}
        body={spec.body}
        read={spec.read}
        where={spec.where}
        {...(spec.draft === undefined ? {} : { draft: spec.draft })}
        state={state}
        onChange={(next) => decide(spec, next)}
        primary={primary}
        doneBy={ME.name}
        {...(decidedAt === undefined ? {} : { decidedAt })}
        fold
        {...(edit === undefined ? {} : { edit })}
        onEdit={(text) => {
          const was = decisions[spec.id] ?? { state: "open" as const }
          setDecision(spec.id, { ...was, ...(text === undefined ? { edit: undefined } : { edit: text }) })
        }}
      />
      {to !== undefined && (
        <button
          type="button"
          onClick={() => navigate(to)}
          className="inline-flex min-h-8 items-center self-start text-xs font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          Bekijken
        </button>
      )}
    </div>
  )
}

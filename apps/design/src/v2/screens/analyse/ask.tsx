import { useEffect, useState } from "react"
import { RankChart } from "../../charts/rank-chart.tsx"
import type { BarData } from "../../charts/types.ts"
import { product } from "../../fixtures/records.ts"
import { navigate, paths } from "../../router.tsx"
import { Thinking } from "../../ui/assistant.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { ArrowUpRight, CornerDownLeft, MessageSquare, X } from "../../ui/icons.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { explain } from "./explain.ts"
import { agg, blocksOf, CATS } from "./model.ts"
import type { Ctx } from "./model.ts"

/*
 * Ask about the numbers, on the board: one field, and the answer under it, worked out from the same
 * days as every block (`model.ts`) for the board's period. An answer says how many orders it read
 * and opens them; change the period and the answer is worked out again. What the board cannot answer
 * goes to a conversation with Magnus, who can look further.
 */

const SUGGESTED = [
  "Waarom kwamen er meer terugbetalingen?",
  "Welke leverancier levert te laat?",
  "Hoe kwam de omzet tot stand?",
  "Wanneer komen de meeste vragen binnen?",
  "Waar haken bezoekers af?"
] as const

type Answer = {
  readonly text: string
  readonly chart?: { readonly title: string; readonly data: BarData }
  /** The explanation behind the answer, and how many orders it counts. */
  readonly open?: { readonly key: string; readonly count: number | null }
}

const argmax = (xs: ReadonlyArray<number>) => xs.indexOf(Math.max(...xs))
const has = (q: string, ...words: ReadonlyArray<string>) => words.some((w) => q.includes(w))

/** Which explanation a question is about, by what it names; `null` when the board cannot tell. */
function keyFor(ctx: Ctx, question: string): string | "funnel" | null {
  const q = question.toLowerCase()
  const A = agg(ctx.cur)
  const productAt = CATS.products.findIndex((id, k) =>
    k < 4 && has(q, (product(id)?.name ?? "").split(" ")[0]?.toLowerCase() ?? "-")
  )
  if (productAt >= 0) return `i.terugbetalingenPerProduct.${productAt}`
  const supplierAt = CATS.suppliers.findIndex((s) => has(q, s.label.toLowerCase(), s.id.split("-")[0] ?? "-"))
  if (supplierAt >= 0) return `i.levertijd.${supplierAt}`
  const carrierAt = CATS.carriers.findIndex((c) => has(q, c.toLowerCase()))
  if (carrierAt >= 0) return `i.perVervoerder.${carrierAt}`
  if (has(q, "conversie", "bezoek", "afhak", "haken", "trechter", "winkelwagen")) return "funnel"
  if (has(q, "geschil", "chargeback", "betwist")) {
    return `i.geschillenPerReden.${argmax(A.disputesByReason.slice(0, 3))}`
  }
  if (has(q, "reden", "waarom") && has(q, "terug", "retour")) return `i.retourredenen.${argmax(A.byReason)}`
  if (has(q, "terug", "retour", "refund")) return "f.kerncijfers.2"
  if (has(q, "land", "belgi", "duitsland", "frankrijk", "nederland")) {
    return `i.teLaatPerLand.${argmax(A.lateByCountry)}`
  }
  if (has(q, "leverancier")) return `i.levertijd.${argmax(A.leadBySupplier)}`
  if (has(q, "laat", "levertijd", "lever", "bezorg", "pakket", "onderweg")) return "f.bezorging.1"
  if (has(q, "wanneer", "welke dag", "drukst") && has(q, "ticket", "vraag", "vragen", "klantenservice")) {
    return `i.ticketsPerDag.${argmax(A.ticketsByWeekday)}`
  }
  if (has(q, "ticket", "vraag", "vragen", "klantenservice", "reactie", "support")) return "f.klantenservice.0"
  if (has(q, "betaal", "klarna", "ideal", "paypal", "winkel")) return "f.kerncijfers.1"
  if (has(q, "omzet", "verkoop", "verkocht", "verdien", "opbrengst", "geld")) return "f.kerncijfers.0"
  if (has(q, "bestelling", "order")) return "f.kerncijfers.1"
  return null
}

function answerOf(ctx: Ctx, question: string): Answer | null {
  const key = keyFor(ctx, question)
  if (key === null) return null
  if (key === "funnel") {
    const block = blocksOf(ctx).conversie
    if (block.kind !== "funnel") return null
    const steps = block.data.steps
    const losses = steps.map((s, i) => (i === 0 ? 0 : 1 - s.value / (steps[i - 1]?.value ?? 1)))
    const worst = argmax(losses)
    const from = steps[worst - 1]
    const to = steps[worst]
    const paid = steps.at(-1)?.value ?? 0
    const visits = steps[0]?.value ?? 1
    return {
      text: `Van de ${visits.toLocaleString("nl-NL")} bezoeken in ${ctx.label} eindigden er ${
        paid.toLocaleString("nl-NL")
      } in een betaalde bestelling (${
        ((paid / visits) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })
      }%). De grootste uitval zit tussen ${from?.label.toLowerCase() ?? ""} en ${to?.label.toLowerCase() ?? ""}: ${
        Math.round((losses[worst] ?? 0) * 100)
      }% haakt daar af.`,
      chart: {
        title: "Bezoekers per stap",
        data: { items: steps.map((s) => ({ label: s.label, value: s.value })), format: "count", focus: worst }
      }
    }
  }
  const e = explain(ctx, key)
  if (e === null) return null
  const chart = e.breakdown !== undefined && e.breakdown.data.items.length > 1
    ? e.breakdown
    : e.drivers.length > 1
    ? {
      title: e.driversTitle,
      data: {
        items: e.drivers.filter((d) => d.value > 0).map((d) => ({ label: d.label, value: d.value })),
        format: "count" as const
      }
    }
    : undefined
  return {
    text: e.reading,
    ...(chart === undefined || chart.data.items.length === 0 ? {} : { chart }),
    open: { key, count: e.rows === null ? null : e.rows.list().length }
  }
}

export function Ask({ ctx, onExplain }: { readonly ctx: Ctx; readonly onExplain: (key: string) => void }) {
  const [q, setQ] = useState("")
  const [focused, setFocused] = useState(false)
  const [asked, setAsked] = useState<ReadonlyArray<{ readonly id: number; readonly question: string }>>([])
  const [next, setNext] = useState(1)

  const submit = (text: string) => {
    const t = text.trim()
    if (t === "") return
    setAsked([{ id: next, question: t }, ...asked].slice(0, 2))
    setNext(next + 1)
    setQ("")
    setFocused(false)
  }

  return (
    <section aria-label="Vraag over deze cijfers" className="flex max-w-3xl flex-col gap-5">
      <div className="relative">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit(q)
          }}
          className="ai-ring flex h-11 items-center gap-2.5 rounded-lg pr-1.5 pl-3 shadow-xs"
        >
          <MagnusMark size={18} />
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setFocused(true)
            }}
            onFocus={() => setFocused(true)}
            onClick={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={`Vraag iets over ${ctx.label}`}
            aria-label="Vraag iets over deze cijfers"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
          {q.trim() !== "" && (
            <IconButton label="Vragen" size="sm" type="submit">
              <CornerDownLeft />
            </IconButton>
          )}
        </form>
        {focused && q === "" && (
          <ul
            aria-label="Vragen om mee te beginnen"
            className="absolute top-full left-0 z-20 mt-1.5 flex w-[min(22rem,100%)] flex-col rounded-md bg-canvas p-1 shadow-pop ring-1 ring-line"
          >
            {SUGGESTED.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    submit(s)
                  }}
                  className="flex min-h-8 w-full items-center rounded-sm px-2.5 py-1.5 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {asked.map((a) => (
        <AnswerView
          key={a.id}
          ctx={ctx}
          question={a.question}
          onExplain={onExplain}
          onDismiss={() => setAsked(asked.filter((x) => x.id !== a.id))}
        />
      ))}
    </section>
  )
}

function AnswerView({ ctx, question, onExplain, onDismiss }: {
  readonly ctx: Ctx
  readonly question: string
  readonly onExplain: (key: string) => void
  readonly onDismiss: () => void
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const timer = window.setTimeout(() => setReady(true), still ? 0 : 900)
    return () => window.clearTimeout(timer)
  }, [])
  const answer = answerOf(ctx, question)
  const count = answer?.open?.count ?? null

  return (
    <article aria-label={question} className="flex animate-rise flex-col gap-3">
      <header className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-sm font-medium text-ink">{question}</h3>
        <IconButton label="Antwoord sluiten" size="sm" onClick={onDismiss}>
          <X />
        </IconButton>
      </header>
      {!ready
        ? <Thinking label="Magnus rekent het na…" />
        : answer === null
        ? (
          <div className="flex flex-col items-start gap-2">
            <p className="flex items-start gap-2.5 text-sm text-pretty text-ink-2">
              <span className="mt-0.5">
                <MagnusMark size={16} />
              </span>
              Dat staat niet in de cijfers van dit bord. In een gesprek kan Magnus verder zoeken, in je bestellingen,
              tickets en leveranciers.
            </p>
            <Button size="sm" icon={<MessageSquare />} onClick={() => navigate(paths.newChat(question))}>
              Vraag het Magnus
            </Button>
          </div>
        )
        : (
          <>
            <p className="flex items-start gap-2.5 text-sm text-pretty text-ink">
              <span className="mt-0.5">
                <MagnusMark size={16} />
              </span>
              <span className="min-w-0 flex-1">{answer.text}</span>
            </p>
            {answer.chart !== undefined && (
              <figure className="flex max-w-md flex-col gap-2 pl-6">
                <figcaption className="text-2xs text-ink-3">{answer.chart.title}</figcaption>
                <RankChart data={answer.chart.data} />
              </figure>
            )}
            <div className="flex flex-wrap items-center gap-1 pl-4">
              {answer.open !== undefined && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowUpRight />}
                  onClick={() => onExplain(answer.open?.key ?? "")}
                >
                  {count === null || count === 0
                    ? "Uitleg openen"
                    : count === 1
                    ? "Bekijk de bestelling"
                    : `Bekijk de ${count.toLocaleString("nl-NL")} bestellingen`}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={<MessageSquare />}
                onClick={() => navigate(paths.newChat(`${question} (${ctx.label})`))}
              >
                Vraag door in een gesprek
              </Button>
            </div>
            <p className="pl-6 text-2xs text-ink-3">
              Uitgerekend uit {readCount(ctx).toLocaleString("nl-NL")} bestellingen van {ctx.label}
              {ctx.cmpLabel === "" ? "" : ` en ${ctx.cmpLabel}`}.
            </p>
          </>
        )}
    </article>
  )
}

/** The orders an answer read: the period's, and the comparison's. */
const readCount = (ctx: Ctx) => agg(ctx.cur).orders + (ctx.cmp === null ? 0 : agg(ctx.cmp).orders)

import { Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet"
import { ArrowUpRight, Sparkle, X } from "../../icons"
import { toTokens } from "../lib/analytics/ask"
import { money } from "../lib/analytics/engine"
import { COUNTRY_NAME, type HistOrder, REFUND_REASON_LABEL, STORE_NAME } from "../lib/analytics/history"
import { cn } from "../lib/utils"
import { useAnalytics } from "../stores/analytics-store"
import { Drivers } from "./drivers"
import { useWriting } from "./writing"

/**
 * A number, explained: the figure and what it is compared with, Insyte's reading of it, what moved
 * it, and the orders it counts — every one of them, a page at a time. This is where "every figure
 * traceable to where it came from" is kept.
 */
export function ExplainDrawer() {
  const e = useAnalytics((s) => s.explaining)
  const close = useAnalytics((s) => s.explain)
  return (
    <Sheet open={e !== null} onOpenChange={(v) => !v && close(null)}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-paper p-0 sm:max-w-[560px]">
        {e ? <Body key={`${e.title}:${e.value}:${e.compare}`} onClose={() => close(null)} /> : null}
      </SheetContent>
    </Sheet>
  )
}

const PAGE = 40

function Body({ onClose }: { onClose: () => void }) {
  const e = useAnalytics((s) => s.explaining)!
  const tokens = useMemo(() => toTokens(e.text), [e.text])
  const { phase, shown } = useWriting(`explain:${e.title}:${e.value}:${e.compare}`, 1, tokens.length)
  const writing = phase !== "done"
  const [limit, setLimit] = useState(PAGE)
  const rows = useMemo(() => [...e.records].sort((a, b) => b.at.localeCompare(a.at)), [e.records])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <SheetTitle className="font-medium text-ink text-lg">{e.title}</SheetTitle>
          <SheetDescription className="text-ink-3 text-sm">
            {e.compare ?? "Uitgesplitst naar de regels die meetellen"}
          </SheetDescription>
        </div>
        <div className="flex items-start gap-3">
          <span className="figure text-4xl text-ink">{e.value}</span>
          <button
            type="button"
            aria-label="Sluiten"
            onClick={onClose}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6">
        <section className="flex gap-3 rounded-lg bg-arc-tint/50 p-3.5">
          <Sparkle className="mt-0.5 size-4 shrink-0 text-arc-ink" strokeWidth={1.75} />
          <p className="text-base text-ink leading-relaxed">
            {phase === "thinking" ? <span className="ask-shimmer">De regels lezen</span> : (
              <>
                {tokens.slice(0, shown).map((t, i) =>
                  // biome-ignore lint/suspicious/noArrayIndexKey: an append-only stream of one paragraph
                  "t" in t
                    ? <span key={i} className={writing && i >= shown - 6 ? "ask-word" : undefined}>{t.t}</span>
                    : null
                )}
                {writing ? <span aria-hidden className="ask-caret" /> : null}
              </>
            )}
          </p>
        </section>

        {e.drivers.length > 0 ?
          (
            <section className="flex flex-col gap-2">
              <h3 className="font-medium text-ink-3 text-xs">Wat erachter zit</h3>
              <Drivers drivers={e.drivers} unit={e.unit} />
            </section>
          ) :
          null}

        {rows.length > 0 ?
          (
            <section className="flex flex-col gap-2">
              <h3 className="flex items-baseline gap-2 font-medium text-ink-3 text-xs">
                De bestellingen die meetellen
                <span className="tabular-nums">{rows.length.toLocaleString("nl-NL")}</span>
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-3 text-xs">
                    <th className="pb-1.5 font-medium">Bestelling</th>
                    <th className="pb-1.5 font-medium">Product</th>
                    <th className="pb-1.5 font-medium">Waar</th>
                    <th className="pb-1.5 font-medium">Wat er gebeurde</th>
                    <th className="pb-1.5 text-right font-medium">Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((o) => (
                    <tr key={o.id} className="shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
                      <td className="py-1.5 pr-2 align-top">
                        <span className="flex flex-col">
                          <span className="font-medium text-ink tabular-nums">{o.number}</span>
                          <span className="text-ink-3 text-xs tabular-nums">{dayLabel(o.day)}</span>
                        </span>
                      </td>
                      <td className="max-w-[9rem] truncate py-1.5 pr-2 align-top text-ink-2">
                        {o.qty > 1 ? `${o.qty} × ` : ""}
                        {o.title}
                      </td>
                      <td className="py-1.5 pr-2 align-top text-ink-2">
                        <span className="flex flex-col">
                          <span>{COUNTRY_NAME[o.country]}</span>
                          <span className="text-ink-3 text-xs">{STORE_NAME[o.store]}</span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <Outcome o={o} />
                      </td>
                      <td className="py-1.5 text-right align-top text-ink tabular-nums">{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > limit ?
                (
                  <button
                    type="button"
                    onClick={() => setLimit((n) => n + PAGE)}
                    className="h-8 cursor-pointer self-start rounded-md px-2.5 font-medium text-arc-ink text-sm hover:bg-arc-tint"
                  >
                    Nog {Math.min(PAGE, rows.length - limit)} van {(rows.length - limit).toLocaleString("nl-NL")} tonen
                  </button>
                ) :
                null}
            </section>
          ) :
          null}
      </div>

      {e.open ?
        (
          <footer className="flex justify-end bg-mist px-5 py-3">
            <Link
              to={e.open.to}
              search={e.open.search as never}
              onClick={onClose}
              className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
            >
              {e.open.label}
              <ArrowUpRight className="size-3.5" strokeWidth={2} />
            </Link>
          </footer>
        ) :
        null}
    </div>
  )
}

const dayLabel = (d: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`)
  )

function Outcome({ o }: { o: HistOrder }) {
  const late = o.took !== undefined ? o.took - o.promised : 0
  const [label, tone] = o.status === "refunded"
    ? [`Terugbetaald · ${o.refundReason ? REFUND_REASON_LABEL[o.refundReason] : ""}`, "text-signal-red"]
    : o.status === "cancelled"
    ? ["Geannuleerd", "text-ink-3"]
    : o.status === "in_transit"
    ? ["Onderweg", "text-ink-2"]
    : late > 0
    ? [`${late} ${late === 1 ? "dag" : "dagen"} te laat`, "text-signal-amber"]
    : ["Op tijd", "text-ink-2"]
  return <span className={cn("whitespace-nowrap", tone)}>{label}</span>
}

import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet"
import { ArrowUpRight, Sparkle, X } from "../../icons"
import { cn } from "../lib/utils"
import { type DrawerView, type RecordTone, useAnalyticsSource } from "./analytics-source"
import { Drivers } from "./drivers"
import { useWriting } from "./writing"

/**
 * A number, explained: the figure and what it is compared with, Insyte's reading of it, what moved
 * it, and the orders it counts — every one of them, a page at a time. This is where "every figure
 * traceable to where it came from" is kept.
 */
export function ExplainDrawer() {
  const { drawer, closeDrawer } = useAnalyticsSource()
  return (
    <Sheet open={drawer !== null} onOpenChange={(v) => !v && closeDrawer()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-paper p-0 sm:max-w-[560px]">
        {drawer ? <Body key={drawer.key} e={drawer} onClose={closeDrawer} /> : null}
      </SheetContent>
    </Sheet>
  )
}

const PAGE = 40

const words = (text: string) => text.split(/(\s+)/).filter((w) => w !== "")

const TONE: Record<RecordTone, string> = {
  red: "text-signal-red",
  amber: "text-signal-amber",
  muted: "text-ink-3",
  plain: "text-ink-2"
}

function Body({ e, onClose }: { e: DrawerView; onClose: () => void }) {
  const tokens = useMemo(() => words(e.text ?? ""), [e.text])
  const { phase, shown } = useWriting(`explain:${e.key}`, 1, tokens.length)
  const writing = phase !== "done"
  const rows = e.records ?? []
  const rest = e.total - rows.length

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
        {e.failed ?
          (
            <section role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-mist p-3.5">
              <p className="text-base text-ink-2">Dit kon niet worden gelezen.</p>
              <button
                type="button"
                onClick={e.failed.retry}
                className="field flex h-9 w-fit cursor-pointer items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
              >
                Opnieuw proberen
              </button>
            </section>
          ) :
          (
            <section className="flex gap-3 rounded-lg bg-arc-tint/50 p-3.5">
              <Sparkle className="mt-0.5 size-4 shrink-0 text-arc-ink" strokeWidth={1.75} />
              <p className="text-base text-ink leading-relaxed">
                {e.text === null || phase === "thinking" ?
                  <span className="ask-shimmer">De regels lezen</span> :
                  (
                    <>
                      {tokens.slice(0, shown).map((t, i) => (
                        // An append-only stream of one paragraph.
                        <span key={i} className={writing && i >= shown - 6 ? "ask-word" : undefined}>{t}</span>
                      ))}
                      {writing ? <span aria-hidden className="ask-caret" /> : null}
                    </>
                  )}
              </p>
            </section>
          )}

        {e.drivers.length > 0 ?
          (
            <section className="flex flex-col gap-2">
              <h3 className="font-medium text-ink-3 text-xs">Wat erachter zit</h3>
              <Drivers drivers={e.drivers} />
            </section>
          ) :
          null}

        {e.total > 0 ?
          (
            <section className="flex flex-col gap-2">
              <h3 className="flex items-baseline gap-2 font-medium text-ink-3 text-xs">
                De bestellingen die meetellen
                <span className="tabular-nums">{e.total.toLocaleString("nl-NL")}</span>
              </h3>
              {e.records === null ?
                <p className="ask-shimmer text-sm">De bestellingen lezen</p> :
                (
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
                      {rows.map((o) => (
                        <tr key={o.id} className="shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
                          <td className="py-1.5 pr-2 align-top">
                            <span className="flex flex-col">
                              <span className="font-medium text-ink tabular-nums">{o.number}</span>
                              <span className="text-ink-3 text-xs tabular-nums">{o.day}</span>
                            </span>
                          </td>
                          <td className="max-w-[9rem] truncate py-1.5 pr-2 align-top text-ink-2">{o.item}</td>
                          <td className="py-1.5 pr-2 align-top text-ink-2">
                            <span className="flex flex-col">
                              <span>{o.country}</span>
                              <span className="text-ink-3 text-xs">{o.store}</span>
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 align-top">
                            <span className={cn("whitespace-nowrap", TONE[o.tone])}>{o.outcome}</span>
                          </td>
                          <td className="py-1.5 text-right align-top text-ink tabular-nums">{o.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              {e.more && rest > 0 ?
                (
                  <button
                    type="button"
                    disabled={e.more.loading}
                    onClick={e.more.load}
                    className="h-8 cursor-pointer self-start rounded-md px-2.5 font-medium text-arc-ink text-sm hover:bg-arc-tint disabled:cursor-default disabled:opacity-60"
                  >
                    {e.more.loading ?
                      "Bestellingen lezen" :
                      `Nog ${Math.min(PAGE, rest)} van ${rest.toLocaleString("nl-NL")} tonen`}
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
              to={e.open.to as never}
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

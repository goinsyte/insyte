import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, ChevronRight, Sparkle } from "../../icons"
import { cn } from "../lib/utils"
import type { FindingView, ProposalView } from "./analytics-source"
import { DisputesChart, LeadTimeChart, RefundsChart, RevenueChart, SupportChart } from "./charts"

/**
 * Insyte's reading of the period, as a short column: each finding is one sentence, the chart that
 * shows it, and — where there is something to do — one line proposing it. The sentence opens the
 * whole of it in the drawer: the explanation, what moved it, and every order it counts.
 */

function Chart({ f }: { f: FindingView }) {
  if (f.chart === "revenue") return <RevenueChart />
  if (f.chart === "leadtime") return <LeadTimeChart lit={f.lit} />
  if (f.chart === "refunds") return <RefundsChart lit={f.lit} />
  if (f.chart === "disputes") return <DisputesChart lit={f.lit} />
  return <SupportChart />
}

export function FindingBlock({ f, n, chart = true }: { f: FindingView; n: number; chart?: boolean }) {
  const still = useReducedMotion()
  return (
    <motion.article
      id={`finding-${f.id}`}
      data-finding={f.id}
      initial={still ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: n * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="flex scroll-mt-8 flex-col gap-4"
    >
      <button
        type="button"
        onClick={f.open}
        className="group -mx-3 flex cursor-pointer items-start gap-4 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ink/4"
      >
        <span className="w-3 pt-px text-ink-3 text-sm tabular-nums">{n}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 text-ink-3 text-sm">
            {f.metric}
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                f.tone === "good" ? "bg-signal-green" : f.tone === "bad" ? "bg-signal-red" : "bg-ink-4"
              )}
            />
            <span className="sr-only">
              {f.tone === "good" ? "goed" : f.tone === "bad" ? "verdient aandacht" : "stabiel"}
            </span>
          </span>
          <span className="max-w-[62ch] text-balance text-ink text-lg">{f.headline}</span>
        </span>
        <ChevronRight
          className="mt-6 size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2"
          strokeWidth={1.75}
        />
      </button>
      {chart ?
        (
          <div className="pl-7">
            <Chart f={f} />
          </div>
        ) :
        null}
      {f.proposal ? <ProposalLine p={f.proposal} /> : null}
    </motion.article>
  )
}

/** What Insyte would do about it, in one line; filing does it, with Undo. */
function ProposalLine({ p }: { p: ProposalView }) {
  return (
    <div className="ml-7 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-arc-tint/50 py-2 pr-2 pl-3">
      <Sparkle className="size-3.5 shrink-0 text-arc-ink" strokeWidth={1.75} />
      <span className={cn("min-w-0 flex-1 text-sm", p.decision ? "text-ink-3" : "text-ink")} title={p.why}>
        {p.title}
      </span>
      {p.decision ?
        (
          <span className="flex items-center gap-2 text-ink-3 text-sm">
            {p.decision === "filed" ? "Uitgevoerd" : "Genegeerd"}
            {/* Filing is undone from its toast, since it changed a record; discarding changed nothing. */}
            {p.decision === "discarded" ?
              (
                <button
                  type="button"
                  onClick={p.undo}
                  className="cursor-pointer font-medium text-arc-ink hover:underline"
                >
                  Ongedaan maken
                </button>
              ) :
              null}
          </span>
        ) :
        (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={p.discard}
              className="h-7 cursor-pointer rounded-md px-2.5 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink"
            >
              Negeren
            </button>
            <button
              type="button"
              onClick={p.file}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
            >
              {p.fileLabel}
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </button>
          </span>
        )}
    </div>
  )
}

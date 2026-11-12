import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowUpRight, X } from "../../icons"
import { Answer, FollowUps, Thinking } from "../ask/parts"
import { type AnswerChart, ask, type AskAnswer } from "../lib/analytics/ask"
import { money, type Span } from "../lib/analytics/engine"
import { useAnalytics } from "../stores/analytics-store"
import { anim, AXIS, ClientChart, num, Tip } from "./charts"
import { useWriting } from "./writing"

/**
 * The design app's answers: each written out with its own chart and the orders behind it, computed
 * from the same rows as everything else on the page (`lib/analytics/ask`).
 */
export function useAnswers(A: Span, B: Span) {
  const [answers, setAnswers] = useState<AskAnswer[]>([])
  return {
    answers,
    ask: (q: string) => setAnswers((xs) => [ask(q, A, B), ...xs].slice(0, 2)),
    dismiss: (id: string) => setAnswers((xs) => xs.filter((x) => x.id !== id))
  }
}

export function AnswerList(
  { answers, onAsk, onDismiss }: { answers: AskAnswer[]; onAsk: (q: string) => void; onDismiss: (id: string) => void }
) {
  return (
    <AnimatePresence initial={false}>
      {answers.map((a) => <AnswerBlock key={a.id} a={a} onAsk={onAsk} onDismiss={() => onDismiss(a.id)} />)}
    </AnimatePresence>
  )
}

function AnswerBlock({ a, onAsk, onDismiss }: { a: AskAnswer; onAsk: (q: string) => void; onDismiss: () => void }) {
  const still = useReducedMotion()
  const explain = useAnalytics((s) => s.explain)
  const { phase, reached, shown, seconds } = useWriting(a.id, a.steps.length, a.tokens.length)
  const done = phase === "done"
  const text = a.tokens.map((t) => ("t" in t ? t.t : t.ref)).join("")

  return (
    <motion.article
      id={a.id}
      initial={still ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      className="flex scroll-mt-8 flex-col gap-3 rounded-xl bg-mist p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-base text-ink">{a.question}</h3>
        <button
          type="button"
          aria-label="Antwoord sluiten"
          onClick={onDismiss}
          className="-mt-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      </header>
      <Thinking steps={a.steps} reached={reached} working={phase === "thinking"} seconds={seconds} />
      {phase !== "thinking" ? <Answer tokens={a.tokens} shown={shown} streaming={phase === "writing"} /> : null}
      {done && a.chart ?
        (
          <motion.figure
            initial={still ? false : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
            animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-1.5"
          >
            <figcaption className="text-ink-3 text-xs">{a.chart.title}</figcaption>
            <AnswerBars chart={a.chart} />
          </motion.figure>
        ) :
        null}
      {done ?
        (
          <div className="ask-rise flex flex-wrap items-start justify-between gap-3">
            <FollowUps items={a.followUps} onPick={onAsk} />
            {a.records.length > 0 ?
              (
                <button
                  type="button"
                  onClick={() =>
                    explain({
                      title: a.question,
                      value: a.records.length.toLocaleString("nl-NL"),
                      compare: a.records.length === 1
                        ? "bestelling achter dit antwoord"
                        : "bestellingen achter dit antwoord",
                      text,
                      drivers: [],
                      unit: "orders",
                      records: a.records
                    })}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-arc-ink text-sm hover:bg-arc-tint"
                >
                  {a.records.length === 1
                    ? "Bekijk de bestelling"
                    : `Bekijk de ${a.records.length.toLocaleString("nl-NL")} bestellingen`}
                  <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
                </button>
              ) :
              null}
          </div>
        ) :
        null}
    </motion.article>
  )
}

/* ── An answer's chart ──────────────────────────────────────────────────────────────────────── */

function AnswerBars({ chart }: { chart: AnswerChart }) {
  const still = useReducedMotion()
  const fmt = (v: number) =>
    chart.unit === "$" ? money(v) : chart.unit === "%" ? `${num(v)}%` : chart.unit === "h" ? `${num(v)} u` : num(v)
  const two = chart.rows.some((r) => r.b !== undefined)
  return (
    <div style={{ height: 16 + chart.rows.length * (two ? 30 : 24) }}>
      <ClientChart>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chart.rows}
            layout="vertical"
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            barGap={2}
            barCategoryGap="24%"
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" {...AXIS} width={132} />
            <Tooltip
              cursor={{ fill: "color-mix(in oklch, var(--ink) 4%, transparent)" }}
              content={(p) => (
                <Tip
                  {...p}
                  rows={(pl) =>
                    pl.map((
                      x
                    ) => [x.dataKey === "a" ? chart.legend[0] : (chart.legend[1] ?? ""), fmt(Number(x.value))])}
                />
              )}
            />
            {two ? <Bar dataKey="b" fill="var(--ink-5)" radius={2} {...anim(still)} /> : null}
            <Bar dataKey="a" fill="var(--arc)" radius={2} {...anim(still)} />
          </BarChart>
        </ResponsiveContainer>
      </ClientChart>
    </div>
  )
}

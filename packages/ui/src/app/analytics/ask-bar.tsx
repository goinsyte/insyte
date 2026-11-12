import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { ArrowUpRight, CornerDownLeft, X } from "../../icons"
import { Answer, FollowUps, InsyteMark, Thinking } from "../ask/parts"
import { ask, type AskAnswer, SUGGESTED } from "../lib/analytics/ask"
import type { Span } from "../lib/analytics/engine"
import { useAnalytics } from "../stores/analytics-store"
import { AnswerBars } from "./charts"
import { useWriting } from "./writing"

/**
 * Ask about the numbers: one field, and the answers it gets. Starting questions show only while
 * the field has focus; an answer is written out with its own chart and the orders behind it,
 * computed from the same rows as everything else on the page. The field and the answers are
 * separate so the field can sit in the sidebar while answers land in the reading column.
 */
export function AskField({ onAsk }: { onAsk: (q: string) => void }) {
  const [q, setQ] = useState("")
  const [focused, setFocused] = useState(false)

  function submit(text: string) {
    const t = text.trim()
    if (!t) return
    onAsk(t)
    setQ("")
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(q)
        }}
        className="field flex h-10 items-center gap-2.5 rounded-lg pr-1 pl-2 focus-within:bg-paper focus-within:ring-2 focus-within:ring-arc/25"
      >
        <InsyteMark size={22} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Vraag iets over deze cijfers"
          aria-label="Vraag iets over deze cijfers"
          className="min-w-0 flex-1 bg-transparent text-ink text-sm outline-none placeholder:text-ink-3"
        />
        {q.trim() ?
          (
            <button
              type="submit"
              aria-label="Vragen"
              className="flex size-8 cursor-pointer items-center justify-center rounded-md bg-abyss text-mesh-ink hover:bg-abyss-2"
            >
              <CornerDownLeft className="size-3.5" strokeWidth={2} />
            </button>
          ) :
          null}
      </form>
      {focused && !q ?
        (
          <ul
            aria-label="Vragen om mee te beginnen"
            className="panel-raised absolute top-full right-0 left-0 z-20 mt-1.5 flex w-[min(320px,calc(100vw-2rem))] flex-col rounded-xl p-1.5"
          >
            {SUGGESTED.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    submit(s)
                  }}
                  className="flex min-h-8 w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-left text-ink-2 text-sm hover:bg-ink/5 hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        ) :
        null}
    </div>
  )
}

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

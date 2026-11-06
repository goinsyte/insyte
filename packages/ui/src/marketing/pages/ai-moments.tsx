import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { ArrowUp, Check, FileText, Lock, Sparkles, Truck, Workflow } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { AgentLogPanel, AutonomyPanel, SoonTag } from "../agent-panels.tsx"
import { APRIL, FINDINGS, MAY, REVENUE_FINDING, TURNS } from "../ai-data.ts"
import { useRunning, useTicker } from "./hooks.ts"
import { MomentFrame } from "./steps.tsx"

/*
 * Insyte AI's moments for the product template, from the AI section's own data (`ai-data.ts`):
 * the console's Ask with a turn streaming in, the analysis drawing May over April, what a turn
 * read, and the scopes a flow's AI steps run under. Same rules as the other moments: one loop
 * while read and on screen, the last frame everywhere else.
 */

const TURN = TURNS[0]!
const EASE = [0.16, 1, 0.3, 1] as const

function useFrame(on: boolean, frames: number, ms: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.35) && on
  const tick = useTicker(run, ms)
  return { ref, run, f: run ? tick % frames : frames - 1 }
}

function Streamed({ run }: { readonly run: boolean }) {
  const total = TURN.answer.length
  const [n, setN] = useState(total)
  useEffect(() => {
    if (!run) {
      setN(total)
      return
    }
    setN(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setN(i)
      if (i >= total) window.clearInterval(id)
    }, 60)
    return () => window.clearInterval(id)
  }, [run, total])
  return (
    <p className="text-ink-2 text-sm leading-relaxed">
      {TURN.answer.slice(0, n).map((t, i) =>
        "t" in t
          ? <span key={i}>{`${t.t} `}</span>
          : (
            <span
              key={i}
              className="mr-1 inline-flex items-center gap-1 rounded-sm bg-arc-tint px-1.5 align-baseline text-arc-ink text-xs"
            >
              {t.kind === "chargeback" ? <FileText size={11} /> : <Truck size={11} />}
              {t.ref}
            </span>
          )
      )}
    </p>
  )
}

/** Vraag Insyte: the question, the answer streaming in with its records, the proposal plate. */
export function AskMoment({ on, bare = false }: { readonly on: boolean; readonly bare?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.35) && on
  const p = TURN.proposal
  return (
    <div ref={ref}>
      <MomentFrame tone={bare ? "none" : "glacier"}>
        <div className="mx-auto flex w-full max-w-[420px] flex-col overflow-hidden rounded-xl bg-paper text-left window-lift">
          <div className="flex items-center gap-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--hairline)]">
            <Sparkles size={14} className="text-arc-ink" />
            <span className="font-medium text-ink text-sm">Vraag Insyte</span>
            <span className="ml-auto text-ink-3 text-xs">{TURN.tools.length} bronnen gelezen</span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <span className="ml-auto max-w-[85%] rounded-lg bg-mist px-3 py-2 text-ink text-sm">{TURN.question}</span>
            <Streamed run={run} />
            <div className="relative overflow-hidden rounded-lg bg-abyss p-3.5 text-mesh-ink">
              <div aria-hidden className="absolute inset-0 drafting-chalk" />
              <div className="relative flex flex-col gap-2">
                <span className="font-medium text-sm">{p.title}</span>
                <span className="relative flex items-center">
                  <span className="h-px w-full bg-mesh-ink/30" />
                  <span className="absolute left-0 h-2 w-px bg-mesh-ink/60" />
                  <span className="absolute h-2 w-px bg-mesh-ink/60" style={{ left: `${p.confidence}%` }} />
                  <span className="ml-2 shrink-0 text-mesh-ink-2 text-xs tabular-nums">{p.confidence}%</span>
                </span>
                <span className="flex gap-1.5 pt-1">
                  <span className="rounded-md bg-mesh-ink/90 px-2.5 py-1 font-medium text-abyss text-xs">
                    {p.fileLabel}
                  </span>
                  <span className="rounded-md bg-mesh-ink/12 px-2.5 py-1 text-mesh-ink text-xs">Bewerken</span>
                  <span className="rounded-md px-2.5 py-1 text-mesh-ink-2 text-xs">Negeren</span>
                </span>
              </div>
            </div>
          </div>
          <div className="m-3 mt-0 flex items-center gap-2 rounded-lg px-3 py-2.5 field">
            <span className="flex-1 text-ink-3 text-sm">Vraag iets over je winkel…</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-abyss text-mesh-ink">
              <ArrowUp size={12} />
            </span>
          </div>
        </div>
      </MomentFrame>
    </div>
  )
}

const path = (values: ReadonlyArray<number>) => {
  const max = 8
  const min = 4
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * 400} ${80 - ((v - min) / (max - min)) * 70}`)
    .join(" ")
}

/** The analysis: May drawing over April, the finding written beside it, the index of findings. */
export function AnalyticsMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 900)
  const drawn = f >= 1
  return (
    <div ref={ref}>
      <MomentFrame>
        <div className="mx-auto grid w-full max-w-[560px] grid-cols-[150px_minmax(0,1fr)] overflow-hidden rounded-lg bg-paper text-left window-lift">
          <ul className="flex flex-col gap-0.5 bg-mist p-2">
            {FINDINGS.slice(0, 5).map((x, i) => (
              <li
                key={x.title}
                className={cn(
                  "flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs",
                  i === 0 ? "bg-paper text-ink" : "text-ink-2"
                )}
              >
                {x.title}
                {x.look ? <span className="size-1.5 bg-abyss" /> : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-ink text-sm">{REVENUE_FINDING}</p>
            <svg viewBox="0 0 400 84" className="h-28 w-full" fill="none" preserveAspectRatio="none" aria-hidden>
              <path
                d={path(APRIL)}
                stroke="var(--ink-4)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <motion.path
                d={path(MAY)}
                stroke="var(--arc)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{ pathLength: drawn ? 1 : 0 }}
                transition={{ duration: 1.2, ease: EASE }}
              />
            </svg>
            <span className="flex items-center gap-4 text-ink-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-arc" />Mei
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 border-ink-4 border-t border-dashed" />April
              </span>
            </span>
          </div>
        </div>
      </MomentFrame>
    </div>
  )
}

/** What a turn read before it answered: each source ticking off, with the records it opened. */
export function SourcesMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 7, 700)
  const done = Math.min(TURN.tools.length, f)
  return (
    <div ref={ref}>
      <MomentFrame>
        <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-lg bg-paper text-left window-lift">
          <div className="flex items-center gap-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--hairline)]">
            <span className="font-medium text-ink text-sm">Wat Insyte las</span>
            <span className="ml-auto text-ink-3 text-xs">
              {done === TURN.tools.length ? "2 s nagedacht" : "Bezig…"}
            </span>
          </div>
          <ul className="flex flex-col gap-1 p-3">
            {TURN.tools.map((t, i) => (
              <li key={t} className="flex items-center gap-3 rounded-md px-2 py-2">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-sm transition-colors duration-300",
                    i < done ? "bg-abyss text-mesh-ink" : "bg-ink/6 text-transparent"
                  )}
                >
                  <Check size={12} />
                </span>
                <span className={cn("text-sm", i < done ? "text-ink" : "text-ink-3")}>{t}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5 bg-mist px-4 py-3">
            {TURN.sources.map((s) => (
              <span
                key={s.title}
                className="flex items-center gap-1.5 rounded-sm bg-paper px-2 py-1 text-ink-2 text-xs hairline"
              >
                {s.title}
                <span className="text-ink-3">· {s.detail}</span>
              </span>
            ))}
          </div>
        </div>
      </MomentFrame>
    </div>
  )
}

const SCOPES = [
  { area: "Bestellingen", level: "Bewerken", on: true },
  { area: "Klantenservice", level: "Concept schrijven", on: true },
  { area: "E-mail versturen", level: "Na goedkeuring", on: true },
  { area: "Terugbetalen", level: "Uit", on: false }
] as const

/** A flow's rights: each step runs only under the scopes the flow was given; one switched off. */
export function ScopesMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 900)
  const off = f >= 3
  return (
    <div ref={ref}>
      <MomentFrame>
        <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-lg bg-paper text-left window-lift">
          <div className="flex items-center gap-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--hairline)]">
            <Workflow size={14} className="text-ink-3" />
            <span className="font-medium text-ink text-sm">Late levering · rechten</span>
          </div>
          <ul className="flex flex-col p-2">
            {SCOPES.map((s, i) => {
              const enabled = s.on && !(off && i === 2)
              return (
                <li key={s.area} className="flex items-center gap-3 rounded-md px-2.5 py-2.5">
                  <Lock size={13} className="text-ink-3" />
                  <span className="flex-1 text-ink text-sm">{s.area}</span>
                  <span className="text-ink-3 text-xs">{enabled ? s.level : "Uit"}</span>
                  <span
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors duration-300",
                      enabled ? "bg-abyss" : "bg-ink/15"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 size-4 rounded-full bg-paper transition-transform duration-300 ease-[var(--ease-out-expo)]",
                        enabled && "translate-x-4"
                      )}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="bg-mist px-4 py-3 text-ink-2 text-xs">
            {off
              ? "Recht uit: de volgende uitvoering slaat de e-mailstap over."
              : "Elke stap draait alleen met de rechten van de flow."}
          </div>
        </div>
      </MomentFrame>
    </div>
  )
}

/** The planned per-action setting beside the log it writes: switched, logged, taken back. Binnenkort. */
export function AutonomyMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 8, 1000)
  return (
    <div ref={ref}>
      <MomentFrame>
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
          <SoonTag label="binnenkort in de console" />
          <AutonomyPanel flip={f >= 1} />
          <AgentLogPanel fresh={f >= 2} undone={f >= 5 && f < 7} />
        </div>
      </MomentFrame>
    </div>
  )
}

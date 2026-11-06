import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AtSign,
  ChartLine,
  Check,
  ChevronDown,
  CornerDownLeft,
  Factory,
  FileText,
  type IconComponent,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  ShieldAlert,
  ShoppingBag,
  Slash,
  Sparkle,
  Sparkles,
  Undo2,
  User,
  Workflow
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { AgentLogPanel, AutonomyPanel, SoonTag } from "./agent-panels.tsx"
import {
  APRIL,
  ESTIMATE,
  FIGURES,
  FINDINGS,
  MAY,
  type RefKind,
  REVENUE_FINDING,
  SUPPLIER_ANSWER,
  type Turn,
  TURNS
} from "./ai-data.ts"
import { Frame } from "./frame.tsx"
import { useMarketingLinks } from "./links.tsx"
import { ArrowLink } from "./parts.tsx"

/*
 * Insyte AI, the flagship chapter on abyss: Vraag Insyte as the console's /ask page runs it, the
 * capabilities in one ruled sheet, and Analyse reading the numbers.
 *
 * The Ask window plays the console's turn sequence on its own records (`ai-data.ts`): the star
 * breathes, the trace thinks through its steps and settles ("2 s nagedacht"), the answer streams
 * word by word and resolves out of a blur with its records as chips, then the tools it ran, the
 * proposal plate with its confidence on a dimension line, and the follow-ups. Three questions take
 * turns while the window is on screen; choosing one stops that. Off screen nothing runs; under
 * reduced motion every turn is shown settled.
 *
 * The windows are pictures of the product (`aria-hidden`, `inert`), drawn at the console's size and
 * zoomed to the column, with no browser chrome. Nothing white sits on the abyss outside them.
 */

const EASE = [0.16, 1, 0.3, 1] as const
const STEP_MS = 620
const WORD_MS = 32
const START_MS = 500
const HOLD_MS = 5200

const KIND_ICON: Record<RefKind, IconComponent> = {
  order: ShoppingBag,
  chargeback: CornerDownLeft,
  customer: User,
  supplier: Factory,
  queue: Inbox
}

const wordsOf = (t: Turn) => t.answer.length

/** Where a turn is, from the milliseconds since it started. Infinity is settled. */
function stageOf(t: Turn, ms: number) {
  const thinkEnd = START_MS + t.steps.length * STEP_MS
  const reached = ms < START_MS ? 0 : Math.min(t.steps.length, 1 + Math.floor((ms - START_MS) / STEP_MS))
  const thinking = ms >= START_MS && ms < thinkEnd
  const words = ms < thinkEnd ? 0 : Math.min(wordsOf(t), Math.floor((ms - thinkEnd) / WORD_MS))
  const streamEnd = thinkEnd + wordsOf(t) * WORD_MS
  const settled = ms >= streamEnd + 250
  return { reached, thinking, words, settled, end: streamEnd + 250 + HOLD_MS }
}

/* ── The Ask window ────────────────────────────────────────────────────────────────────────── */

export function Star({ working, size = 26 }: { readonly working: boolean; readonly size?: number }) {
  return (
    <motion.span
      animate={working ? { scale: [1, 1.12, 1], rotate: [0, 8, 0] } : { scale: 1, rotate: 0 }}
      transition={working ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      className="flex shrink-0 items-center justify-center rounded-md bg-abyss text-mesh-ink"
      style={{ width: size, height: size }}
    >
      <Sparkle size={Math.round(size * 0.58)} />
    </motion.span>
  )
}

function RefChip({ kind, label }: { readonly kind: RefKind; readonly label: string }) {
  const Icon = KIND_ICON[kind]
  return (
    <span className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-sm bg-arc-tint px-1.5 py-px align-middle text-arc-ink text-sm">
      <Icon size={12} />
      {label}
    </span>
  )
}

function Confidence({ value, run }: { readonly value: number; readonly run: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-mesh-ink-2 text-xs">Zekerheid</span>
      <span className="relative h-2.5 flex-1">
        <span className="absolute top-1/2 right-0 left-0 h-px bg-mesh-ink/25" />
        <span className="absolute top-0 bottom-0 left-0 w-px bg-mesh-ink/50" />
        <span className="absolute top-0 right-0 bottom-0 w-px bg-mesh-ink/50" />
        <motion.span
          className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-mesh-ink"
          initial={run ? { width: 0 } : false}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
        />
      </span>
      <span className="w-14 text-right text-mesh-ink-2 text-xs">
        {value >= 90 ? "Hoog" : value >= 75 ? "Goed" : "Redelijk"}
      </span>
    </div>
  )
}

/** The proposal: a plate — abyss, the drafting grid, the confidence measured, the three choices. */
function Plate({ turn, run }: { readonly turn: Turn; readonly run: boolean }) {
  const p = turn.proposal
  return (
    <motion.div
      initial={run ? { opacity: 0, clipPath: "inset(0 0 0 100%)" } : false}
      animate={{ opacity: 1, clipPath: "inset(0 0 0 0%)" }}
      transition={{ duration: 0.32, ease: EASE }}
      className="relative flex flex-col gap-3 overflow-hidden rounded-xl bg-abyss p-4 text-mesh-ink"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 drafting-chalk" />
      <div className="relative flex items-center gap-2 text-mesh-ink-2 text-xs">
        <Sparkles size={12} />
        Voorstel
      </div>
      <div className="relative font-medium text-base">{p.title}</div>
      <p className="relative text-mesh-ink-2 text-sm leading-relaxed">{p.body}</p>
      <div className="relative">
        <Confidence value={p.confidence} run={run} />
      </div>
      <p className="relative text-mesh-ink-2 text-xs">{p.why}</p>
      <div className="relative flex items-center gap-1.5">
        <span className="flex h-8 items-center gap-1.5 rounded-md bg-arc px-3 font-medium text-mesh-ink text-sm">
          {p.fileLabel}
          <ArrowRight size={14} />
        </span>
        <span className="flex h-8 items-center rounded-md px-2.5 font-medium text-mesh-ink-2 text-sm">Bewerken</span>
        <span className="flex h-8 items-center rounded-md px-2.5 font-medium text-mesh-ink-2 text-sm">Negeren</span>
      </div>
    </motion.div>
  )
}

function AssistantTurn({ turn, ms, run }: { readonly turn: Turn; readonly ms: number; readonly run: boolean }) {
  const s = stageOf(turn, ms)
  const open = s.thinking || !s.settled
  return (
    <div className="flex gap-3">
      <Star working={s.thinking} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 font-medium text-sm">
            {s.thinking || s.reached === 0
              ? <span className="text-ink">Denkt na</span>
              : <span className="text-ink-3">2 s nagedacht</span>}
            <ChevronDown size={13} className={cn("text-ink-3 transition-transform", open && "rotate-180")} />
          </span>
          {open && s.reached > 0
            ? (
              <ol className="relative mt-1 ml-[5px] pl-4">
                <span aria-hidden className="absolute top-1 bottom-2 left-[3px] w-px bg-ink/12" />
                {turn.steps.slice(0, s.reached).map((step, i) => {
                  const done = !s.thinking || i < s.reached - 1
                  return (
                    <motion.li
                      key={step}
                      initial={run ? { opacity: 0, y: 4 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.26, ease: EASE }}
                      className="flex min-h-7 items-center gap-2 text-sm"
                    >
                      {done
                        ? <Check size={14} className="shrink-0 text-ink-3" />
                        : (
                          <motion.span
                            className="size-3 shrink-0 rounded-full border-2 border-arc border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                          />
                        )}
                      <span className={done ? "text-ink-2" : "text-ink"}>{step}</span>
                    </motion.li>
                  )
                })}
              </ol>
            )
            : null}
        </div>
        {s.words > 0
          ? (
            <p className="text-base text-ink leading-relaxed">
              {turn.answer.slice(0, s.words).map((tok, i) => {
                const fresh = s.settled ? 0 : Math.max(0, i - (s.words - 5))
                const style = fresh > 0 ? { filter: `blur(${fresh * 0.7}px)`, opacity: 1 - fresh * 0.14 } : undefined
                return (
                  <span key={i} style={style} className="transition-[filter,opacity] duration-300">
                    {"ref" in tok ? <RefChip kind={tok.kind} label={tok.ref} /> : tok.t}
                    {" "}
                  </span>
                )
              })}
            </p>
          )
          : null}
        {s.settled
          ? (
            <motion.div
              initial={run ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: EASE }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap gap-1.5">
                {turn.tools.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-sm bg-mist px-1.5 py-0.5 text-ink-2 text-xs">
                    <Check size={11} />
                    {t}
                  </span>
                ))}
              </div>
              <Plate turn={turn} run={run} />
              <div className="flex flex-wrap gap-1.5">
                {turn.followUps.map((f) => (
                  <span key={f} className="rounded-md px-2.5 py-1 text-ink-2 text-sm field">
                    {f}
                  </span>
                ))}
              </div>
            </motion.div>
          )
          : null}
      </div>
    </div>
  )
}

function AskWindow({ turn, ms, run }: { readonly turn: Turn; readonly ms: number; readonly run: boolean }) {
  const s = stageOf(turn, ms)
  return (
    <div
      aria-hidden
      inert
      className="w-[1080px] select-none overflow-hidden rounded-lg bg-paper text-left outline outline-mesh-ink/20 window-lift [zoom:0.33] sm:[zoom:0.5] md:[zoom:0.62] lg:[zoom:0.82] xl:[zoom:1]"
    >
      <div className="flex h-[640px]">
        <div className="flex w-52 shrink-0 flex-col gap-1 bg-mist px-2 py-3">
          <span className="mb-2 flex h-8 items-center justify-center gap-1.5 rounded-md bg-abyss font-medium text-base text-mesh-ink">
            <Plus size={14} />
            Nieuw gesprek
          </span>
          <span className="px-2 pt-1 pb-1 font-medium text-ink-3 text-xs">Gesprekken</span>
          {TURNS.map((t) => (
            <span
              key={t.id}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-base",
                t.id === turn.id ? "bg-arc-tint font-medium text-arc-ink" : "text-ink-2"
              )}
            >
              <MessageSquare size={13} className="shrink-0 opacity-70" />
              <span className="truncate">{t.question}</span>
            </span>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-paper">
          <div className="min-h-0 flex-1 overflow-hidden px-8 py-7">
            <div className="mx-auto flex max-w-[560px] flex-col gap-6">
              <motion.div
                key={`q-${turn.id}`}
                initial={run ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-mist px-3.5 py-2.5 text-base text-ink"
              >
                {turn.question}
              </motion.div>
              <AssistantTurn key={`a-${turn.id}`} turn={turn} ms={ms} run={run} />
            </div>
          </div>
          <div className="shrink-0 px-8 pb-6">
            <div className="mx-auto flex max-w-[560px] flex-col gap-1 rounded-xl px-1 pb-1 field">
              <span className="px-2.5 pt-3 pb-1 text-base text-ink-3">
                Vraag naar bestellingen, tickets of chargebacks
              </span>
              <span className="flex items-center gap-1 px-1">
                <span className="flex size-7 items-center justify-center rounded-md text-ink-3">
                  <AtSign size={14} />
                </span>
                <span className="flex size-7 items-center justify-center rounded-md text-ink-3">
                  <Slash size={14} />
                </span>
                <span className="ml-auto flex size-7 items-center justify-center rounded-md bg-abyss text-mesh-ink">
                  <ArrowUp size={14} />
                </span>
              </span>
            </div>
            <p className="mx-auto mt-2 max-w-[560px] text-center text-ink-3 text-xs">
              Ziet Vraag Insyte, je wachtrij en records · werkt binnen jouw regels
            </p>
          </div>
        </div>

        <div className="flex w-64 shrink-0 flex-col gap-5 bg-glacier px-4 py-5">
          <div className="flex items-center gap-2">
            <Star working={false} size={20} />
            <span className="font-medium text-base text-ink">Wat Insyte las</span>
          </div>
          {s.settled
            ? (
              <motion.div
                initial={run ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col gap-5"
              >
                <ul className="flex flex-col gap-1">
                  {turn.sources.map((src) => {
                    const Icon = KIND_ICON[src.kind]
                    return (
                      <li key={src.title} className="flex items-start gap-2.5 rounded-md bg-paper p-2.5 hairline">
                        <Icon size={14} className="mt-0.5 shrink-0 text-ink-3" />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-ink text-sm">{src.title}</span>
                          <span className="truncate text-ink-3 text-xs">{src.detail}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <div className="flex flex-col gap-2">
                  <span className="font-medium text-ink-3 text-xs">Gebruikte tools</span>
                  {turn.tools.map((t) => (
                    <span key={t} className="flex items-center gap-2 text-ink-2 text-sm">
                      <Check size={13} className="text-ink-3" />
                      {t}
                    </span>
                  ))}
                </div>
              </motion.div>
            )
            : <p className="text-ink-3 text-sm">{s.thinking ? "Leest…" : "Nog niets gelezen."}</p>}
        </div>
      </div>
    </div>
  )
}

/** The demo: three questions taking turns, each run as the console runs it. */
function AskDemo() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const inView = useInView(ref, { amount: 0.35 })
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(false)
  const [ms, setMs] = useState(Number.POSITIVE_INFINITY)
  const run = !reduced && inView
  const turn = TURNS[index]!

  useEffect(() => {
    if (!run) {
      setMs(Number.POSITIVE_INFINITY)
      return
    }
    const start = performance.now()
    setMs(0)
    const end = stageOf(turn, 0).end
    const id = window.setInterval(() => {
      const t = performance.now() - start
      setMs(t)
      if (t >= end) {
        window.clearInterval(id)
        if (!chosen) setIndex((i) => (i + 1) % TURNS.length)
      }
    }, 40)
    return () => window.clearInterval(id)
  }, [run, index, chosen, turn])

  return (
    <div ref={ref} className="flex flex-col items-center gap-6">
      <div role="group" aria-label="Voorbeeldvragen" className="flex flex-wrap justify-center gap-2">
        {TURNS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={i === index}
            onClick={() => {
              setChosen(true)
              setIndex(i)
            }}
            className={cn(
              "flex h-10 items-center gap-2 rounded-lg px-3.5 font-medium text-sm transition-colors",
              i === index
                ? "bg-mesh-ink/[0.16] text-mesh-ink chalk-line"
                : "bg-mesh-ink/[0.05] text-mesh-ink-2 hover:bg-mesh-ink/10 hover:text-mesh-ink"
            )}
          >
            <Sparkles size={14} />
            {t.question}
          </button>
        ))}
      </div>
      <div className="w-full overflow-hidden rounded-lg">
        <div className="mx-auto w-fit">
          <AskWindow turn={turn} ms={run ? ms : Number.POSITIVE_INFINITY} run={run} />
        </div>
      </div>
      <p className="max-w-[70ch] text-center text-mesh-ink-2 text-sm">
        Getekend op Northwind Clothing Co. De antwoorden zijn in deze demo gescript op de records van de werkruimte,
        zoals in de console zelf. Dit voorstel staat op Eerst vragen en wacht op jou.
      </p>
    </div>
  )
}

/* ── Autonomy: the planned setting per action, and the log it writes ──────────────────────────── */

/**
 * The agent within its rules, as ADR-0027 designs it and the console does not have yet: the operator
 * moves "Ticket toewijzen" to Zelf doen, the agent assigns Daniel's ticket and logs it with what it
 * read, and the owner takes it back with Ongedaan maken. One loop while on screen; settled (switched,
 * logged, not undone) off screen and under reduced motion. Labelled binnenkort, like the pricing chips.
 */
function Autonomy() {
  const links = useMarketingLinks()
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const inView = useInView(ref, { amount: 0.35 })
  const run = !reduced && inView
  const [f, setF] = useState(7)
  useEffect(() => {
    if (!run) {
      setF(7)
      return
    }
    setF(0)
    const id = window.setInterval(() => setF((n) => (n + 1) % 10), 900)
    return () => window.clearInterval(id)
  }, [run])
  const flip = f >= 2
  const fresh = f >= 3
  const undone = f >= 6 && f < 9 && run
  return (
    <div ref={ref} className="mt-20 grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center lg:gap-12">
      <div className="flex flex-col gap-5">
        <SoonTag dark />
        <h3 className="max-w-[20ch] font-medium text-3xl text-mesh-ink">
          Per actie bepaal jij hoe ver de agent gaat.
        </h3>
        <p className="max-w-[48ch] text-lg text-mesh-ink-2">
          Zelf doen, Eerst vragen of Nooit. Intern werk mag de agent zelf doen; terugbetalen, annuleren en klanten of
          leveranciers mailen vraagt hij eerst. Alles wat hij doet, staat in een logboek met wat hij las, en wat terug
          kan, maak je ongedaan.
        </p>
        <p className="max-w-[48ch] text-mesh-ink-2 text-sm">
          Gebouwd voor agents: je eigen AI-tools werken nu al met Insyte via de API en webhooks.{" "}
          <span className="text-mesh-ink">MCP-server binnenkort</span>, met dezelfde rechten als een API-sleutel.
        </p>
        <ArrowLink href={links.page("/product/insyte-ai")} onDark>Hoe de agent werkt</ArrowLink>
      </div>
      <div
        aria-hidden
        inert
        className="grid select-none gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]"
      >
        <AutonomyPanel flip={flip} />
        <motion.div
          animate={{ opacity: fresh ? 1 : 0.55 }}
          transition={{ duration: 0.4 }}
        >
          <AgentLogPanel fresh={fresh} undone={undone} />
        </motion.div>
      </div>
    </div>
  )
}

/* ── The capabilities ──────────────────────────────────────────────────────────────────────── */

function Meter() {
  return (
    <span className="relative block h-2.5 w-24">
      <span className="absolute top-1/2 right-0 left-0 h-px bg-mesh-ink/25" />
      <span className="absolute top-0 bottom-0 left-0 w-px bg-mesh-ink/50" />
      <span className="absolute top-0 right-0 bottom-0 w-px bg-mesh-ink/50" />
      <span className="absolute top-1/2 left-0 h-[2px] w-[84%] -translate-y-1/2 bg-mesh-ink" />
    </span>
  )
}

const CAPS: ReadonlyArray<{
  readonly Icon: IconComponent
  readonly title: string
  readonly body: string
  readonly visual: ReactNode
}> = [
  {
    Icon: Sparkles,
    title: "Voorstellen",
    body: "Wat op Eerst vragen staat, komt als voorstel met zijn zekerheid: uitvoeren, bewerken of negeren.",
    visual: <Meter />
  },
  {
    Icon: ChartLine,
    title: "Analyse",
    body: "Insyte leest je cijfers en schrijft op wat er veranderde, met de grafiek erbij.",
    visual: (
      <svg viewBox="0 0 96 20" width={96} height={20} fill="none" aria-hidden>
        <polyline
          points="0,16 12,13 24,15 36,10 48,12 60,7 72,9 84,4 96,6"
          stroke="var(--mesh-ink)"
          strokeWidth="1.5"
        />
        <polyline
          points="0,17 12,16 24,17 36,14 48,15 60,13 72,14 84,11 96,12"
          stroke="var(--mesh-ink-3)"
          strokeDasharray="3 3"
        />
      </svg>
    )
  },
  {
    Icon: Mail,
    title: "Concept-antwoorden",
    body: "Antwoorden in de toon van je winkel, met de bron van elk feit dat erin staat.",
    visual: (
      <span className="flex w-24 flex-col gap-1">
        <span className="h-1.5 w-full rounded-full bg-mesh-ink/30" />
        <span className="h-1.5 w-4/5 rounded-full bg-mesh-ink/30" />
        <span className="h-1.5 w-1/2 rounded-full bg-mesh-ink/60" />
      </span>
    )
  },
  {
    Icon: ShieldAlert,
    title: "Bewijspakketten",
    body: "Bij een geschil verzamelt Insyte de scan, de bezorgfoto, het gesprek en de factuur.",
    visual: (
      <span className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="flex size-4 items-center justify-center rounded-sm bg-mesh-ink/20 text-mesh-ink">
            <Check size={10} />
          </span>
        ))}
      </span>
    )
  },
  {
    Icon: Workflow,
    title: "AI-stappen in flows",
    body: "Beschrijf een flow in één zin. AI-stappen schrijven een antwoord, lezen het sentiment of vatten samen.",
    visual: (
      <span className="flex items-center gap-1">
        <span className="size-3 rounded-sm bg-mesh-ink/30" />
        <span className="h-px w-3 bg-mesh-ink/40" />
        <span className="flex size-4 items-center justify-center rounded-sm bg-arc text-mesh-ink">
          <Sparkles size={9} />
        </span>
        <span className="h-px w-3 bg-mesh-ink/40" />
        <span className="size-3 rounded-sm bg-mesh-ink/30" />
      </span>
    )
  },
  {
    Icon: FileText,
    title: "Herkomst bij elk getal",
    body: "Insyte noemt wat het las en welke tools het draaide. Elk getal is terug te vinden.",
    visual: (
      <span className="flex items-center gap-1 rounded-sm bg-mesh-ink/12 px-1.5 py-0.5 text-mesh-ink text-xs">
        <Inbox size={10} />
        Las 60 bestellingen
      </span>
    )
  }
]

function Capabilities() {
  return (
    <div className="relative mt-16 overflow-hidden rounded-xl bg-mesh-ink/[0.05] chalk-line">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
        {CAPS.map(({ Icon, body, title, visual }, i) => (
          <li key={title} className="relative flex flex-col gap-3 p-6 sm:p-7">
            {i % 3 !== 0
              ? <span aria-hidden className="absolute inset-y-0 left-0 hidden w-px dash-y-chalk lg:block" />
              : null}
            {i >= 3
              ? <span aria-hidden className="absolute inset-x-0 top-0 hidden h-px dash-x-chalk lg:block" />
              : null}
            {i > 0 ? <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x-chalk lg:hidden" /> : null}
            <div className="flex h-5 items-center">{visual}</div>
            <h3 className="flex items-center gap-2 font-medium text-lg text-mesh-ink">
              <Icon size={17} className="text-mesh-ink-2" />
              {title}
            </h3>
            <p className="max-w-[40ch] text-base text-mesh-ink-2">{body}</p>
          </li>
        ))}
      </ul>
      <p className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 py-4 text-mesh-ink text-sm">
        <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x-chalk" />
        <span className="flex items-center gap-1.5">
          <Check size={13} />
          Binnen jouw regels
        </span>
        <span aria-hidden className="text-mesh-ink-3">·</span>
        <span className="flex items-center gap-1.5">
          <FileText size={13} />
          Elk getal met bron
        </span>
        <span aria-hidden className="text-mesh-ink-3">·</span>
        <span className="flex items-center gap-1.5">
          <Undo2 size={13} />
          Ongedaan maken
        </span>
      </p>
    </div>
  )
}

/* ── Analytics ─────────────────────────────────────────────────────────────────────────────── */

const W = 620
const H = 190
const TOP = 10 // $k at the top of the chart
const X = (i: number) => (i / 30) * W
const Y = (v: number) => H - (v / TOP) * H
const line = (vals: ReadonlyArray<number>) =>
  vals.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ")

function RevenueChart({ reduced }: { readonly reduced: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "center 0.55"] })
  const drawn = useSpring(scrollYProgress, { stiffness: 140, damping: 30 })
  const band = useTransform(drawn, [0.75, 1], [0, 1])
  const last = MAY.length - 1
  const est = `M${X(last)} ${Y(MAY[last]!)} L${X(30)} ${Y(ESTIMATE.mid)}`
  const area = `M${X(last)} ${Y(MAY[last]!)} L${X(30)} ${Y(ESTIMATE.high)} L${X(30)} ${Y(ESTIMATE.low)} Z`
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" fill="none" aria-hidden>
        {[2.5, 5, 7.5, 10].map((v) => (
          <g key={v}>
            <line x1="0" x2={W} y1={Y(v)} y2={Y(v)} stroke="var(--ink-5)" strokeDasharray="3 5" />
            <text x="2" y={Y(v) + 12} fontSize="10" fill="var(--ink-3)">
              € {v.toLocaleString("nl-NL")}k
            </text>
          </g>
        ))}
        <path d={line(APRIL)} stroke="var(--ink-4)" strokeWidth="1.5" strokeDasharray="4 4" />
        <motion.path
          d={line(MAY)}
          stroke="var(--arc)"
          strokeWidth="2"
          style={reduced ? {} : { pathLength: drawn }}
        />
        <motion.g style={reduced ? {} : { opacity: band }}>
          <path d={area} fill="color-mix(in oklch, var(--arc) 12%, transparent)" />
          <path d={est} stroke="var(--arc)" strokeWidth="1.5" strokeDasharray="2 4" />
        </motion.g>
        {[0, 6, 13, 20, 26, 30].map((d) => (
          <text
            key={d}
            x={X(d)}
            y={H + 14}
            fontSize="10"
            fill="var(--ink-3)"
            textAnchor={d === 0 ? "start" : d === 30 ? "end" : "middle"}
          >
            {d + 1} mei
          </text>
        ))}
      </svg>
    </div>
  )
}

function AnalyticsWindow({ reduced }: { readonly reduced: boolean }) {
  return (
    <div
      aria-hidden
      inert
      className="w-[1080px] select-none overflow-hidden rounded-lg bg-paper p-6 text-left outline outline-mesh-ink/20 window-lift [zoom:0.33] sm:[zoom:0.5] md:[zoom:0.62] lg:[zoom:0.82] xl:[zoom:1]"
    >
      <div className="relative overflow-hidden rounded-xl bg-abyss px-6 py-5 text-mesh-ink">
        <span aria-hidden className="pointer-events-none absolute inset-0 drafting-chalk" />
        <div className="relative flex items-baseline gap-3">
          <span className="font-medium text-xl">Analyse</span>
          <span className="text-mesh-ink-2 text-sm">
            Wat Insyte leest in <span className="text-mesh-ink underline underline-offset-4">mei tot nu toe</span>{" "}
            tegenover <span className="text-mesh-ink underline underline-offset-4">april</span>
          </span>
        </div>
        <div className="relative mt-5 grid grid-cols-6">
          {FIGURES.map((f, i) => (
            <div key={f.label} className={cn("flex flex-col gap-2 pr-4", i > 0 && "border-mesh-ink/12 border-l pl-4")}>
              <span className="text-mesh-ink-2 text-sm">{f.label}</span>
              <span className="figure text-3xl">{f.value}</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="flex items-center gap-0.5 rounded-sm bg-mesh-ink/14 px-1.5 py-0.5 text-mesh-ink">
                  {f.up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                  {f.change}
                </span>
                <span className="text-mesh-ink-3">{f.was}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-[220px_minmax(0,1fr)_280px] gap-6">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 pb-1 font-medium text-ink text-sm">
            <Sparkles size={13} className="text-arc-ink" />
            Wat Insyte vond
          </span>
          {FINDINGS.map((f, i) => (
            <span
              key={f.title}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                i === 0 ? "bg-arc-tint text-arc-ink" : "text-ink-2"
              )}
            >
              <span className="w-3 text-ink-3 tabular-nums">{i + 1}</span>
              <span className="flex-1">{f.title}</span>
              <span className={cn("size-1.5 rounded-full", f.look ? "bg-arc" : "bg-ink-4")} />
            </span>
          ))}
          <span className="mt-1 px-2 text-ink-3 text-xs">
            <span className="mr-1 inline-block size-1.5 rounded-full bg-arc" />verdient aandacht
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-ink-3 text-sm">1 · Omzet</span>
          <p className="text-base text-ink">{REVENUE_FINDING}</p>
          <RevenueChart reduced={reduced} />
          <div className="flex items-center gap-4 text-ink-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-arc" />1–26 mei
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 border-ink-4 border-t border-dashed" />1–26 apr
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-arc-tint" />
              Schatting van Insyte voor de rest van de maand
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 rounded-lg bg-glacier p-4">
          <span className="font-medium text-ink text-sm">Vraag ernaar</span>
          <span className="ml-auto max-w-[90%] rounded-lg rounded-br-sm bg-paper px-2.5 py-1.5 text-ink text-xs hairline">
            {SUPPLIER_ANSWER.question}
          </span>
          <span className="text-ink-3 text-xs">1 s nagedacht</span>
          <p className="text-ink text-xs leading-relaxed">{SUPPLIER_ANSWER.answer}</p>
          <span className="pt-1 text-ink-3 text-xs">Te late pakketten per leverancier, mei</span>
          {SUPPLIER_ANSWER.rows.map((r) => (
            <span key={r.label} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate text-ink-2">{r.label}</span>
              <span className="h-2 flex-1 rounded-full bg-mist">
                <span
                  className={cn("block h-2 rounded-full", r.label === "Kestrel Goods" ? "bg-arc" : "bg-ink-4")}
                  style={{ width: `${(r.value / 15) * 100}%` }}
                />
              </span>
              <span className="w-9 text-right text-ink tabular-nums">{r.value.toLocaleString("nl-NL")}%</span>
            </span>
          ))}
        </div>
      </div>
      <p className="mt-5 text-ink-3 text-xs">
        Berekend uit 8.803 bestellingen sinds 1 januari, met hun leveringen, terugbetalingen en geschillen, en 478
        tickets.
      </p>
    </div>
  )
}

/* ── The section ───────────────────────────────────────────────────────────────────────────── */

export function Ai() {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  return (
    <section
      id="ai"
      aria-labelledby="ai-kop"
      data-ground="dark"
      className="chapter relative isolate overflow-hidden bg-abyss text-mesh-ink"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 drafting-chalk" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 hatch-chalk [mask-image:linear-gradient(180deg,black,transparent_35%,transparent_65%,black)]"
      />
      <Frame tone="dark" top={false} inner="pt-24 pb-24 sm:pt-32 sm:pb-32">
        <div className="mb-12 flex flex-col items-center gap-5 text-center">
          <h2 id="ai-kop" className="max-w-[20ch] font-medium text-4xl text-mesh-ink sm:text-display-sm">
            Insyte werkt voor je.
            <span className="block text-mesh-ink-2">Binnen jouw regels.</span>
          </h2>
          <p className="max-w-[56ch] text-lg text-mesh-ink-2">
            De Insyte-agent leest je wachtrij, je bestellingen en je gesprekken, en zet het werk klaar. Wat geld of
            klanten raakt, legt hij eerst aan je voor.
          </p>
          <ArrowLink href={links.inApp("/ask")} external onDark>Vraag Insyte openen</ArrowLink>
        </div>

        <AskDemo />
        <Autonomy />
        <Capabilities />

        <div id="analytics" className="mt-24 scroll-mt-24 sm:mt-28">
          <div className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end">
            <h3 className="max-w-[22ch] font-medium text-3xl text-mesh-ink sm:text-display-sm">
              Insyte leest je cijfers.
              <span className="block text-mesh-ink-2">En schrijft op wat er veranderde.</span>
            </h3>
            <div className="flex flex-col gap-4">
              <p className="max-w-[48ch] text-lg text-mesh-ink-2">
                Zes cijfers tegenover de vorige periode, en wat Insyte vond als zinnen met hun eigen grafiek. Vraag
                ernaar, en het antwoord komt uit dezelfde regels.
              </p>
              <ArrowLink href={links.inApp("/analytics")} external onDark>Analyse bekijken</ArrowLink>
            </div>
          </div>
          <div className="w-full overflow-hidden rounded-lg">
            <div className="mx-auto w-fit">
              <AnalyticsWindow reduced={reduced} />
            </div>
          </div>
        </div>
      </Frame>
    </section>
  )
}

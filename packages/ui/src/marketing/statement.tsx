import { motion, useInView, useReducedMotion } from "motion/react"
import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState } from "react"
import { ArrowUp, Check, CheckCircle2, type IconComponent, Plug, Sparkles } from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { Frame } from "./frame.tsx"
import { useTyped } from "./motion.tsx"
import { Logo, Mark, type Vendor } from "./parts.tsx"
import { useScrollVar } from "./scroll.ts"

type Word = { readonly text: string; readonly tone?: "arc" }

/* The sentence, word by word, with the words that carry the mechanism in the brand's ink. One
   colour, the brand blue; nothing else on the page colours a word. */
const SENTENCE: ReadonlyArray<Word> = [
  ..."Bestellingen, klanten, leveranciers en geschillen op".split(" ").map((text) => ({ text })),
  { text: "één", tone: "arc" },
  { text: "scherm.", tone: "arc" },
  ..."Insyte doet het".split(" ").map((text) => ({ text })),
  { text: "voorwerk,", tone: "arc" },
  { text: "en" },
  { text: "jij", tone: "arc" },
  { text: "beslist", tone: "arc" },
  ..."wat er de deur uitgaat.".split(" ").map((text) => ({ text }))
]

/* ── The three pictures ────────────────────────────────────────────────────────────────────── */

/* The services the demo workspace connects (workspace-store.ts and the automation steps), on a
   dashed ring around the mark. */
const ORBIT: ReadonlyArray<Vendor> = ["shopify", "gmail", "klarna", "stripe", "klaviyo", "slack", "aftership", "paypal"]

export function Orbit() {
  const r = 92
  return (
    <div className="relative size-[232px]">
      <span className="absolute inset-[24px] rounded-full border border-ink/16 border-dashed" />
      <span className="absolute inset-[72px] rounded-full border border-ink/10 border-dashed" />
      <div className="orbit-ring absolute inset-0">
        {ORBIT.map((v, i) => {
          const a = (i / ORBIT.length) * Math.PI * 2 - Math.PI / 2
          return (
            <span
              key={v}
              className="absolute"
              style={{ left: 116 + Math.cos(a) * r - 17, top: 116 + Math.sin(a) * r - 17 }}
            >
              <span className="orbit-mark block rounded-md shadow-sm">
                <Logo vendor={v} size={34} />
              </span>
            </span>
          )
        })}
      </div>
      <span className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-abyss window-lift">
        <Mark size={30} tone="white" />
      </span>
    </div>
  )
}

const QUESTION = "Welke bestellingen lopen vandaag uit?"

function Prompt({ run }: { readonly run: boolean }) {
  const typed = useTyped(QUESTION, run, 500)
  const done = typed.length === QUESTION.length
  return (
    <div className="flex w-full max-w-[280px] flex-col gap-2">
      <div className="flex flex-col gap-3 rounded-lg bg-paper p-3 window-lift">
        <p className="min-h-[2.8em] text-base text-ink">
          {typed}
          {done ? null : <span className="ml-px inline-block h-4 w-px translate-y-0.5 bg-arc-ink" />}
        </p>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-ink-3 text-sm">
            <Sparkles size={13} className="text-arc-ink" />
            Vraag Insyte
          </span>
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors duration-300",
              done ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-3"
            )}
          >
            <ArrowUp size={14} />
          </span>
        </div>
      </div>
      <motion.div
        initial={false}
        animate={{ opacity: done ? 1 : 0, y: done ? 0 : 6 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: done && run ? 0.3 : 0 }}
        className="rounded-lg bg-arc-tint px-3 py-2 text-arc-ink text-sm"
      >
        3 bij Allure, 1 tot 2 dagen. Het bericht staat klaar.
      </motion.div>
    </div>
  )
}

/* Revenue in May against April, the analytics screen's own comparison. */
const MAY = "M0 70 L40 58 L80 64 L120 46 L160 52 L200 40 L240 48 L280 30 L320 38 L360 24 L400 30 L440 16"
const APRIL = "M0 74 L40 70 L80 72 L120 62 L160 66 L200 58 L240 62 L280 52 L320 56 L360 48 L400 52 L440 44"

function Chart({ run }: { readonly run: boolean }) {
  return (
    <div className="flex w-full max-w-[300px] flex-col gap-3 rounded-lg bg-paper p-4 window-lift">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-ink text-sm">Omzet</span>
        <span className="figure text-2xl text-ink">€ 165.050</span>
      </div>
      <svg viewBox="0 0 440 80" className="h-24 w-full" fill="none" preserveAspectRatio="none" aria-hidden>
        {[20, 40, 60].map((y) => (
          <line key={y} x1="0" x2="440" y1={y} y2={y} stroke="var(--ink-5)" strokeDasharray="3 5" />
        ))}
        <path
          d={APRIL}
          stroke="var(--ink-4)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <motion.path
          d={MAY}
          stroke="var(--arc)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          initial={false}
          animate={{ pathLength: run ? [0, 1] : 1 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="flex items-center gap-4 text-ink-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-arc" />
          mei
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 border-ink-4 border-t border-dashed" />
          april
        </span>
        <span className="ml-auto rounded-sm bg-arc-tint px-1.5 text-arc-ink">+7,6%</span>
      </div>
    </div>
  )
}

/* ── How it works ──────────────────────────────────────────────────────────────────────────── */

type Step = {
  readonly Icon: IconComponent
  readonly title: string
  readonly body: string
  readonly checks: readonly [string, string, string]
  readonly picture: (run: boolean) => ReactNode
}

const STEPS: ReadonlyArray<Step> = [
  {
    Icon: Plug,
    title: "Koppel je winkel",
    body: "Shopify met één klik, daarna je inbox, je betaalproviders en je vervoerders.",
    checks: [
      "Shopify via OAuth, meerdere winkels",
      "Gmail of Outlook voor je inbox",
      "Klarna, Stripe en PayPal voor geschillen"
    ],
    picture: () => <Orbit />
  },
  {
    Icon: Sparkles,
    title: "Insyte pakt het werk op",
    body: "Het leest bestellingen, tickets en geschillen en zet het werk klaar, met de bron van elk feit.",
    checks: ["Concepten in de toon van je merk", "Bewijspakketten voor chargebacks", "Vraag Insyte in elk paneel"],
    picture: (run) => <Prompt run={run} />
  },
  {
    Icon: CheckCircle2,
    title: "Jij stelt de regels",
    body: "Wat geld of klanten raakt, legt Insyte eerst aan je voor. In de cijfers zie je daarna wat het opleverde.",
    checks: [
      "Eerst vragen bij geld en klantcontact",
      "Ongedaan maken bij alles wat terug kan",
      "Elk cijfer herleidbaar tot zijn bron"
    ],
    picture: (run) => <Chart run={run} />
  }
]

/**
 * How it works, in three columns split by dashed rules (Mora's row, with Calendly's expanding
 * step): each has a working picture above and its claim below. One column is open at a time and
 * shows its three checks; it moves on by itself while the row is on screen, and the pointer or focus
 * opens the one it is on. On a phone, and under reduced motion, every column is open.
 */
function HowItWorks() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const inView = useInView(ref, { amount: 0.4 })
  const [open, setOpen] = useState(0)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (reduced || !inView || held) return
    const id = window.setTimeout(() => setOpen((o) => (o + 1) % STEPS.length), 6000)
    return () => window.clearTimeout(id)
  }, [reduced, inView, held, open])

  const cols = STEPS.map((_, i) => (i === open ? "1.45fr" : "1fr")).join(" ")

  return (
    <div
      ref={ref}
      className="relative mt-14 md:grid md:transition-[grid-template-columns] md:duration-[600ms] md:ease-[var(--ease-out-expo)] sm:mt-16"
      style={{ gridTemplateColumns: cols }}
      onPointerLeave={() => setHeld(false)}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
      {STEPS.map((s, i) => {
        const active = i === open || reduced
        return (
          <div
            key={s.title}
            onPointerEnter={() => {
              setHeld(true)
              setOpen(i)
            }}
            onFocus={() => {
              setHeld(true)
              setOpen(i)
            }}
            className="relative flex min-w-0 flex-col max-md:border-ink/10 max-md:border-b max-md:last:border-b-0"
          >
            {i > 0 ? <span aria-hidden className="absolute inset-y-0 left-0 hidden w-px dash-y md:block" /> : null}
            <div
              aria-hidden
              inert
              className={cn(
                "flex h-[280px] items-center justify-center overflow-hidden px-5 transition-opacity duration-500",
                active ? "opacity-100" : "md:opacity-55"
              )}
            >
              {s.picture(inView && !reduced && i === open)}
            </div>
            <div className="flex flex-col gap-2 px-6 pb-8 sm:px-8">
              <h3 className="flex items-center gap-2 font-medium text-ink text-lg">
                <s.Icon size={18} className="text-arc-ink" />
                <button
                  type="button"
                  aria-expanded={active}
                  onClick={() => {
                    setHeld(true)
                    setOpen(i)
                  }}
                  className="text-left"
                >
                  {s.title}
                </button>
              </h3>
              <p className="max-w-[40ch] text-base text-ink-3">{s.body}</p>
              <ul
                className={cn(
                  "mt-2 flex flex-col gap-1.5 overflow-hidden transition-[opacity,max-height] duration-500 ease-[var(--ease-out-expo)]",
                  active ? "max-h-40 opacity-100" : "md:max-h-0 md:opacity-0"
                )}
              >
                {s.checks.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-base text-ink">
                    <Check size={15} className="mt-0.5 shrink-0 text-arc-ink" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The statement: one sentence that lights up word by word as it crosses the screen, driven by
 * `--p` rather than by per-word state, then how it works in three columns.
 */
export function Statement() {
  const ref = useRef<HTMLDivElement | null>(null)
  useScrollVar(ref, { offset: ["start 0.9", "end 0.55"] })
  const n = SENTENCE.length

  return (
    <section aria-labelledby="statement" className="bg-paper">
      <Frame inner="pt-20 pb-20 sm:pt-28 sm:pb-24">
        <div ref={ref} style={{ "--p": 1 } as CSSProperties}>
          <h2
            id="statement"
            className="mx-auto max-w-[24ch] text-center font-medium text-3xl text-ink sm:text-display-sm"
          >
            {SENTENCE.map((w, i) => (
              <Fragment key={i}>
                <span
                  className={cn("reveal-word", w.tone === "arc" && "text-arc-ink")}
                  style={{ "--i": (i / n).toFixed(3) } as CSSProperties}
                >
                  {w.text}
                </span>
                {" "}
              </Fragment>
            ))}
          </h2>
        </div>
        <HowItWorks />
      </Frame>
    </section>
  )
}

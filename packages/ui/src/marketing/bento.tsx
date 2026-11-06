import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react"
import { Check, CheckCircle2, CornerDownLeft, Edit3, MousePointer2, Sparkles, Truck } from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { MAY, SUPPLIER_ANSWER } from "./ai-data.ts"
import { type ProductKey, PRODUCTS, thumb } from "./demo-data.ts"
import { Frame } from "./frame.tsx"
import { useTyped } from "./motion.tsx"
import { Logo } from "./parts.tsx"

/*
 * The bento: six of the product's own moments as one composed object — a 4 × 3 rectangle with an
 * 8px seam, on three grounds only (abyss, paper, mist) so no two side-neighbours share one; arc is
 * an accent inside a tile, never a ground. Each tile holds one clear product moment, straight and
 * aligned, with generous padding: the ground's own pattern (the drafting grid on abyss, construction
 * crosses on paper and mist) and one small loop of its own that runs only while it is seen,
 * staggered so the grid is alive but calm. The server, reduced motion and an unseen tile show the
 * finished frame.
 */

const EASE = [0.16, 1, 0.3, 1] as const

/** A tile's own loop: steps 0 → n-1 at its own pace while in view; `last` when still. */
function useTileLoop(n: number, hold: number, offset: number) {
  const ref = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion() === true
  const seen = useInView(ref, { amount: 0.35 })
  const run = seen && !reduced
  const [step, setStep] = useState(n - 1)
  const started = useRef(false)
  useEffect(() => {
    if (!run) return
    const first = !started.current
    started.current = true
    const id = window.setTimeout(() => setStep((s) => (first ? 0 : (s + 1) % n)), first ? offset : hold)
    return () => window.clearTimeout(id)
  }, [run, step, n, hold, offset])
  return { ref, step: run || started.current ? step : n - 1, run }
}

type Ground = "abyss" | "mist" | "paper"

const GROUND: Record<Ground, string> = {
  abyss: "bg-abyss text-mesh-ink",
  mist: "bg-mist text-ink hairline",
  paper: "bg-paper text-ink hairline"
}

/** Four small construction crosses at the corners: a drawing's own marks, on the light grounds. */
function Marks() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-3 -z-10">
      {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "right-0 bottom-0"].map((p) => (
        <span key={p} className={cn("absolute size-2.5", p)}>
          <span className="absolute top-1/2 left-0 h-px w-full bg-ink/20" />
          <span className="absolute top-0 left-1/2 h-full w-px bg-ink/20" />
        </span>
      ))}
    </span>
  )
}

function Tile(
  { className, children, title, ground, tileRef }: {
    readonly className?: string
    readonly children: ReactNode
    readonly title: string
    readonly ground: Ground
    readonly tileRef: RefObject<HTMLElement | null>
  }
) {
  return (
    <article
      ref={tileRef as RefObject<HTMLElement>}
      className={cn("relative isolate flex flex-col overflow-hidden rounded-lg", GROUND[ground], className)}
    >
      {ground === "abyss" ? <div aria-hidden className="absolute inset-0 -z-10 drafting-chalk" /> : null}
      {ground === "abyss" ? null : <Marks />}
      <h3
        className={cn(
          "relative z-10 max-w-[22ch] px-6 pt-6 font-medium text-lg sm:px-7 sm:pt-7",
          ground === "abyss" ? "text-mesh-ink" : "text-ink"
        )}
      >
        {title}
      </h3>
      <div aria-hidden className="relative flex flex-1 flex-col">{children}</div>
    </article>
  )
}

/* ── 1. The proposal: the plate, and the toast when it is filed ──────────────────────────── */

function Proposal() {
  const { ref, step, run } = useTileLoop(4, 1500, 600)
  const pointer = run && (step === 1 || step === 2)
  const pressed = run && step === 2
  const sent = step === 3
  return (
    <Tile
      tileRef={ref}
      ground="abyss"
      title="Elk voorstel draagt zijn zekerheid."
      className="md:col-span-2"
    >
      <div className="flex flex-1 flex-col gap-3 px-6 pt-5 pb-6 sm:px-7 sm:pb-7">
        <div className="rounded-lg bg-mesh-ink/[0.07] p-5 chalk-line sm:p-6">
          <div className="flex items-center gap-2 text-mesh-ink-2 text-sm">
            <Sparkles size={14} />
            Voorstel van Insyte
            <span className="ml-auto flex items-center gap-1.5">
              <Logo vendor="gmail" size={16} />
              Ticket #5142
            </span>
          </div>
          <span className="mt-4 block text-mesh-ink-2 text-sm">Terugbetaling aan Mateo R.</span>
          <span className="figure mt-1 block text-6xl">€ 89,95</span>
          <span className="mt-4 flex items-center gap-2.5 text-mesh-ink-2 text-sm">
            <span className="h-px w-8 border-mesh-ink-3 border-t border-dashed" />
            <span className="size-1.5 bg-mesh-ink" />
            Retour ontvangen op 21 mei, binnen het beleid
          </span>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="text-mesh-ink-2">Zekerheid</span>
            <span className="relative h-px flex-1 bg-mesh-ink/20">
              <span className="absolute inset-y-0 left-0 w-[92%] bg-mesh-ink" />
              <span className="absolute top-1/2 left-0 h-2.5 w-px -translate-y-1/2 bg-mesh-ink" />
              <span className="absolute top-1/2 left-[92%] h-2.5 w-px -translate-y-1/2 bg-mesh-ink" />
            </span>
            <span className="tabular-nums">92%</span>
          </div>
          <div className="mt-5 flex gap-2">
            <span
              className={cn(
                "relative inline-flex h-10 items-center gap-1.5 rounded-md bg-arc px-4 font-medium text-sm transition-transform duration-150",
                pressed && "scale-95"
              )}
            >
              {sent ? <Check size={14} /> : null}
              {sent ? "Ingediend" : "Indienen"}
              <AnimatePresence>
                {pointer
                  ? (
                    <motion.span
                      initial={{ opacity: 0, x: 60, y: 40 }}
                      animate={{ opacity: 1, x: 0, y: 0, scale: pressed ? 0.85 : 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: EASE }}
                      className="absolute top-6 left-14"
                    >
                      <MousePointer2 size={20} className="fill-abyss" />
                    </motion.span>
                  )
                  : null}
              </AnimatePresence>
            </span>
            <span className="inline-flex h-10 items-center gap-1.5 rounded-md bg-mesh-ink/12 px-4 font-medium text-sm">
              <Edit3 size={14} />
              Bewerken
            </span>
          </div>
        </div>
        <div className="h-12">
          <AnimatePresence>
            {sent || !run
              ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="flex h-12 items-center gap-2.5 rounded-lg bg-abyss-2 px-4 text-sm chalk-line"
                >
                  <CheckCircle2 size={15} />
                  Terugbetaling verstuurd
                  <span className="ml-auto flex items-center gap-1 font-medium text-mesh-ink-2">
                    <CornerDownLeft size={13} />
                    Ongedaan maken
                  </span>
                </motion.div>
              )
              : null}
          </AnimatePresence>
        </div>
      </div>
    </Tile>
  )
}

/* ── 2. Revenue: the hero's € 172.855, its 30 days edge to edge, scrubbable ────────────────── */

/* The 30 days behind the dashboard's € 172.855 (both stores, euros): the daily shape of the
   console's revenue chart, scaled so the days add up to the total. */
const SHAPE = [...MAY, ...MAY.slice(0, 4)]
const SUM = SHAPE.reduce((a, b) => a + b, 0)
const DAYS = SHAPE.map((v) => (v / SUM) * 172_855)
const W = 300
const H = 120
/* An honest baseline: zero at the foot and a quarter of headroom over the best day, so the daily
   variation reads as the gentle thing it is. */
const TOP = Math.max(...DAYS) * 1.25
/* The line is the three-day average, so a single busy day does not read as a spike; the tooltip
   still gives each day's own figure. */
const SMOOTH = DAYS.map((_, i) => {
  const w = DAYS.slice(Math.max(0, i - 1), i + 2)
  return w.reduce((x, y) => x + y, 0) / w.length
})
const pts = SMOOTH.map((v, i) => [(i / (DAYS.length - 1)) * W, H - (v / TOP) * H] as const)

/** A monotone cubic through the points (Fritsch–Carlson), as d3's curveMonotoneX draws it. */
function monotone(p: ReadonlyArray<readonly [number, number]>): string {
  const n = p.length
  const dx = p.slice(1).map((q, i) => q[0] - p[i]![0])
  const m = p.slice(1).map((q, i) => (q[1] - p[i]![1]) / dx[i]!)
  const t = p.map((_, i) => {
    if (i === 0) return m[0]!
    if (i === n - 1) return m[n - 2]!
    const a = m[i - 1]!
    const b = m[i]!
    return a * b <= 0
      ? 0
      : (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b)
  })
  let d = `M${p[0]![0].toFixed(1)} ${p[0]![1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3
    const [x0, y0] = p[i]!
    const [x1, y1] = p[i + 1]!
    d += ` C${(x0 + h).toFixed(1)} ${(y0 + h * t[i]!).toFixed(1)} ${(x1 - h).toFixed(1)} ${
      (y1 - h * t[i + 1]!).toFixed(1)
    } ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return d
}

const LINE = monotone(pts)
const AREA = `${LINE} L${W} ${H} L0 ${H} Z`
const eur = (n: number) => `€ ${Math.round(n).toLocaleString("nl-NL")}`

function Revenue() {
  const { ref, step, run } = useTileLoop(4, 1700, 1100)
  const [hover, setHover] = useState<number | null>(null)
  const at = hover ?? ([9, 16, 22, 27][step] ?? 22)
  const [x, y] = pts[at]!
  return (
    <Tile tileRef={ref} ground="paper" title="Cijfers met hun herkomst.">
      <div className="flex items-baseline justify-between gap-2 px-6 pt-4 sm:px-7">
        <span className="figure whitespace-nowrap text-4xl text-ink">€ 172.855</span>
        <span className="rounded-sm bg-arc-tint px-1.5 text-arc-ink text-xs">+4,9%</span>
      </div>
      <span className="px-6 pt-1.5 text-ink-3 text-sm sm:px-7">30 dagen · 1.828 bestellingen</span>
      <div
        className="relative mt-4 min-h-[150px] flex-1"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.round(((e.clientX - r.left) / r.width) * (DAYS.length - 1))
          setHover(Math.max(0, Math.min(DAYS.length - 1, i)))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          fill="none"
        >
          <path d={AREA} fill="var(--arc)" fillOpacity="0.12" />
          <motion.path
            d={LINE}
            stroke="var(--arc)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            initial={false}
            animate={{ pathLength: run && step === 0 ? [0, 1] : 1 }}
            transition={{ duration: 1.4, ease: EASE }}
          />
        </svg>
        <span
          className="pointer-events-none absolute bottom-0 w-px bg-arc/50 transition-[left,height] duration-300 ease-[var(--ease-out-quart)]"
          style={{ left: `${(x / W) * 100}%`, height: `${((H - y) / H) * 100}%` }}
        />
        <span
          className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-md bg-abyss px-2 py-1 text-mesh-ink text-xs transition-[left,bottom] duration-300 ease-[var(--ease-out-quart)]"
          style={{
            left: `${Math.min(82, Math.max(18, (x / W) * 100))}%`,
            bottom: `min(calc(${((H - y) / H) * 100}% + 8px), calc(100% - 48px))`
          }}
        >
          <span className="text-mesh-ink-2">dag {at + 1}</span>
          <span className="tabular-nums">{eur(DAYS[at]!)}</span>
        </span>
      </div>
    </Tile>
  )
}

/* ── 3. Evidence: four files ticking in against the deadline ───────────────────────────────── */

const PACK: ReadonlyArray<{ name: string; file: string; kind: "PDF" | "JPG" | "EML" }> = [
  { name: "Orderbon", file: "order-2214", kind: "PDF" },
  { name: "Verzendbevestiging", file: "dhl-NL12834", kind: "PDF" },
  { name: "Bewijs van levering", file: "aflevering", kind: "JPG" },
  { name: "E-mailgesprek", file: "ticket-4081", kind: "EML" }
]

function Evidence() {
  const { ref, step } = useTileLoop(6, 800, 300)
  const done = Math.min(PACK.length, step)
  const complete = step >= PACK.length
  const left = 250 - step
  const ring = 2 * Math.PI * 18
  return (
    <Tile tileRef={ref} ground="mist" title="Bewijs vóór de deadline.">
      <div className="flex flex-1 flex-col gap-4 px-6 pt-5 pb-6 sm:px-7 sm:pb-7">
        <div className="flex items-center gap-3">
          <Logo vendor="klarna" size={36} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="font-medium text-base text-ink">DSP-2214</span>
            <span className="text-ink-3 text-sm tabular-nums">€ 248,00</span>
          </span>
          <span className="relative flex size-14 shrink-0 items-center justify-center">
            <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90">
              <circle
                cx="22"
                cy="22"
                r="18"
                stroke="var(--ink)"
                strokeOpacity="0.1"
                strokeWidth="2.5"
                fill="none"
              />
              <circle
                cx="22"
                cy="22"
                r="18"
                stroke="var(--arc)"
                strokeWidth="2.5"
                fill="none"
                strokeDasharray={ring}
                strokeDashoffset={ring * (1 - left / 360)}
                className="transition-[stroke-dashoffset] duration-700"
              />
            </svg>
            <span className="text-2xs text-ink leading-none tabular-nums">
              {Math.floor(left / 60)}u {String(left % 60).padStart(2, "0")}m
            </span>
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {PACK.map(({ file, kind, name }, i) => {
            const on = i < done
            return (
              <li
                key={name}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-300",
                  on ? "bg-paper hairline" : "bg-paper/50"
                )}
              >
                <span className="flex h-8 w-7 shrink-0 items-end justify-center rounded-sm bg-mist pb-0.5 text-2xs text-ink-3">
                  {kind}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className={cn("truncate text-sm transition-colors", on ? "text-ink" : "text-ink-3")}>
                    {name}
                  </span>
                  <span className="text-ink-3 text-xs">{file}</span>
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full transition-[background-color,transform] duration-300",
                    on ? "scale-100 bg-arc text-mesh-ink" : "scale-75 bg-ink-5"
                  )}
                >
                  {on ? <Check size={11} /> : null}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="mt-auto flex h-10 items-center">
          <AnimatePresence mode="wait" initial={false}>
            {complete
              ? (
                <motion.span
                  key="stamp"
                  initial={{ opacity: 0, scale: 1.25 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-ink px-2.5 py-1.5 font-medium text-ink text-sm"
                >
                  <Check size={13} />
                  Bewijspakket compleet
                </motion.span>
              )
              : (
                <motion.span
                  key="count"
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap text-ink-3 text-sm tabular-nums"
                >
                  {done} van {PACK.length} verzameld
                </motion.span>
              )}
          </AnimatePresence>
        </div>
      </div>
    </Tile>
  )
}

/* ── 4. Ask: one turn, from the question to its bars ───────────────────────────────────────── */

const ANSWER = "Kestrel Goods: 13,1% te laat in mei, tegen 8,2% in april."

function Ask() {
  /* Resting state is the whole turn; the loop re-types the answer, then sweeps the bars. */
  const { ref, step, run } = useTileLoop(2, 3200, 1700)
  const typed = useTyped(ANSWER, run && step === 0, 150)
  const sweep = run && step === 1
  return (
    <Tile tileRef={ref} ground="paper" title="Vraag het in gewoon Nederlands.">
      <div className="flex flex-1 flex-col justify-end gap-3 px-6 pt-4 pb-6 sm:px-7">
        <span className="self-end rounded-lg rounded-br-sm bg-abyss px-3 py-1.5 text-mesh-ink text-sm">
          {SUPPLIER_ANSWER.question}
        </span>
        <span className="flex items-center gap-1.5 text-ink-3 text-xs">
          <Check size={12} className="text-arc-ink" />2 s nagedacht · leveringen gelezen
        </span>
        <p className="min-h-[2.8em] text-ink text-sm">{run ? typed : ANSWER}</p>
        <div className="flex flex-col gap-1.5">
          {SUPPLIER_ANSWER.rows.map((r, i) => (
            <div key={r.label} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate text-ink-2">{r.label}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-mist">
                <span
                  className={cn("block h-full rounded-full", i === 0 ? "bg-arc" : "bg-ink-4")}
                  style={{ width: `${(r.value / 14) * 100}%` }}
                />
                {sweep
                  ? (
                    <motion.span
                      aria-hidden
                      className="absolute inset-y-0 w-8 bg-paper/70"
                      initial={{ left: "-15%" }}
                      animate={{ left: "110%" }}
                      transition={{ duration: 1.1, ease: EASE, delay: i * 0.15 }}
                    />
                  )
                  : null}
              </span>
              <span className="w-9 text-right text-ink tabular-nums">{r.value.toLocaleString("nl-NL")}%</span>
            </div>
          ))}
        </div>
      </div>
    </Tile>
  )
}

/* ── 5. Late orders: the rows, and the message to the supplier going out ───────────────────── */

const LATE: ReadonlyArray<{ id: string; p: ProductKey; late: string }> = [
  { id: "SO-12231", p: "fleece", late: "+2 dagen" },
  { id: "SO-12236", p: "crewneck", late: "+1 dag" },
  { id: "SO-12240", p: "beanie", late: "+1 dag" }
]

function LateOrders() {
  const { ref, step, run } = useTileLoop(3, 1700, 900)
  const pressed = run && step === 1
  const sent = step === 2
  return (
    <Tile
      tileRef={ref}
      ground="mist"
      title="De late bestelling meldt zichzelf."
      className="md:order-last md:col-span-2 lg:order-none"
    >
      <div className="grid flex-1 items-end gap-4 px-6 pt-4 pb-6 sm:grid-cols-2 sm:px-7 sm:pb-7">
        <div className="flex flex-col gap-2">
          {LATE.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-md bg-paper px-3 py-2.5 hairline">
              <img
                src={thumb(PRODUCTS[o.p].img)}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                className="size-8 shrink-0 rounded-sm bg-mist object-cover"
              />
              <span className="flex-1 font-medium text-ink text-sm tabular-nums">{o.id}</span>
              <span className="rounded-sm bg-arc-tint px-1.5 py-0.5 text-arc-ink text-xs tabular-nums">{o.late}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-md bg-paper p-4 hairline">
          <span className="text-ink-3 text-xs">Aan Allure Fulfillment</span>
          <p className="text-ink text-sm">
            Deze drie bestellingen lopen 1 tot 2 dagen achter. Kunnen jullie vandaag de verzenddatum bevestigen?
          </p>
          <span
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-md font-medium text-sm transition-[transform,background-color] duration-200",
              sent ? "bg-arc-tint text-arc-ink" : "bg-abyss text-mesh-ink",
              pressed && "scale-95"
            )}
          >
            {sent ? <Check size={14} /> : <Sparkles size={14} />}
            {sent ? "Verstuurd" : "Allure aansporen"}
          </span>
        </div>
      </div>
    </Tile>
  )
}

/* ── 6. The hand-off: the truck along the track, and what happened when ────────────────────── */

const STAGES = [
  { what: "Geaccepteerd", at: "di 11:42", line: "Allure accepteert SO-12231" },
  { what: "Verzonden", at: "wo 08:05", line: "DHL haalt op · NL12834" },
  { what: "Bezorgd", at: "do 14:20", line: "Bezorgd en getekend" }
] as const

function Handoff() {
  const { ref, step } = useTileLoop(3, 1700, 1400)
  return (
    <Tile tileRef={ref} ground="abyss" title="Leveranciers, op het spoor.">
      <div className="flex flex-1 flex-col gap-4 px-6 pt-4 pb-6 sm:px-7 sm:pb-7">
        <span className="flex items-center gap-2 text-mesh-ink-2 text-sm">
          <Logo vendor="dhl" size={20} />
          SO-12231 · NL12834
        </span>
        <ol className="relative flex flex-col gap-4 pl-12">
          <span aria-hidden className="absolute top-2 bottom-2 left-[17px] w-px bg-mesh-ink/20" />
          <span
            aria-hidden
            className="absolute top-2 left-[17px] w-px bg-mesh-ink transition-[height] duration-[1200ms] ease-[var(--ease-out-expo)]"
            style={{ height: `calc((100% - 1rem) * ${step / 2})` }}
          />
          <span
            aria-hidden
            className="absolute left-0 flex size-9 items-center justify-center rounded-md bg-arc transition-[top] duration-[1200ms] ease-[var(--ease-out-expo)]"
            style={{ top: `calc((100% - 2.25rem) * ${step / 2})` }}
          >
            <Truck size={16} />
          </span>
          {STAGES.map((s, i) => (
            <li
              key={s.what}
              className={cn(
                "flex flex-col leading-tight transition-opacity duration-500",
                i <= step ? "opacity-100" : "opacity-40"
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-sm">{s.what}</span>
                <span className="text-mesh-ink-2 text-xs tabular-nums">{s.at}</span>
              </span>
              <span className="text-mesh-ink-2 text-xs">{s.line}</span>
            </li>
          ))}
        </ol>
      </div>
    </Tile>
  )
}

/*
 * The rhythm (4 × 2): proposal abyss (wide) · revenue paper · evidence mist / ask paper · late
 * orders mist (wide) · hand-off abyss. One abyss tile per row, at opposite corners; side-neighbours
 * never share a ground. Row heights follow their content.
 */
export function Bento() {
  return (
    <section aria-labelledby="bento-kop" className="overflow-x-clip bg-glacier">
      <Frame inner="py-24 sm:py-32">
        <div className="flex max-w-[40rem] flex-col gap-5">
          <h2 id="bento-kop" className="font-medium text-4xl text-ink sm:text-display-sm">
            Het voorwerk, overal in de winkel.
          </h2>
          <p className="max-w-[52ch] text-ink-2 text-lg">
            Elk scherm van Insyte doet hetzelfde: het leest wat er binnenkomt en zet het werk klaar. Wat geld of klanten
            raakt, wacht op jou.
          </p>
        </div>
        <div className="mt-14 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <Proposal />
          <Revenue />
          <Evidence />
          <Ask />
          <LateOrders />
          <Handoff />
        </div>
      </Frame>
    </section>
  )
}

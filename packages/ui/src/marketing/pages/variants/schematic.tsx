import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { type ReactNode, useRef } from "react"
import { Check, FileText, Inbox, Link2, Package, ShieldCheck, Sparkles, Truck, Workflow } from "../../../icons.tsx"
import { cn } from "../../../lib/utils.ts"
import { Logo } from "../../parts.tsx"
import { useRunning } from "../hooks.ts"

/*
 * The schematic: the blueprint behind a page's hero. Rounded component outlines — cards, rings,
 * slots — on the 32px drafting grid, joined by orthogonal connectors with small square nodes where
 * they meet and registration crosses at a few intersections, and in the cards a handful of the
 * product's own pieces drawn as schematics (the queue, a proposal with its confidence, a store
 * syncing, an evidence pack). Three or four pulses run along the connectors, each a short dash
 * travelling for a few seconds.
 *
 * Built to cost nothing: one static SVG in a 1440 × 720 field that covers its box like
 * `object-fit: cover` (container query units, so the HTML widgets stay registered to the SVG), the
 * pulses are CSS animations paused off screen and in a hidden tab (`data-run`), the parallax is a
 * motion value written straight to a transform, and React renders it once. Reduced motion draws it
 * still and without pulses. `aria-hidden`: it is a drawing.
 */

export type Motif = "product" | "operator" | "supplier" | "partner" | "quiet"
export type Tone = "dark" | "light"

const W = 1440
const H = 720

/** An orthogonal route through `pts` with rounded corners of radius `r`. */
function route(pts: ReadonlyArray<readonly [number, number]>, r = 16): string {
  let d = `M${pts[0]![0]} ${pts[0]![1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]!
    const [x, y] = pts[i]!
    const [nx, ny] = pts[i + 1]!
    const inx = Math.sign(x - px)
    const iny = Math.sign(y - py)
    const outx = Math.sign(nx - x)
    const outy = Math.sign(ny - y)
    d += ` L${x - inx * r} ${y - iny * r} Q${x} ${y} ${x + outx * r} ${y + outy * r}`
  }
  const last = pts[pts.length - 1]!
  return `${d} L${last[0]} ${last[1]}`
}

const mirror = (x: number, w = 0) => W - x - w

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly r?: number }

/* The field, symmetric about the centre, the middle kept quiet for the copy. */
const CARDS: ReadonlyArray<Box> = [
  { x: 56, y: 96, w: 232, h: 168, r: 24 },
  { x: 104, y: 440, w: 200, h: 176, r: 24 },
  { x: mirror(56, 232), y: 96, w: 232, h: 168, r: 24 },
  { x: mirror(104, 200), y: 440, w: 200, h: 176, r: 24 }
]

const SLOTS: ReadonlyArray<Box> = [
  { x: 336, y: 328, w: 112, h: 32, r: 16 },
  { x: mirror(336, 112), y: 328, w: 112, h: 32, r: 16 },
  { x: 584, y: 640, w: 272, h: 40, r: 20 }
]

const RINGS: ReadonlyArray<readonly [number, number, number]> = [
  [360, 176, 28],
  [mirror(360), 176, 28],
  [344, 560, 20],
  [mirror(344), 560, 20]
]

/** The frame the copy sits in, drawn faint behind it. */
const FRAME: Box = { x: 448, y: 72, w: 544, h: 456, r: 32 }

const ROUTES: ReadonlyArray<string> = [
  route([[288, 180], [360, 180], [360, 204]]),
  route([[388, 176], [448, 176]]),
  route([[288, 232], [320, 232], [320, 344], [336, 344]]),
  route([[448, 344], [448, 344]]),
  route([[304, 528], [344, 528], [344, 540]]),
  route([[204, 264], [204, 440]]),
  route([[364, 560], [416, 560], [416, 660], [584, 660]]),
  route([[mirror(288), 180], [mirror(360), 180], [mirror(360), 204]]),
  route([[mirror(388), 176], [mirror(448), 176]]),
  route([[mirror(288), 232], [mirror(320), 232], [mirror(320), 344], [mirror(336), 344]]),
  route([[mirror(304), 528], [mirror(344), 528], [mirror(344), 540]]),
  route([[mirror(204), 264], [mirror(204), 440]]),
  route([[mirror(364), 560], [mirror(416), 560], [mirror(416), 660], [mirror(584), 660]]),
  route([[720, 528], [720, 640]]),
  route([[448, 344], [416, 344], [416, 400], [304, 400], [304, 440]], 12),
  route([[mirror(448), 344], [mirror(416), 344], [mirror(416), 400], [mirror(304), 400], [mirror(304), 440]], 12)
]

/** The routes pulses travel, with their period and delay in seconds. */
const PULSES: ReadonlyArray<readonly [number, number, number]> = [
  [2, 5.2, 0],
  [9, 6.4, 1.6],
  [6, 4.6, 3.1],
  [12, 5.8, 2.2],
  [14, 7, 4.4]
]

const NODES: ReadonlyArray<readonly [number, number]> = [
  [288, 180],
  [448, 176],
  [336, 344],
  [304, 528],
  [584, 660],
  [204, 264],
  [mirror(288), 180],
  [mirror(448), 176],
  [mirror(336), 344],
  [mirror(304), 528],
  [mirror(584), 660],
  [mirror(204), 264],
  [720, 528],
  [448, 344],
  [mirror(448), 344]
]

const CROSSES: ReadonlyArray<readonly [number, number]> = [
  [32, 32],
  [W - 32, 32],
  [480, 608],
  [mirror(480), 608],
  [224, 352],
  [mirror(224), 352],
  [608, 32],
  [mirror(608), 32]
]

/* ── The widgets: the product's pieces, drawn into the cards ─────────────────────────────────── */

function Line({ w, strong = false }: { readonly w: string; readonly strong?: boolean }) {
  return (
    <span
      className={cn("block h-[5px] rounded-full", strong ? "bg-current opacity-60" : "bg-current opacity-25")}
      style={{ width: w }}
    />
  )
}

function Widget({ box, children }: { readonly box: Box; readonly children: ReactNode }) {
  return (
    <div
      className="absolute flex flex-col gap-2.5 p-[1.1%]"
      style={{
        left: `${(box.x / W) * 100}%`,
        top: `${(box.y / H) * 100}%`,
        width: `${(box.w / W) * 100}%`,
        height: `${(box.h / H) * 100}%`
      }}
    >
      {children}
    </div>
  )
}

const Label = ({ children }: { readonly children: ReactNode }) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-2xs leading-none">{children}</span>
)

function Queue() {
  return (
    <>
      <Label>
        <Inbox size={12} />
        Wachtrij · 6
      </Label>
      {[["70%", true], ["54%", false], ["62%", false]].map(([w, s], i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-[3px] border border-current opacity-50" />
          <Line w={w as string} strong={s as boolean} />
        </span>
      ))}
    </>
  )
}

function Proposal() {
  return (
    <>
      <Label>
        <Sparkles size={12} />
        Voorstel
      </Label>
      <span className="text-2xs leading-none opacity-70">Allure aansporen · 2 bestellingen</span>
      <span className="relative mt-1 flex items-center">
        <span className="h-px w-full bg-current opacity-30" />
        <span className="absolute left-0 h-2 w-px bg-current opacity-60" />
        <span className="absolute right-[8%] h-2 w-px bg-current opacity-60" />
        <span className="absolute right-0 -top-4 font-medium text-2xs tabular-nums">92%</span>
      </span>
    </>
  )
}

function Sync() {
  return (
    <>
      <Label>
        <Logo vendor="shopify" size={14} />
        Shopify sync
      </Label>
      {["Northwind US", "Northwind EU"].map((s) => (
        <span key={s} className="flex items-center gap-2 text-2xs leading-none opacity-70">
          <Check size={11} />
          {s}
        </span>
      ))}
      <Line w="80%" />
    </>
  )
}

function Evidence() {
  return (
    <>
      <Label>
        <FileText size={12} />
        Bewijspakket
      </Label>
      {["Track & trace", "Bezorgscan", "Klantgesprek"].map((s, i) => (
        <span key={s} className="flex items-center gap-2 text-2xs leading-none">
          <span
            className={cn(
              "flex size-3 items-center justify-center rounded-[3px] border border-current",
              i < 2 ? "opacity-80" : "opacity-35"
            )}
          >
            {i < 2 ? <Check size={9} /> : null}
          </span>
          <span className={i < 2 ? "opacity-80" : "opacity-40"}>{s}</span>
        </span>
      ))}
    </>
  )
}

function Parcels() {
  return (
    <>
      <Label>
        <Package size={12} />
        Te accepteren · 20
      </Label>
      <span className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="relative size-7 rounded-[4px] border border-current opacity-50">
            <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
            <span className="absolute inset-y-0 left-1/2 w-px bg-current" />
          </span>
        ))}
      </span>
    </>
  )
}

function Route() {
  return (
    <>
      <Label>
        <Truck size={12} />
        Vandaag overdragen · 5
      </Label>
      <span className="relative mt-2 flex items-center justify-between">
        <span className="absolute inset-x-0 h-px border-current border-t border-dashed opacity-40" />
        {["Allure", "DHL", "Klant"].map((s) => (
          <span key={s} className="relative flex flex-col items-center gap-1.5 text-2xs leading-none">
            <span className="size-2 bg-current opacity-70" />
            {s}
          </span>
        ))}
      </span>
    </>
  )
}

function Links() {
  return (
    <>
      <Label>
        <Link2 size={12} />
        Instagram bio
      </Label>
      <span className="text-2xs leading-none opacity-70">?ref=priya · 312 conversies</span>
      <span className="mt-1 w-fit rounded-[4px] border border-current px-1.5 py-1 font-medium text-2xs leading-none">
        PRIYA10
      </span>
    </>
  )
}

function Tier() {
  return (
    <>
      <Label>
        <Sparkles size={12} />
        Goud · 15%
      </Label>
      <span className="relative mt-1 h-1.5 w-full rounded-full border border-current opacity-50">
        <span className="absolute inset-y-0 left-0 w-[88%] rounded-full bg-current" />
      </span>
      <span className="text-2xs leading-none opacity-70">395 conversies dit kwartaal</span>
    </>
  )
}

function Qr() {
  const cells = [1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1]
  return (
    <>
      <Label>
        <Link2 size={12} />
        QR-code
      </Label>
      <span className="grid w-12 grid-cols-5 gap-[2px]">
        {cells.map((c, i) => <span key={i} className={cn("aspect-square", c === 1 ? "bg-current opacity-70" : "")} />)}
      </span>
    </>
  )
}

function Flow() {
  return (
    <>
      <Label>
        <Workflow size={12} />
        Late levering
      </Label>
      {["Trigger · Shopify", "AI-stap · excuses", "Gmail · versturen"].map((s) => (
        <span key={s} className="flex items-center gap-2 text-2xs leading-none opacity-70">
          <span className="size-2 shrink-0 border border-current" />
          {s}
        </span>
      ))}
    </>
  )
}

function Guard() {
  return (
    <>
      <Label>
        <ShieldCheck size={12} />
        Klantenservice
      </Label>
      {["Bestellingen · bewerken", "Terugbetalen tot € 100"].map((s) => (
        <span key={s} className="text-2xs leading-none opacity-70">{s}</span>
      ))}
    </>
  )
}

const SETS: Record<Exclude<Motif, "quiet">, readonly [ReactNode, ReactNode, ReactNode, ReactNode]> = {
  product: [<Queue key="q" />, <Proposal key="p" />, <Sync key="s" />, <Evidence key="e" />],
  operator: [<Queue key="q" />, <Proposal key="p" />, <Sync key="s" />, <Flow key="f" />],
  supplier: [<Parcels key="pa" />, <Route key="r" />, <Sync key="s" />, <Evidence key="e" />],
  partner: [<Links key="l" />, <Tier key="t" />, <Qr key="qr" />, <Guard key="g" />]
}

/** Persona-specific line work: parcels and a route, link nodes, or queue rows. */
function MotifShapes({ motif }: { readonly motif: Motif }) {
  if (motif === "supplier") {
    return (
      <g>
        {[[520, 600], [mirror(520) - 24, 600]].map(([x, y]) => (
          <g key={x}>
            <rect x={x} y={y} width="24" height="24" rx="4" />
            <path d={`M${x} ${y! + 12} H${x! + 24} M${x! + 12} ${y} V${y! + 24}`} />
          </g>
        ))}
        <path d={route([[40, 360], [96, 360], [96, 300], [180, 300]], 12)} strokeDasharray="4 6" />
        <path d={route([[W - 40, 360], [W - 96, 360], [W - 96, 300], [W - 180, 300]], 12)} strokeDasharray="4 6" />
      </g>
    )
  }
  if (motif === "partner") {
    return (
      <g>
        {[[536, 616], [mirror(536), 616]].map(([x, y]) => (
          <g key={x}>
            <circle cx={x! - 8} cy={y} r="10" />
            <circle cx={x! + 8} cy={y} r="10" />
          </g>
        ))}
        <circle cx="80" cy="360" r="6" />
        <circle cx={W - 80} cy="360" r="6" />
        <path d="M86 360 H160" />
        <path d={`M${W - 86} 360 H${W - 160}`} />
      </g>
    )
  }
  if (motif === "operator") {
    return (
      <g>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="40" y={296 + i * 40} width="112" height="28" rx="8" />
            <rect x={W - 152} y={296 + i * 40} width="112" height="28" rx="8" />
          </g>
        ))}
      </g>
    )
  }
  return null
}

export function Schematic(
  { tone, motif = "product", className, parallax = 48, frame = true }: {
    readonly tone: Tone
    readonly motif?: Motif
    readonly className?: string
    /** Pixels the drawing drifts over the hero's scroll. */
    readonly parallax?: number
    /** Whether to draw the faint frame behind the copy. */
    readonly frame?: boolean
  }
) {
  const root = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const run = useRunning(root, 0.05)
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end start"] })
  const y = useTransform(scrollYProgress, [0, 1], [0, parallax])
  const dark = tone === "dark"
  const line = dark
    ? "color-mix(in oklch, var(--mesh-ink) 13%, transparent)"
    : "color-mix(in oklch, var(--ink) 11%, transparent)"
  const strong = dark
    ? "color-mix(in oklch, var(--mesh-ink) 28%, transparent)"
    : "color-mix(in oklch, var(--ink) 24%, transparent)"
  const widgets = motif === "quiet" ? null : SETS[motif]
  return (
    <div
      ref={root}
      aria-hidden
      data-run={run}
      className={cn("schematic pointer-events-none absolute inset-0 overflow-hidden [container-type:size]", className)}
    >
      <motion.div
        style={reduced ? {} : { y }}
        className="absolute top-1/2 left-1/2 aspect-[2/1] w-[max(100cqw,200cqh)] -translate-x-1/2 -translate-y-1/2"
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" fill="none">
          <g stroke={line} strokeWidth="1" vectorEffect="non-scaling-stroke">
            {CARDS.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r} />)}
            {SLOTS.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r} />)}
            {RINGS.map(([cx, cy, r], i) => (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r} />
                <circle cx={cx} cy={cy} r={r * 0.45} strokeDasharray="3 4" />
              </g>
            ))}
            {frame
              ? <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={FRAME.r} strokeDasharray="5 5" />
              : null}
            {ROUTES.map((d, i) => <path key={i} d={d} />)}
            <MotifShapes motif={motif} />
          </g>
          <g stroke={strong} strokeWidth="1">
            {CROSSES.map(([x, yy], i) => <path key={i} d={`M${x - 5} ${yy} H${x + 5} M${x} ${yy - 5} V${yy + 5}`} />)}
          </g>
          <g fill={strong}>
            {NODES.map(([x, yy], i) => <rect key={i} x={x - 3} y={yy - 3} width="6" height="6" />)}
          </g>
          {reduced ? null : (
            <g
              stroke={dark ? "var(--sky)" : "var(--arc)"}
              strokeWidth="1.5"
              strokeLinecap="square"
              className="schematic-pulses"
            >
              {PULSES.map(([ri, dur, delay]) => (
                <path
                  key={ri}
                  d={ROUTES[ri]}
                  pathLength={100}
                  strokeDasharray="7 193"
                  className="schematic-pulse"
                  style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
                />
              ))}
            </g>
          )}
        </svg>
        {widgets === null ?
          null :
          (
            <div className={cn("absolute inset-0 max-md:hidden", dark ? "text-mesh-ink-2" : "text-ink-3")}>
              {CARDS.map((c, i) => <Widget key={i} box={c}>{widgets[i]}</Widget>)}
            </div>
          )}
      </motion.div>
    </div>
  )
}

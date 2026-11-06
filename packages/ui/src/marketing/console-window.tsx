import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Edit3,
  Filter,
  Inbox,
  LayoutGrid,
  Mail,
  MousePointer2,
  Pin,
  Plus,
  RefreshCcw,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Ticket,
  Truck,
  Workflow,
  X
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { AreaPanel, Chip, PanelHead, PanelRow, Person, Rail, Spark, Topbar } from "./chrome.tsx"
import {
  INCOMING,
  LIVE_NEXT,
  LIVE_ORDERS,
  type ProductKey,
  PRODUCTS,
  QUEUE,
  type QueueItem,
  thumb
} from "./demo-data.ts"
import { Logo } from "./parts.tsx"

/*
 * The console's Start screen, drawn for the hero: a faithful render of the console's /dashboard (`packages/ui/src/app/dashboard`) on
 * the demo workspace's own records (`demo-data.ts`) — the rail with its pinned services, the area
 * panel, the greeting, the six figures, the queue plate, today's agenda, the live order ticker, the
 * mentions and what Insyte did. Northwind Clothing Co. is the console's sample workspace and is
 * labelled as such under the window.
 *
 * It is live, on one authored loop: a case arrives at the top of the queue with the proposal Insyte
 * drew for it, the pointer opens it, Versturen files it, the row leaves and a toast offers Undo; an
 * order lands on the ticker as each case arrives. The loop runs only while the window is on screen
 * and the tab is visible. The server, a reader who asked for less motion and a crawler all get one
 * still frame: the first case waiting with its proposal ready.
 *
 * Drawn at the console's width (1180px) and zoomed by the stylesheet (`.window-canvas`), so it is
 * the same screen at every size. It is a picture of the product: `aria-hidden` and `inert`.
 */

type Phase = "arrive" | "drafted" | "select" | "plate" | "press" | "sent"

const NEXT: Record<Phase, Phase> = {
  arrive: "drafted",
  drafted: "select",
  select: "plate",
  plate: "press",
  press: "sent",
  sent: "arrive"
}

const HOLD: Record<Phase, number> = {
  arrive: 1500,
  drafted: 1700,
  select: 900,
  plate: 2800,
  press: 420,
  sent: 2600
}

const EASE = [0.16, 1, 0.3, 1] as const

/** The loop's clock: one step at a time, only while `running`. */
function useLoop(running: boolean) {
  const [state, setState] = useState<{ cycle: number; phase: Phase }>({ cycle: 0, phase: "drafted" })
  useEffect(() => {
    if (!running) return
    const id = window.setTimeout(() => {
      setState((s) => s.phase === "sent" ? { cycle: s.cycle + 1, phase: "arrive" } : { ...s, phase: NEXT[s.phase] })
    }, HOLD[state.phase])
    return () => window.clearTimeout(id)
  }, [running, state])
  return state
}

/** Whether the document is visible: a background tab does not run the loop. */
function useVisible() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible")
    on()
    document.addEventListener("visibilitychange", on)
    return () => document.removeEventListener("visibilitychange", on)
  }, [])
  return visible
}

/* ── Figures ───────────────────────────────────────────────────────────────────────────────── */

const SPARKS = {
  omzet: "0,14 8,12 16,15 24,9 32,11 40,6 48,8 60,3",
  orders: "0,13 8,15 16,10 24,12 32,8 40,10 48,6 60,7",
  tickets: "0,15 8,12 16,13 24,8 32,10 40,6 48,9 60,4",
  dispute: "0,16 8,15 16,16 24,14 32,15 40,12 48,10 60,8",
  ontime: "0,8 8,10 16,7 24,9 32,6 40,8 48,5 60,6"
} as const

function Figure(
  { label, value, delta, spark, tick = false }: {
    readonly label: string
    readonly value: string
    readonly delta: string
    readonly spark: string
    readonly tick?: boolean
  }
) {
  return (
    <div className="flex flex-col gap-1 rounded-md px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-ink-3 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 rounded-sm bg-arc-tint px-1.5 text-arc-ink text-xs">{delta}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="relative overflow-hidden whitespace-nowrap font-medium text-ink text-xl tabular-nums">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={value}
              className="block"
              initial={tick ? { y: "100%", opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: 0.42, ease: EASE }}
            >
              {value}
            </motion.span>
          </AnimatePresence>
        </span>
        <Spark points={spark} />
      </div>
    </div>
  )
}

function FiguresStrip({ arrivals }: { readonly arrivals: number }) {
  return (
    <div className="grid grid-cols-5 gap-1 rounded-lg p-1 panel max-sm:grid-cols-3">
      <Figure label="Omzet" value="€ 172.855" delta="+4,9%" spark={SPARKS.omzet} />
      <Figure
        label="Bestellingen"
        value={(1828 + arrivals).toLocaleString("nl-NL")}
        delta="+4,0%"
        spark={SPARKS.orders}
        tick
      />
      <Figure label="Open tickets" value="10" delta="+28%" spark={SPARKS.tickets} />
      <div className="max-sm:hidden">
        <Figure label="In geschil" value="€ 514" delta="5 zaken" spark={SPARKS.dispute} />
      </div>
      <div className="max-sm:hidden">
        <Figure label="Op tijd geleverd" value="92,6%" delta="+0,3 pt" spark={SPARKS.ontime} />
      </div>
    </div>
  )
}

/* ── The queue ─────────────────────────────────────────────────────────────────────────────── */

function Thumb({ product, size }: { readonly product: ProductKey; readonly size: number }) {
  const p = PRODUCTS[product]
  return (
    <img
      src={thumb(p.img)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-md bg-mist object-cover"
      style={{ width: size, height: size }}
    />
  )
}

/** What a queue row leads with: the record's own logo, photograph, person or house glyph. */
function Lead({ item }: { readonly item: QueueItem }) {
  if (item.person !== undefined) {
    return (
      <span className="relative shrink-0">
        <Person initials={item.person} size={30} tone="tint" />
        {item.vendor === undefined ? null : (
          <span className="absolute -right-1 -bottom-1">
            <Logo vendor={item.vendor} size={14} />
          </span>
        )}
      </span>
    )
  }
  if (item.product !== undefined) return <Thumb product={item.product} size={30} />
  if (item.vendor !== undefined) return <Logo vendor={item.vendor} size={30} />
  const Icon = item.kind === "supplier" ? Truck : item.kind === "template" ? Mail : Inbox
  return (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-md bg-mesh-ink/12 text-mesh-ink">
      <Icon size={15} />
    </span>
  )
}

const ROW =
  "grid grid-cols-[minmax(0,1fr)_68px_88px_64px] items-center gap-2 px-4 max-sm:grid-cols-[minmax(0,1fr)_64px]"

function Row(
  { item, drafted, selected, flash, children }: {
    readonly item: QueueItem
    readonly drafted: boolean
    readonly selected: boolean
    readonly flash: boolean
    readonly children?: ReactNode
  }
) {
  return (
    <div
      className={cn(
        ROW,
        "relative h-[52px] transition-colors duration-[240ms]",
        selected ? "bg-mesh-ink/[0.14]" : flash ? "bg-arc/40" : ""
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Lead item={item} />
        <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
          <span className="flex items-center gap-2">
            <span className={cn("size-1.5 shrink-0", item.urgent ? "bg-mesh-ink" : "bg-mesh-ink-3")} />
            <span className="truncate font-medium text-base">{item.title}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 pl-3.5">
            <AnimatePresence initial={false}>
              {drafted && item.proposal !== undefined
                ? (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9, width: 0 }}
                    animate={{ opacity: 1, scale: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.36, ease: EASE }}
                    className="inline-flex h-5 shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded-sm bg-arc px-1.5 font-medium text-mesh-ink text-xs"
                  >
                    <Sparkles size={11} className="shrink-0" />
                    Voorstel klaar
                  </motion.span>
                )
                : null}
            </AnimatePresence>
            <span className="truncate text-mesh-ink-2 text-sm">{item.detail}</span>
          </span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-mesh-ink-2 text-sm max-sm:hidden">
        <Logo vendor="shopify" size={14} />
        {item.store}
      </span>
      <span className="text-mesh-ink-2 text-sm tabular-nums max-sm:hidden">{item.value}</span>
      <span className={cn("text-sm tabular-nums", item.urgent ? "text-mesh-ink" : "text-mesh-ink-2")}>
        {item.due}
      </span>
      {children}
    </div>
  )
}

/** The pointer, drawn where it acts. It travels in from below-right and settles. */
function Pointer({ className, pressed = false }: { readonly className?: string; readonly pressed?: boolean }) {
  return (
    <motion.span
      className={cn("pointer-events-none absolute z-20 text-abyss", className)}
      initial={{ opacity: 0, x: 90, y: 70 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: pressed ? 0.86 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: EASE, scale: { duration: 0.16 } }}
    >
      <MousePointer2
        size={22}
        className="fill-paper drop-shadow-[0_2px_3px_color-mix(in_oklch,var(--abyss)_35%,transparent)]"
      />
    </motion.span>
  )
}

/** The proposal Insyte drew for the row, opened over the queue like the console's plate. */
function Proposal({ item, pressed }: { readonly item: QueueItem; readonly pressed: boolean }) {
  const p = item.proposal
  if (p === undefined) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.36, ease: EASE, opacity: { duration: 0.18 } }}
      style={{ transformOrigin: "20% 0%" }}
      className="absolute top-[calc(100%+6px)] left-12 z-10 flex w-[460px] flex-col gap-3 rounded-lg bg-paper p-4 text-ink window-lift max-sm:left-4 max-sm:w-[420px]"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-arc-ink text-sm">
          <Sparkles size={14} />
          {p.heading}
        </span>
        <span className="text-ink-3 text-xs">Concept van Insyte · 1,8 s</span>
      </div>
      <p className="text-base text-ink">{p.body}</p>
      <div className="flex flex-wrap gap-1.5">
        {p.sources.map((s) => (
          <span key={s} className="rounded-sm bg-arc-tint px-1.5 py-0.5 text-arc-ink text-xs">
            {s}
          </span>
        ))}
      </div>
      <div className="relative flex gap-1.5">
        <span
          className={cn(
            "relative inline-flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm transition-transform duration-[160ms]",
            pressed && "scale-95 bg-abyss-2"
          )}
        >
          <Check size={14} />
          {p.action}
          <Pointer className="top-4 left-16" pressed={pressed} />
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium text-ink text-sm field">
          <Edit3 size={14} />
          Bewerken
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium text-ink-2 text-sm">
          <X size={14} />
          Negeren
        </span>
      </div>
    </motion.div>
  )
}

function QueuePlate(
  { incoming, phase, still }: { readonly incoming: QueueItem | null; readonly phase: Phase; readonly still: boolean }
) {
  const rows = incoming === null ? QUEUE : [incoming, ...QUEUE]
  const waiting = rows.length
  return (
    <div className="relative rounded-lg bg-abyss text-mesh-ink">
      <div className="flex items-center gap-2 px-4 pt-4 font-medium text-lg">
        <span className="flex size-7 items-center justify-center rounded-md bg-mesh-ink/10">
          <Inbox size={15} />
        </span>
        Je wachtrij
        <span className="ml-auto flex items-center gap-1.5 font-normal text-mesh-ink-2 text-sm">
          <RefreshCcw size={13} />
          Bijgewerkt zojuist
        </span>
      </div>
      <div className="flex items-center gap-1 px-3 pt-3 text-base">
        <span className="flex items-center gap-1.5 rounded-md bg-mesh-ink/12 px-3 py-1">
          Wacht op jou
          <span className="relative inline-flex w-3 justify-center overflow-hidden text-mesh-ink-2 tabular-nums">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={waiting}
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={{ duration: 0.36, ease: EASE }}
              >
                {waiting}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
        <span className="px-3 py-1 text-mesh-ink-2">Getekend 3</span>
        <span className="px-3 py-1 text-mesh-ink-2 max-sm:hidden">Alles 10</span>
        <span className="ml-auto flex items-center gap-1.5 px-2 text-mesh-ink-2 text-sm">
          <Filter size={13} />
          Filter
        </span>
      </div>
      <div className={cn(ROW, "mt-2 py-1.5 text-mesh-ink-2 text-sm")}>
        <span>Wat er gebeurde</span>
        <span className="max-sm:hidden">Winkel</span>
        <span className="max-sm:hidden">Waarde</span>
        <span>Resterend</span>
      </div>
      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {rows.map((item, i) => (
            <motion.div
              key={item.id}
              layout={still ? false : "position"}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 52 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className={cn("relative", i % 2 === 0 && "bg-mesh-ink/[0.05]", i === 0 && incoming !== null && "z-10")}
            >
              <Row
                item={item}
                drafted={item === incoming && phase !== "arrive"}
                selected={item === incoming && (phase === "select" || phase === "plate" || phase === "press")}
                flash={item === incoming && phase === "arrive"}
              >
                <AnimatePresence>
                  {item === incoming && phase === "select" ? <Pointer className="top-6 left-[38%]" /> : null}
                </AnimatePresence>
                <AnimatePresence>
                  {item === incoming && (phase === "plate" || phase === "press")
                    ? <Proposal item={item} pressed={phase === "press"} />
                    : null}
                </AnimatePresence>
              </Row>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="px-4 pt-3 pb-4 text-mesh-ink-2 text-sm">Dat is alles. Nieuwe zaken verschijnen bovenaan.</div>
    </div>
  )
}

/* ── The right column and the cards under the queue ────────────────────────────────────────── */

function Card(
  { icon: Icon, title, trail, children, className }: {
    readonly icon: typeof Inbox
    readonly title: string
    readonly trail?: string
    readonly children: ReactNode
    readonly className?: string
  }
) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-lg p-4 panel", className)}>
      <div className="flex items-center gap-2 font-medium text-ink text-lg">
        <span className="flex size-7 items-center justify-center rounded-md bg-mist text-ink-2">
          <Icon size={14} />
        </span>
        {title}
        {trail === undefined ?
          null :
          (
            <span className="ml-auto flex items-center gap-0.5 font-normal text-ink-3 text-sm">
              {trail}
              <ChevronRight size={13} />
            </span>
          )}
      </div>
      {children}
    </div>
  )
}

const AGENDA = [
  ["08:00", "Ochtendoverzicht verstuurd", "Overzicht · wat er vannacht binnenkwam"],
  ["10:00", "Account heractiveren", "Automatisering · 12 keer in 30 dagen"],
  ["14:10", "Klarna-bewijs indienen", "Chargeback · voorstel klaar"],
  ["15:00", "Overdracht Skyway Freight", "Leverancier · 5 bestellingen lopen uit"]
] as const

function Agenda() {
  return (
    <Card icon={Calendar} title="Agenda vandaag" trail="8">
      <div className="flex items-center gap-1.5 truncate rounded-md bg-arc-tint px-2.5 py-1.5 text-arc-ink text-sm">
        <Check size={13} className="shrink-0" />
        <span className="truncate">Het Klarna-bewijspakket controleren voordat het verloopt</span>
      </div>
      {AGENDA.map(([time, title, meta], i) => (
        <div key={time} className="relative flex gap-3">
          <span
            className={cn("w-10 shrink-0 pt-0.5 text-sm tabular-nums", i === 2 ? "text-arc-ink" : "text-ink-3")}
          >
            {time}
          </span>
          <span className={cn("w-0.5 shrink-0 rounded-full", i === 2 ? "bg-arc" : "bg-ink-5")} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base text-ink">{title}</span>
            <span className="truncate text-ink-3 text-xs">{meta}</span>
          </span>
        </div>
      ))}
    </Card>
  )
}

function LiveOrders({ arrivals, still }: { readonly arrivals: number; readonly still: boolean }) {
  /* Newest first: the k-th arrival is SO-12466 + k. */
  const arrived = Array.from({ length: arrivals }, (_, j) => {
    const k = arrivals - 1 - j
    const o = LIVE_NEXT[k % LIVE_NEXT.length]!
    return { ...o, number: `SO-${12466 + k}`, key: `live-${k}` }
  })
  const rows = [...arrived, ...LIVE_ORDERS.map((o) => ({ ...o, key: o.number }))].slice(0, 4)
  return (
    <Card icon={ShoppingBag} title="Live bestellingen" trail="Openen">
      <div className="flex items-center gap-2 text-ink-2 text-sm">
        <span className="size-2 rounded-full bg-arc" />
        Live · {8 + arrivals} vandaag
      </div>
      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {rows.map((o) => (
            <motion.div
              key={o.key}
              layout={still ? false : "position"}
              initial={{ opacity: 0, height: 0, backgroundColor: "var(--arc-tint)" }}
              animate={{ opacity: 1, height: 44, backgroundColor: "transparent" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.45, ease: EASE, backgroundColor: { duration: 2.2 } }}
              className="flex items-center gap-2.5 overflow-hidden rounded-md px-1"
            >
              <Thumb product={o.product} size={30} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-base text-ink">
                  <span className="font-medium tabular-nums">{o.number}</span> · {o.who}
                </span>
                <span className="truncate text-ink-3 text-xs">
                  {o.qty} × {PRODUCTS[o.product].title}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end leading-tight">
                <span className="text-ink text-sm tabular-nums">{o.total}</span>
                <span className="text-ink-3 text-xs">{o.ago}</span>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  )
}

/** The toast the console raises after a reversible action: what happened, and Undo for six seconds. */
function Toast({ text }: { readonly text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="absolute bottom-6 left-1/2 z-30 -ml-[190px] flex w-[380px] items-center gap-2.5 rounded-lg bg-abyss px-4 py-3 text-mesh-ink window-lift"
    >
      <CheckCircle2 size={16} className="shrink-0" />
      <span className="flex-1 truncate text-base">{text}</span>
      <span className="flex shrink-0 items-center gap-1 font-medium text-mesh-ink-2 text-sm">
        <CornerDownLeft size={13} />
        Ongedaan maken
      </span>
    </motion.div>
  )
}

/* ── The window ────────────────────────────────────────────────────────────────────────────── */

export function ConsoleWindow() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const inView = useInView(ref, { amount: 0.25 })
  const visible = useVisible()
  const { cycle, phase } = useLoop(!reduced && inView && visible)

  const item = INCOMING[cycle % INCOMING.length]!
  const incoming = phase === "sent" ? null : item
  const waiting = QUEUE.length + (incoming === null ? 0 : 1)

  return (
    <div
      ref={ref}
      aria-hidden
      inert
      className="window-canvas relative select-none overflow-hidden bg-glacier text-left"
    >
      <div className="flex h-[760px]">
        <Rail />
        <AreaPanel search="Zoek in vandaag">
          <PanelHead>De dag</PanelHead>
          <PanelRow icon={Inbox} count={waiting} active>Wacht op jou</PanelRow>
          <PanelRow icon={CornerDownLeft} count={3}>Voorstellen klaar</PanelRow>
          <PanelHead>Waar het heen gaat</PanelHead>
          <PanelRow icon={ShoppingBag} count={30}>Bestellingen</PanelRow>
          <PanelRow icon={Ticket} count={10}>Tickets</PanelRow>
          <PanelRow icon={ShieldAlert} count={5}>Chargebacks</PanelRow>
          <PanelRow icon={Workflow}>Automatiseringen</PanelRow>
          <PanelHead>Vastgezet</PanelHead>
          <div className="flex flex-wrap gap-1 px-1">
            {["DSP-2214 · Klarna", "Bestelling SO-12224"].map((p) => (
              <span
                key={p}
                className="flex items-center gap-1 rounded-md bg-paper px-2 py-1 text-ink-2 text-xs hairline"
              >
                <Pin size={11} className="text-ink-3" />
                {p}
              </span>
            ))}
          </div>
          <PanelHead trail="nog 3">Vandaag</PanelHead>
          {[
            ["06:35", "Bestelling SO-12231"],
            ["07:40", "Vertraagde bestelling"],
            ["08:23", "Aurora fleece met capuchon"],
            ["08:56", "Daniel Brown"],
            ["09:22", "Bestelling SO-12218"]
          ].map(([time, what]) => (
            <div key={time} className="flex h-6 items-center gap-2 px-2 text-sm">
              <span className="w-9 text-ink-3 tabular-nums">{time}</span>
              <span className="h-px w-2 bg-ink-4" />
              <span className="truncate text-ink-2">{what}</span>
            </div>
          ))}
          <div className="flex h-6 items-center gap-2 px-2 text-arc-ink text-sm">
            <span className="w-9 tabular-nums">10:00</span>
            <span className="h-0.5 flex-1 bg-arc" />
          </div>
        </AreaPanel>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Topbar />
          <div className="flex flex-col gap-4 px-6 pt-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-3">
                <span className="font-medium text-3xl text-ink">Goedemorgen, Elena.</span>
                <span className="flex items-center gap-1 text-ink-3 text-sm">
                  <Clock size={13} />
                  dinsdag
                </span>
              </div>
              <div className="flex items-center gap-5 text-base text-ink-2">
                <span>
                  <span className="figure text-2xl text-arc-ink">{waiting}</span>{" "}
                  zaken wachten op je voordat de dag om is
                </span>
                <span className="flex items-center gap-1.5 text-ink-3 max-sm:hidden">
                  <ShieldAlert size={13} />2 chargebacks hebben bewijs nodig
                </span>
                <span className="flex items-center gap-1.5 text-ink-3 max-sm:hidden">
                  <Truck size={13} />8 bestellingen zijn vertraagd
                </span>
              </div>
            </div>
            <div className="flex items-center gap-5 text-base text-ink-3 max-sm:hidden">
              <span className="flex items-center gap-1.5 border-arc border-b-2 pb-2 font-medium text-ink">
                <LayoutGrid size={14} />
                Overzicht
              </span>
              <span className="flex items-center gap-1.5 pb-2">
                Mijn werk <Chip>{waiting}</Chip>
              </span>
              <span className="flex items-center gap-1.5 pb-2">
                Agenda <Chip>8</Chip>
              </span>
              <span className="pb-2">Activiteit</span>
              <span className="ml-auto flex items-center gap-1.5 pb-2">
                <Plus size={14} />
                Kaart toevoegen
              </span>
            </div>
            <FiguresStrip arrivals={cycle} />
            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-sm:grid-cols-1">
              <QueuePlate incoming={incoming} phase={phase} still={reduced} />
              <div className="flex flex-col gap-4 max-sm:hidden">
                <Agenda />
                <LiveOrders arrivals={cycle} still={reduced} />
              </div>
            </div>
          </div>
          <AnimatePresence>
            {phase === "sent" ? <Toast key={cycle} text={item.proposal?.toast ?? ""} /> : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

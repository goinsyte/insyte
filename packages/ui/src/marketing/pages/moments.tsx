import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useMemo, useRef } from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  EyeOff,
  FileText,
  Link2,
  MapPin,
  Package,
  Sparkles,
  Truck
} from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Chip } from "../chrome.tsx"
import { type ProductKey, PRODUCTS, thumb } from "../demo-data.ts"
import { useTyped } from "../motion.tsx"
import { Logo } from "../parts.tsx"
import { BuilderScreen, TicketsScreen } from "../tour-screens.tsx"
import { useRunning, useTicker } from "./hooks.ts"
import { MomentFrame } from "./steps.tsx"

/*
 * Product moments for the site's pages: small, faithful pieces of the console and the two portals,
 * each running one short authored loop while it is the moment being read and on screen. The records
 * are the demo workspace's (Northwind Clothing Co., `?scenario=settled`): its orders and products,
 * Allure Fulfillment as the supplier, Priya as the partner. Off screen, on the server and under
 * reduced motion each shows its last frame.
 */

const EASE = [0.16, 1, 0.3, 1] as const

/** A loop's frame: counts 0…`frames - 1` while running, and holds the last frame otherwise. */
function useFrame(on: boolean, frames: number, ms: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.35) && on
  const tick = useTicker(run, ms)
  return { ref, run, f: run ? tick % frames : frames - 1 }
}

function Panel(
  { title, meta, children, className }: {
    readonly title: ReactNode
    readonly meta?: ReactNode
    readonly children: ReactNode
    readonly className?: string
  }
) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[560px] overflow-hidden rounded-lg bg-paper text-left window-lift",
        className
      )}
    >
      <div className="flex h-11 items-center gap-2 px-4 shadow-[inset_0_-1px_0_var(--hairline)]">
        <span className="font-medium text-ink text-sm">{title}</span>
        {meta === undefined ? null : <span className="ml-auto text-ink-3 text-xs">{meta}</span>}
      </div>
      {children}
    </div>
  )
}

function Thumb({ product, size = 30 }: { readonly product: ProductKey; readonly size?: number }) {
  return (
    <img
      src={thumb(PRODUCTS[product].img, 96)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-sm bg-mist object-cover"
      style={{ width: size, height: size }}
    />
  )
}

/* ── Operators ────────────────────────────────────────────────────────────────────────────────── */

const ORDER_ROWS: ReadonlyArray<{ n: string; who: string; product: ProductKey; store: "EU" | "US"; late: boolean }> = [
  { n: "SO-12461", who: "Emily White", product: "crewneck", store: "EU", late: false },
  { n: "SO-12204", who: "Sarah K.", product: "raincoat", store: "US", late: true },
  { n: "SO-12463", who: "Hannah Schmidt", product: "flannel", store: "EU", late: false },
  { n: "SO-12222", who: "Daniel B.", product: "fleece", store: "US", late: true },
  { n: "SO-12464", who: "Yuki Tanaka", product: "daypack", store: "EU", late: false }
]

/** Every store's orders in one list; the late ones rise to the top and the message to Allure is ready. */
export function OrdersMoment({ on, bare = false }: { readonly on: boolean; readonly bare?: boolean }) {
  const { f, ref } = useFrame(on, 7, 900)
  const sorted = f >= 2
  const rows = sorted ? [...ORDER_ROWS.filter((r) => r.late), ...ORDER_ROWS.filter((r) => !r.late)] : ORDER_ROWS
  return (
    <div ref={ref}>
      <MomentFrame tone={bare ? "none" : "glacier"}>
        <Panel title="Bestellingen" meta="Northwind US en EU">
          <AnimatePresence initial={false}>
            {f >= 3
              ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-md bg-arc-tint px-3 py-2">
                    <Sparkles size={14} className="shrink-0 text-arc-ink" />
                    <span className="flex-1 text-ink text-xs">
                      2 bestellingen bij Allure lopen achter. Het bericht staat klaar.
                    </span>
                    <span className="rounded-sm bg-abyss px-2 py-1 font-medium text-2xs text-mesh-ink">Bekijken</span>
                  </div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          <ul className="p-1.5">
            {rows.map((r) => (
              <motion.li
                key={r.n}
                layout="position"
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                className="flex items-center gap-3 rounded-md px-2.5 py-2"
              >
                <Thumb product={r.product} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-ink text-sm">
                    <span className="font-medium tabular-nums">{r.n}</span> · {r.who}
                  </span>
                  <span className="truncate text-ink-3 text-xs">{PRODUCTS[r.product].title}</span>
                </span>
                <span className="flex items-center gap-1.5 text-ink-2 text-xs">
                  <Logo vendor="shopify" size={16} />
                  {r.store}
                </span>
                <span
                  className={cn(
                    "w-[78px] rounded-sm px-1.5 py-0.5 text-center text-xs transition-colors duration-500",
                    r.late && sorted ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2"
                  )}
                >
                  {r.late && sorted ? "Vertraagd" : "Betaald"}
                </span>
              </motion.li>
            ))}
          </ul>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/** The reply tour's screen, stepping on its own while read. */
export function TicketMoment({ on }: { readonly on: boolean }) {
  const { f, ref, run } = useFrame(on, 3, 3200)
  return (
    <div ref={ref}>
      <MomentFrame className="p-0 sm:p-0">
        <div className="tour-in-moment overflow-hidden rounded-lg window-lift">
          <TicketsScreen step={f} run={run} />
        </div>
      </MomentFrame>
    </div>
  )
}

/** The automation builder's screen, stepping on its own while read. */
export function BuilderMoment({ on }: { readonly on: boolean }) {
  const { f, ref, run } = useFrame(on, 3, 3200)
  return (
    <div ref={ref}>
      <MomentFrame className="p-0 sm:p-0">
        <div className="tour-in-moment overflow-hidden rounded-lg window-lift">
          <BuilderScreen step={f} run={run} />
        </div>
      </MomentFrame>
    </div>
  )
}

const EVIDENCE = [
  { label: "Bestelbevestiging", from: "Shopify", vendor: "shopify" },
  { label: "Track & trace met bezorgscan", from: "DHL", vendor: "dhl" },
  { label: "Gesprek met de klant", from: "Gmail", vendor: "gmail" },
  { label: "Productpagina en voorwaarden", from: "Shopify", vendor: "shopify" }
] as const

/** A chargeback's evidence pack assembling itself while the deadline counts down. */
export function EvidenceMoment({ on, bare = false }: { readonly on: boolean; readonly bare?: boolean }) {
  const { f, ref } = useFrame(on, 8, 800)
  const done = Math.min(EVIDENCE.length, Math.max(0, f - 1))
  const complete = done === EVIDENCE.length
  return (
    <div ref={ref}>
      <MomentFrame tone={bare ? "none" : "glacier"}>
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Logo vendor="klarna" size={20} />
              DSP-2204 · € 89,95
            </span>
          }
          meta={
            <span className="flex items-center gap-1.5">
              <Clock size={12} />
              Deadline over 3 dagen
            </span>
          }
        >
          <div className="flex flex-col gap-1 p-3">
            {EVIDENCE.map((e, i) => {
              const ok = i < done
              return (
                <div key={e.label} className="flex items-center gap-3 rounded-md px-2 py-2">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-sm transition-colors duration-300",
                      ok ? "bg-abyss text-mesh-ink" : "bg-ink/6 text-transparent"
                    )}
                  >
                    <Check size={12} />
                  </span>
                  <span className={cn("flex-1 text-sm transition-colors", ok ? "text-ink" : "text-ink-3")}>
                    {e.label}
                  </span>
                  <span className="flex items-center gap-1.5 text-ink-3 text-xs">
                    <Logo vendor={e.vendor} size={16} />
                    {e.from}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 bg-mist px-4 py-3">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={complete ? "klaar" : "bezig"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex-1 text-ink-2 text-xs"
              >
                {complete
                  ? "Bewijspakket compleet. Indienen doe jij."
                  : `Insyte verzamelt bewijs · ${done} van ${EVIDENCE.length}`}
              </motion.span>
            </AnimatePresence>
            <span className="rounded-md px-2.5 py-1 text-ink-2 text-xs field">Bewerken</span>
            <span
              className={cn(
                "rounded-md px-2.5 py-1 font-medium text-xs transition-colors",
                complete ? "bg-abyss text-mesh-ink" : "bg-ink/8 text-ink-3"
              )}
            >
              Indienen
            </span>
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/* ── Suppliers ────────────────────────────────────────────────────────────────────────────────── */

/** The operator's whole order folding down to the supplier's own lines and the address. */
export function SupplierScopeMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 1000)
  const scoped = f >= 2
  const lines: ReadonlyArray<{ product: ProductKey; qty: number; mine: boolean }> = [
    { product: "crewneck", qty: 2, mine: true },
    { product: "beanie", qty: 1, mine: false },
    { product: "raincoat", qty: 3, mine: true },
    { product: "wallet", qty: 1, mine: false }
  ]
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel
          title={<span className="tabular-nums">SO-12204</span>}
          meta={scoped ? "Zoals Allure het ziet" : "Zoals jij het ziet"}
        >
          <div className="flex flex-col p-3">
            {lines.map((l) => (
              <motion.div
                key={l.product}
                initial={false}
                animate={scoped && !l.mine ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 rounded-md px-2 py-2">
                  <Thumb product={l.product} size={28} />
                  <span className="flex-1 text-ink text-sm">{l.qty}× {PRODUCTS[l.product].title}</span>
                  <span className="text-ink-3 text-xs">{l.mine ? "Allure Fulfillment" : "Andere leverancier"}</span>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="grid gap-px bg-hairline sm:grid-cols-2">
            <div className="flex flex-col gap-1 bg-paper p-4">
              <span className="flex items-center gap-1.5 text-ink-3 text-xs">
                <MapPin size={12} />
                Verzendadres
              </span>
              <span className="text-ink text-sm">Sarah Kowalski</span>
              <span className="text-ink-2 text-xs">Keizersgracht 12, 1015 CS Amsterdam</span>
            </div>
            <div className="flex flex-col gap-1.5 bg-paper p-4">
              {[["E-mail van de klant", "sarah.k@example.com"], ["Telefoon", "+31 6 1234 5678"]].map(([k, v]) => (
                <span key={k} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-3">{k}</span>
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={scoped ? "verborgen" : "zichtbaar"}
                      initial={{ opacity: 0, filter: "blur(3px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(3px)" }}
                      transition={{ duration: 0.35 }}
                      className={cn("flex items-center gap-1", scoped ? "text-ink-3" : "text-ink-2")}
                    >
                      {scoped ? <EyeOff size={12} /> : null}
                      {scoped ? "Verborgen" : v}
                    </motion.span>
                  </AnimatePresence>
                </span>
              ))}
            </div>
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

const FLOW = ["Te accepteren", "Geaccepteerd", "Verzonden"] as const

/** Accept, then ship with a carrier and tracking in two parcels; the operator's order follows. */
export function ShipMoment({ on }: { readonly on: boolean }) {
  const { f, ref, run } = useFrame(on, 9, 850)
  const stage = f < 2 ? 0 : f < 5 ? 1 : 2
  const tracking = useTyped("JVGL0623 4410 2287", run && f >= 3 && f < 5, 0)
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title={<span className="tabular-nums">SO-12205</span>} meta="3× Trailhead korte broek">
          <div className="flex flex-col gap-5 p-4">
            <div className="flex items-center gap-2">
              {FLOW.map((s, i) => (
                <div key={s} className="flex flex-1 flex-col gap-1.5">
                  <span className="relative h-1 overflow-hidden rounded-full bg-ink/8">
                    <motion.span
                      className="absolute inset-0 origin-left bg-abyss"
                      initial={false}
                      animate={{ scaleX: i <= stage ? 1 : 0 }}
                      transition={{ duration: 0.6, ease: EASE }}
                    />
                  </span>
                  <span className={cn("text-xs", i <= stage ? "text-ink" : "text-ink-3")}>{s}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="flex flex-col gap-1 rounded-md p-3 field">
                <span className="text-ink-3 text-xs">Vervoerder</span>
                <span className="flex items-center gap-2 text-ink text-sm">
                  <Logo vendor="dhl" size={18} />
                  DHL
                </span>
              </span>
              <span className="flex flex-col gap-1 rounded-md p-3 field">
                <span className="text-ink-3 text-xs">Pakketten</span>
                <span className="flex items-center gap-2 text-ink text-sm">
                  <Package size={15} className="text-ink-3" />2
                </span>
              </span>
              <span className="col-span-2 flex flex-col gap-1 rounded-md p-3 field">
                <span className="text-ink-3 text-xs">Track & trace</span>
                <span className="h-5 text-ink text-sm tabular-nums">{stage === 0 ? "" : tracking}</span>
              </span>
            </div>
            <span
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-md font-medium text-sm transition-colors duration-300",
                stage === 0 ? "bg-mist text-ink" : "bg-abyss text-mesh-ink"
              )}
            >
              {stage === 0 ? <Check size={14} /> : <Truck size={14} />}
              {stage === 0 ? "Accepteren" : stage === 1 ? "Verzenden" : "Verzonden"}
            </span>
          </div>
          <AnimatePresence initial={false}>
            {stage === 2
              ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 bg-mist px-4 py-3 text-ink-2 text-xs">
                    <CheckCircle2 size={14} className="text-arc-ink" />
                    Northwind ziet: verzonden met DHL, 2 pakketten, op de bestelling en in de tijdlijn.
                  </div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/** A problem reported with a new hand-off date, arriving at the operator as a ticket. */
export function ProblemMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 7, 900)
  const sent = f >= 3
  return (
    <div ref={ref}>
      <MomentFrame>
        <div className="relative mx-auto flex w-full max-w-[560px] flex-col gap-4">
          <Panel title="Probleem melden" meta={<span className="tabular-nums">SO-12204</span>}>
            <div className="flex flex-col gap-2 p-4">
              <span className="flex flex-col gap-1 rounded-md p-3 field">
                <span className="text-ink-3 text-xs">Wat is er</span>
                <span className="flex items-center gap-2 text-ink text-sm">
                  <AlertTriangle size={14} className="text-ink-3" />
                  Niet op voorraad: Harbor regenjas
                </span>
              </span>
              <span className="flex flex-col gap-1 rounded-md p-3 field">
                <span className="text-ink-3 text-xs">Nieuwe overdrachtsdatum</span>
                <span className="text-ink text-sm">di 3 november</span>
              </span>
              <span
                className={cn(
                  "mt-1 flex h-9 items-center justify-center rounded-md font-medium text-sm transition-colors",
                  sent ? "bg-mist text-ink-3" : "bg-abyss text-mesh-ink"
                )}
              >
                {sent ? "Gemeld" : "Melden"}
              </span>
            </div>
          </Panel>
          <AnimatePresence initial={false}>
            {sent
              ? (
                <motion.div
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ type: "spring", stiffness: 240, damping: 26 }}
                  className="mx-auto w-full max-w-[560px] rounded-lg bg-paper p-4 window-lift"
                >
                  <span className="flex items-center gap-2 text-ink-3 text-xs">
                    <Logo vendor="gmail" size={14} />
                    Bij Northwind · Klantenservice · zojuist
                  </span>
                  <span className="mt-1.5 block font-medium text-ink text-sm">
                    Allure Fulfillment meldt een probleem met SO-12204
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Chip tone="attention">Nieuwe datum: di 3 nov</Chip>
                    <Chip>Ticket</Chip>
                  </span>
                </motion.div>
              )
              : null}
          </AnimatePresence>
        </div>
      </MomentFrame>
    </div>
  )
}

/** What Northwind owes the supplier this month: shipped lines at cost, corrections, the total. */
export function StatementMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 800)
  const rows = [
    { order: "SO-12161", title: "2× Drift sweater met ronde hals", total: "US$ 52,00" },
    { order: "SO-12170", title: "1× Harbor regenjas", total: "US$ 88,00" },
    { order: "SO-12188", title: "3× Aurora fleece met capuchon", total: "US$ 106,80" },
    { order: "SO-12190", title: "Beschadigd aangekomen", total: "− US$ 35,60", correction: true }
  ]
  const shown = Math.min(rows.length, f + 1)
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Afrekening mei 2026" meta="Allure Fulfillment">
          <ul className="flex flex-col p-2">
            {rows.map((r, i) => (
              <motion.li
                key={r.order}
                initial={false}
                animate={{ opacity: i < shown ? 1 : 0, x: i < shown ? 0 : -8 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="flex items-center gap-3 rounded-md px-2.5 py-2"
              >
                <FileText size={14} className="shrink-0 text-ink-3" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-ink text-xs tabular-nums">{r.order}</span>
                  <span className={cn("truncate text-xs", r.correction === true ? "text-arc-ink" : "text-ink-3")}>
                    {r.title}
                  </span>
                </span>
                <span className="text-ink text-sm tabular-nums">{r.total}</span>
              </motion.li>
            ))}
          </ul>
          <div className="flex items-center justify-between bg-mist px-4 py-3">
            <span className="flex items-center gap-2 text-ink-2 text-xs">
              Status
              <Chip tone={f >= 4 ? "done" : "quiet"}>{f >= 4 ? "Wordt betaald op 15 juni" : "Open"}</Chip>
            </span>
            <span className="font-medium text-ink tabular-nums">US$ 211,20</span>
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

/* ── Partners ─────────────────────────────────────────────────────────────────────────────────── */

/** A deterministic QR-like matrix for a URL, drawn from its characters (a picture, not a real code). */
function Qr({ seed, size = 108 }: { readonly seed: string; readonly size?: number }) {
  const cells = useMemo(() => {
    const n = 21
    let h = 2166136261
    const out: Array<boolean> = []
    for (let i = 0; i < n * n; i++) {
      h = Math.imul(h ^ (seed.charCodeAt(i % seed.length) + i), 16777619)
      out.push(((h >>> 0) & 7) < 3)
    }
    const finder = (x: number, y: number) => {
      for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
        const dx = x - cx
        const dy = y - cy
        if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
          return ring !== 2
        }
      }
      return null
    }
    return { n, at: (x: number, y: number) => finder(x, y) ?? out[y * n + x] }
  }, [seed])
  const c = size / cells.n
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0 rounded-sm bg-paper"
    >
      {Array.from({ length: cells.n * cells.n }, (_, i) => {
        const x = i % cells.n
        const y = Math.floor(i / cells.n)
        return cells.at(x, y) ? <rect key={i} x={x * c} y={y * c} width={c} height={c} fill="var(--abyss)" /> : null
      })}
    </svg>
  )
}

/** A link built from a destination, with its UTM and QR code. */
export function LinkMoment({ on }: { readonly on: boolean }) {
  const { f, ref, run } = useFrame(on, 8, 800)
  const url = useTyped("northwind.co/collections/jassen?ref=priya&utm_source=instagram", run && f >= 2 && f < 5, 0)
  const full = "northwind.co/collections/jassen?ref=priya&utm_source=instagram"
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Nieuwe link" meta="Partnerportaal">
          <div className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <span className="flex flex-col gap-1 rounded-md p-3 field">
                <span className="text-ink-3 text-xs">Bestemming</span>
                <span className="text-ink text-sm">Collectie · Jassen</span>
              </span>
              <span className="flex flex-col gap-1 rounded-md p-3 field">
                <span className="text-ink-3 text-xs">Naam</span>
                <span className="text-ink text-sm">Instagram bio</span>
              </span>
            </div>
            <span className="flex flex-wrap gap-1.5">
              {["utm_source: instagram", "utm_medium: social", "utm_campaign: najaar"].map((u) => (
                <span key={u} className="rounded-sm bg-mist px-2 py-1 text-ink-2 text-xs">{u}</span>
              ))}
            </span>
            <div className="flex items-center gap-4 rounded-md bg-glacier p-3">
              <motion.div
                initial={false}
                animate={{ opacity: f >= 5 || !run ? 1 : 0.15, scale: f >= 5 || !run ? 1 : 0.94 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <Qr seed={full} size={84} />
              </motion.div>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-ink-3 text-xs">
                  <Link2 size={12} />
                  Je link
                </span>
                <span className="break-all text-ink text-xs">{run ? url : full}</span>
                <span className="flex w-fit items-center gap-1.5 rounded-sm bg-abyss px-2 py-1 text-2xs text-mesh-ink">
                  <Copy size={11} />
                  Kopiëren
                </span>
              </span>
            </div>
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

const WEEKS = "M0 62 L60 74 L120 64 L180 62 L240 54 L300 40 L360 14 L420 22"

/** What the links earned per week, the line drawing in, and each link's share. */
export function EarningsMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 6, 900)
  const drawn = f >= 1
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Wat je links deden" meta="Acht weken">
          <div className="flex flex-col gap-3 p-4">
            <svg viewBox="0 0 420 84" className="h-28 w-full" fill="none" preserveAspectRatio="none" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <line
                  key={i}
                  x1="0"
                  x2="420"
                  y1={6 + i * 24}
                  y2={6 + i * 24}
                  stroke="var(--ink-5)"
                  strokeDasharray="3 4"
                />
              ))}
              <motion.path
                d={`${WEEKS} L420 84 L0 84 Z`}
                fill="var(--arc-tint)"
                initial={false}
                animate={{ opacity: drawn ? 0.7 : 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              />
              <motion.path
                d={WEEKS}
                stroke="var(--arc)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{ pathLength: drawn ? 1 : 0 }}
                transition={{ duration: 1.1, ease: EASE }}
              />
            </svg>
            {[
              { name: "Instagram bio", conv: "312 conversies", earned: "US$ 2.763" },
              { name: "Lookbook voorjaar", conv: "148 conversies", earned: "US$ 1.382" },
              { name: "YouTube-video · Aurora-review", conv: "41 conversies", earned: "US$ 548" }
            ].map((l, i) => (
              <motion.span
                key={l.name}
                initial={false}
                animate={{ opacity: f >= 2 + i || f === 0 ? 1 : 0.25 }}
                className="flex items-center gap-3 border-hairline border-t pt-2.5"
              >
                <span className="flex size-7 items-center justify-center rounded-md bg-mist text-ink-2">
                  <Link2 size={13} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-ink text-sm">{l.name}</span>
                  <span className="text-ink-3 text-xs">{l.conv}</span>
                </span>
                <span className="font-medium text-ink text-sm tabular-nums">{l.earned}</span>
              </motion.span>
            ))}
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

const TIERS = [
  { name: "Brons", from: 0, rate: "10%" },
  { name: "Zilver", from: 100, rate: "12%" },
  { name: "Goud", from: 250, rate: "15%" }
] as const

/** The tier ladder: this quarter's conversions climbing past each threshold. */
export function TierMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 7, 700)
  const count = [0, 60, 130, 210, 290, 395, 395][f] ?? 395
  const max = 400
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Je niveau" meta="Dit kwartaal">
          <div className="flex flex-col gap-5 p-5">
            <div className="flex items-baseline justify-between">
              <span className="figure text-5xl text-ink tabular-nums">{count}</span>
              <span className="text-ink-3 text-sm">conversies</span>
            </div>
            <div className="relative h-2 rounded-full bg-ink/8">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full bg-abyss"
                initial={false}
                animate={{ width: `${(count / max) * 100}%` }}
                transition={{ duration: 0.6, ease: EASE }}
              />
              {TIERS.slice(1).map((t) => (
                <span
                  key={t.name}
                  className="absolute -top-1 h-4 w-px bg-ink/40"
                  style={{ left: `${(t.from / max) * 100}%` }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map((t, i) => {
                const reached = count >= t.from
                const current = reached && (TIERS[i + 1] === undefined || count < TIERS[i + 1]!.from)
                return (
                  <span
                    key={t.name}
                    className={cn(
                      "flex flex-col gap-1 rounded-md p-3 transition-colors duration-500",
                      current ? "bg-arc-tint" : "bg-mist"
                    )}
                  >
                    <span className={cn("text-sm", current ? "font-medium text-arc-ink" : "text-ink")}>{t.name}</span>
                    <span className={cn("text-lg tabular-nums", current ? "text-arc-ink" : "text-ink-2")}>
                      {t.rate}
                    </span>
                    <span className="text-ink-3 text-2xs">{t.from === 0 ? "Vanaf de start" : `Vanaf ${t.from}`}</span>
                  </span>
                )
              })}
            </div>
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

const PAY = ["In retourtermijn", "Goedgekeurd", "Uitbetaald"] as const

/** A month's conversions moving from the return window to approved to paid. */
export function PayoutMoment({ on }: { readonly on: boolean }) {
  const { f, ref } = useFrame(on, 7, 900)
  const stage = f < 2 ? 0 : f < 4 ? 1 : 2
  return (
    <div ref={ref}>
      <MomentFrame>
        <Panel title="Mei 2026" meta="Naar PayPal">
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-end justify-between gap-4">
              <span className="flex flex-col gap-1">
                <span className="text-ink-3 text-xs">Commissie</span>
                <span className="figure whitespace-nowrap text-4xl text-ink sm:text-5xl">US$ 1.971</span>
              </span>
              <Logo vendor="paypal" size={32} />
            </div>
            <div className="flex flex-col gap-1.5">
              {PAY.map((p, i) => (
                <span key={p} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-sm transition-colors duration-300",
                      i <= stage ? "bg-abyss text-mesh-ink" : "bg-ink/6 text-transparent"
                    )}
                  >
                    <Check size={12} />
                  </span>
                  <span className={cn("text-sm", i <= stage ? "text-ink" : "text-ink-3")}>{p}</span>
                  {i === 2 ? <span className="ml-auto text-ink-3 text-xs">15 juni</span> : null}
                </span>
              ))}
            </div>
            <span className="flex items-center gap-2 rounded-md bg-mist px-3 py-2 text-ink-2 text-xs">
              <Download size={12} />
              Factuur en overzicht per maand te downloaden
            </span>
          </div>
        </Panel>
      </MomentFrame>
    </div>
  )
}

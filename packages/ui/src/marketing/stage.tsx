import {
  AnimatePresence,
  cubicBezier,
  motion,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform
} from "motion/react"
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react"
import {
  ArrowRight,
  Check,
  Clock,
  FileText,
  type IconComponent,
  Image,
  Mail,
  MessageSquare,
  Package,
  RefreshCcw,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Truck,
  Workflow
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { Person } from "./chrome.tsx"
import { LIVE_ORDERS, type ProductKey, PRODUCTS, STORES, TEMPLATES, thumb } from "./demo-data.ts"
import { useMarketingLinks } from "./links.tsx"
import { ArrowLink, Logo, type Vendor } from "./parts.tsx"

/*
 * The overview stage, right under the hero (Calendly's pinned stage, in De Blauwdruk).
 *
 * From 768px the section is a tall runway with a sticky, viewport-high stage inside it, so the
 * page's scroll scrubs the stage instead of moving past it:
 *
 * - enter (the first 12% of the runway): the abyss panel opens from an inset card, about 72% wide
 *   with a 56px corner, to the page's edges with the hero's 16px corner, on an ease-in-out;
 * - the middle is split evenly over the five tabs: crossing a boundary changes the tab, the tab's
 *   tick fills with its segment, the card's text cross-fades, the ground shifts between brand tones,
 *   and the miniature on the right plays its sequence SCRUBBED by the segment — scrolling back
 *   reverses it exactly;
 * - exit (the last 10%): the panel eases back in a little and the page carries on.
 *
 * Everything moves through motion values (`useScroll` → `useTransform`), written straight to
 * styles or text; React renders only when the tab changes. Choosing a tab scrolls to its segment.
 *
 * On a phone, and under reduced motion, there is no runway (CSS decides, so nothing shifts): the
 * stage is an ordinary tabbed card and every miniature shows its last frame.
 */

const OPEN = cubicBezier(0.65, 0, 0.35, 1)
const ENTER = 0.12
const EXIT = 0.9

/** A 0 → 1 value over [a, b] of the segment. */
function useSpan(local: MotionValue<number>, a: number, b: number) {
  return useTransform(local, [a, b], [0, 1], { clamp: true })
}

/** Writes a motion value's text straight into a node: no render per frame. */
function useText(ref: RefObject<HTMLElement | null>, mv: MotionValue<number>, fmt: (n: number) => string) {
  useMotionValueEvent(mv, "change", (v) => {
    if (ref.current !== null) ref.current.textContent = fmt(v)
  })
  useEffect(() => {
    if (ref.current !== null) ref.current.textContent = fmt(mv.get())
  }, [ref, mv, fmt])
}

const num = (n: number) => Math.round(n).toLocaleString("nl-NL")

/* ── The miniatures, each scrubbed by `local` (0 → 1 over its tab's segment) ───────────────── */

type Mini = { readonly local: MotionValue<number> }

function Tally({ local, to, at }: { readonly local: MotionValue<number>; readonly to: number; readonly at: number }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const p = useSpan(local, at, at + 0.3)
  const v = useTransform(p, [0, 1], [0, to])
  useText(ref, v, num)
  return <span ref={ref}>{num(to)}</span>
}

function StoreRow(
  { store, i, local }: {
    readonly store: (typeof STORES)[number]
    readonly i: number
    readonly local: MotionValue<number>
  }
) {
  const on = useSpan(local, 0.08 + i * 0.16, 0.2 + i * 0.16)
  const scale = useTransform(on, [0, 1], [0.85, 1])
  return (
    <div className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2", i % 2 === 0 && "bg-mist")}>
      <span className="flex size-7 items-center justify-center rounded-sm bg-abyss text-2xs text-mesh-ink">
        {store.name.split(" ")[1]?.slice(0, 2).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-ink text-sm">{store.name}</span>
        <span className="truncate text-ink-3 text-xs">{store.domain}</span>
      </span>
      <span className="text-ink-3 text-xs">{store.currency}</span>
      {store.connected
        ? (
          <span className="relative inline-flex">
            <motion.span
              style={{ opacity: useTransform(on, (v) => 1 - v) }}
              className="rounded-sm bg-mist px-1.5 py-0.5 text-ink-2 text-xs hairline"
            >
              Koppelen
            </motion.span>
            <motion.span
              style={{ opacity: on, scale }}
              className="absolute inset-0 flex items-center justify-center gap-1 rounded-sm bg-abyss px-1.5 text-mesh-ink text-xs"
            >
              <Check size={11} />
              Gekoppeld
            </motion.span>
          </span>
        )
        : <span className="rounded-sm bg-mist px-1.5 py-0.5 text-ink-2 text-xs hairline">Koppelen</span>}
    </div>
  )
}

function MiniShopify({ local }: Mini) {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg bg-paper p-3 hairline">
        <Logo vendor="shopify" size={36} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-base text-ink">Shopify</span>
          <span className="truncate text-ink-3 text-sm">Bestellingen, producten en klanten</span>
        </span>
        <span className="flex items-center gap-1 rounded-sm bg-arc-tint px-2 py-0.5 text-arc-ink text-xs">
          <RefreshCcw size={11} />
          Synchroniseert
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg bg-paper p-1.5 hairline">
        {STORES.map((s, i) => <StoreRow key={s.name} store={s} i={i} local={local} />)}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-paper p-1 hairline">
        {([["Producten", 248, 0.45], ["Klanten", 1912, 0.55], ["Bestellingen", 3406, 0.65]] as const).map((
          [k, v, at]
        ) => (
          <div key={k} className="flex flex-col gap-0.5 px-3 py-2">
            <span className="text-ink-3 text-xs">{k}</span>
            <span className="figure text-2xl text-ink">
              <Tally local={local} to={v} at={at} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepMark({ step, local, i, lit }: {
  readonly step: (typeof TEMPLATES)[number]["steps"][number]
  readonly local: MotionValue<number>
  readonly i: number
  readonly lit: boolean
}) {
  const on = useSpan(local, 0.1 + i * 0.14, 0.2 + i * 0.14)
  const opacity = useTransform(on, [0, 1], [lit ? 0.3 : 1, 1])
  return (
    <motion.span style={{ opacity }} className="flex items-center gap-1">
      {i > 0 ? <span className="h-px w-2 bg-ink-4" /> : null}
      {step.vendor !== undefined
        ? <Logo vendor={step.vendor} size={18} />
        : (
          <span
            className={cn(
              "flex size-[18px] items-center justify-center rounded-sm",
              step.ai === true ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-3"
            )}
          >
            {step.ai === true ? <Sparkles size={10} /> : <Workflow size={10} />}
          </span>
        )}
    </motion.span>
  )
}

function Switch({ on }: { readonly on: MotionValue<number> }) {
  const x = useTransform(on, [0, 1], [0, 16])
  return (
    <span className="relative h-5 w-9 shrink-0 overflow-hidden rounded-full bg-ink-5">
      <motion.span style={{ opacity: on }} className="absolute inset-0 bg-arc" />
      <motion.span style={{ x }} className="absolute top-0.5 left-0.5 size-4 rounded-full bg-paper" />
    </span>
  )
}

function TemplateRow(
  { t, i, local }: { readonly t: (typeof TEMPLATES)[number]; readonly i: number; readonly local: MotionValue<number> }
) {
  const focus = i === 2
  const fixed = useMotionValue(i < 2 ? 1 : 0)
  const flip = useSpan(local, 0.7, 0.82)
  const on = focus ? flip : fixed
  const after = useTransform(flip, (v) => 1 - v)
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md px-3 py-2.5",
        focus ? "bg-arc-tint/60" : i % 2 === 1 && "bg-mist"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-ink text-sm">{t.name}</span>
        <Switch on={on} />
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          {t.steps.map((s, k) => <StepMark key={k} step={s} i={k} local={local} lit={focus} />)}
        </span>
        <span className="relative min-w-0 flex-1 truncate text-ink-3 text-xs">
          {focus
            ? (
              <>
                <motion.span style={{ opacity: after }} className="block truncate">{t.evidence}</motion.span>
                <motion.span style={{ opacity: flip }} className="absolute inset-0 truncate text-arc-ink">
                  Aan · eerste uitvoering bij het volgende geschil
                </motion.span>
              </>
            )
            : t.evidence ?? `${t.steps.length} stappen`}
        </span>
      </div>
    </div>
  )
}

function MiniAutomations({ local }: Mini) {
  return (
    <div className="flex w-full max-w-[440px] flex-col gap-1 rounded-lg bg-paper p-1.5 hairline">
      {TEMPLATES.slice(0, 5).map((t, i) => <TemplateRow key={t.id} t={t} i={i} local={local} />)}
    </div>
  )
}

function MiniOrders({ local }: Mini) {
  const flag = useSpan(local, 0.2, 0.38)
  const flagScale = useTransform(flag, [0, 1], [0.8, 1])
  const offer = useSpan(local, 0.55, 0.75)
  const offerY = useTransform(offer, [0, 1], [12, 0])
  const rows: ReadonlyArray<{ n: string; who: string; p: ProductKey; total: string; late?: boolean }> = [
    ...LIVE_ORDERS.slice(0, 3).map((o) => ({ n: o.number, who: o.who, p: o.product, total: o.total })),
    { n: "SO-12231", who: "Hannah Schmidt", p: "fleece", total: "€ 314", late: true },
    { n: "SO-12236", who: "Daniel Brown", p: "crewneck", total: "€ 96", late: true }
  ]
  return (
    <div className="flex w-full max-w-[440px] flex-col gap-2">
      <div className="flex flex-col gap-0.5 rounded-lg bg-paper p-1.5 hairline">
        {rows.map((o) => (
          <div key={o.n} className="relative flex items-center gap-2.5 rounded-md px-2 py-1.5">
            {o.late === true
              ? (
                <motion.span
                  aria-hidden
                  style={{ opacity: flag }}
                  className="absolute inset-0 rounded-md bg-arc-tint/60"
                />
              )
              : null}
            <img
              src={thumb(PRODUCTS[o.p].img)}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              decoding="async"
              className="relative size-8 shrink-0 rounded-md bg-mist object-cover"
            />
            <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-ink text-sm">
                <span className="font-medium tabular-nums">{o.n}</span> · {o.who}
              </span>
              <span className="truncate text-ink-3 text-xs">{PRODUCTS[o.p].title}</span>
            </span>
            {o.late === true
              ? (
                <motion.span
                  style={{ opacity: flag, scale: flagScale }}
                  className="relative rounded-sm bg-paper px-1.5 py-0.5 text-arc-ink text-xs hairline"
                >
                  Vertraagd
                </motion.span>
              )
              : <span className="relative rounded-sm bg-mist px-1.5 py-0.5 text-ink-2 text-xs">Betaald</span>}
            <span className="relative w-12 text-right text-ink text-sm tabular-nums">{o.total}</span>
          </div>
        ))}
      </div>
      <motion.div
        style={{ opacity: offer, y: offerY }}
        className="flex items-center gap-2.5 rounded-lg bg-abyss px-3 py-2.5 text-mesh-ink"
      >
        <Sparkles size={14} className="shrink-0" />
        <span className="flex-1 text-sm">3 bestellingen bij Allure lopen achter. Het bericht staat klaar.</span>
        <span className="shrink-0 rounded-md bg-mesh-ink/16 px-2.5 py-1 font-medium text-mesh-ink text-xs chalk-line">
          Allure aansporen
        </span>
      </motion.div>
    </div>
  )
}

const THREADS: ReadonlyArray<{ who: string; via: Vendor; title: string; on?: true }> = [
  { who: "SK", via: "gmail", title: "Waar blijft mijn pakket?", on: true },
  { who: "HS", via: "gmail", title: "Regenjas retourneren" },
  { who: "DB", via: "shopify", title: "Factuur voor SO-12218" }
]

const DRAFT =
  "Hoi Sofía, je pakket is gisteren door DHL gescand in Utrecht en wordt morgen bezorgd. Hier is je track & trace."

function MiniInbox({ local }: Mini) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const chars = useTransform(local, [0.12, 0.85], [0, DRAFT.length], { clamp: true })
  useText(ref, chars, (n) => DRAFT.slice(0, Math.round(n)))
  const ready = useSpan(local, 0.86, 0.95)
  return (
    <div className="grid w-full max-w-[460px] grid-cols-[150px_1fr] overflow-hidden rounded-lg bg-paper hairline">
      <div className="flex flex-col gap-0.5 bg-mist p-1.5">
        {THREADS.map((t) => (
          <div
            key={t.who}
            className={cn("flex items-start gap-2 rounded-md p-2", t.on === true && "bg-paper hairline")}
          >
            <span className="relative">
              <Person initials={t.who} size={22} tone={t.on === true ? "tint" : "mist"} />
              <span className="absolute -right-1 -bottom-1">
                <Logo vendor={t.via} size={11} />
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate text-ink text-xs leading-snug">{t.title}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        <div className="rounded-md bg-mist px-3 py-2 text-ink-2 text-xs">
          Mijn bestelling SO-12212 zou er gisteren zijn. Weet je waar hij is?
        </div>
        <div className="flex flex-col gap-2 rounded-md bg-arc-tint p-3">
          <span className="flex items-center gap-1.5 font-medium text-arc-ink text-xs">
            <Sparkles size={12} />
            Concept van Insyte, in jouw toon
          </span>
          <p className="min-h-[4.5em] text-ink text-xs leading-relaxed">
            <span ref={ref}>{DRAFT}</span>
          </p>
          <motion.span style={{ opacity: ready }} className="flex gap-1">
            <span className="flex items-center gap-1 rounded-sm bg-abyss px-2 py-1 font-medium text-mesh-ink text-xs">
              <Check size={11} />
              Versturen
            </span>
            <span className="rounded-sm bg-paper px-2 py-1 font-medium text-ink text-xs">Bewerken</span>
          </motion.span>
        </div>
      </div>
    </div>
  )
}

const PACK: ReadonlyArray<{ Icon: IconComponent; name: string }> = [
  { Icon: FileText, name: "Orderbon SO-12218" },
  { Icon: Truck, name: "Scan van de vervoerder" },
  { Icon: Image, name: "Bezorgfoto" },
  { Icon: MessageSquare, name: "Twee antwoorden van de klant" },
  { Icon: Package, name: "Oorspronkelijke factuur" }
]

function PackRow(
  { item, i, local }: { readonly item: (typeof PACK)[number]; readonly i: number; readonly local: MotionValue<number> }
) {
  const on = useSpan(local, 0.08 + i * 0.15, 0.18 + i * 0.15)
  const scale = useTransform(on, [0, 1], [0.6, 1])
  const ink = useTransform(on, [0, 1], [0.45, 1])
  return (
    <div className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2", i % 2 === 0 && "bg-mist")}>
      <item.Icon size={14} className="text-ink-3" />
      <motion.span style={{ opacity: ink }} className="flex-1 text-ink text-sm">{item.name}</motion.span>
      <span className="relative flex size-4 items-center justify-center rounded-sm bg-ink-5">
        <motion.span
          style={{ opacity: on, scale }}
          className="absolute inset-0 flex items-center justify-center rounded-sm bg-abyss text-mesh-ink"
        >
          <Check size={10} />
        </motion.span>
      </span>
    </div>
  )
}

function MiniChargeback({ local }: Mini) {
  const count = useRef<HTMLSpanElement | null>(null)
  const clock = useRef<HTMLSpanElement | null>(null)
  const done = useTransform(local, [0.08, 0.83], [0, PACK.length], { clamp: true })
  const minutes = useTransform(local, [0, 1], [14, 10])
  useText(count, done, (n) => String(Math.floor(n + 0.001)))
  useText(clock, minutes, (m) => `4u ${String(Math.round(m)).padStart(2, "0")}m`)
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-2">
      <div className="flex items-center gap-3 rounded-lg bg-paper p-3 hairline">
        <Logo vendor="klarna" size={34} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="font-medium text-ink text-sm">DSP-2214 · Niet-geautoriseerd</span>
          <span className="text-ink-3 text-xs">Daniel Brown · €248,00</span>
        </span>
        <span className="flex items-center gap-1 rounded-sm bg-arc-tint px-1.5 py-0.5 text-arc-ink text-xs tabular-nums">
          <Clock size={11} />
          <span ref={clock}>4u 10m</span>
        </span>
      </div>
      <div className="flex flex-col gap-0.5 rounded-lg bg-paper p-1.5 hairline">
        {PACK.map((item, i) => <PackRow key={item.name} item={item} i={i} local={local} />)}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-abyss px-3 py-2.5 text-mesh-ink">
        <span className="flex items-center gap-1.5 text-sm tabular-nums">
          <Sparkles size={13} />
          Bewijspakket <span ref={count}>{PACK.length}</span> van {PACK.length}
        </span>
        <span className="rounded-md bg-mesh-ink/16 px-2.5 py-1 font-medium text-mesh-ink text-xs chalk-line">
          Controleren en indienen
        </span>
      </div>
    </div>
  )
}

/* ── The stage ─────────────────────────────────────────────────────────────────────────────── */

type Tab = {
  readonly id: string
  readonly label: string
  readonly icon: IconComponent | Vendor
  readonly title: string
  readonly body: string
  readonly points: readonly [string, string]
  readonly cta: string
  readonly path: string
  readonly Mini: (p: Mini) => ReactNode
}

const TABS: ReadonlyArray<Tab> = [
  {
    id: "shopify",
    label: "Shopify",
    icon: "shopify",
    title: "Je Shopify-winkels, met één klik gekoppeld.",
    body:
      "Insyte leest bestellingen, klanten, producten en verzendingen via Shopify. Meerdere winkels naast elkaar, elk in zijn eigen valuta.",
    points: [
      "Koppelen met OAuth, geen exportbestanden",
      "Shopify blijft de bron; Insyte schrijft alleen binnen jouw regels"
    ],
    cta: "Winkels bekijken",
    path: "/settings/stores",
    Mini: MiniShopify
  },
  {
    id: "automations",
    label: "Automatiseringen",
    icon: Workflow,
    title: "Automatiseringen die je aanzet, niet bouwt.",
    body:
      "Kies een sjabloon of beschrijf wat er moet gebeuren. Elke stap draait op een dienst die je al gebruikt, en niets draait voordat jij het aanzet.",
    points: ["Sjablonen voor late leveringen, chargebacks en voorraad", "AI-stappen schrijven, jij keurt goed"],
    cta: "Automatiseringen bekijken",
    path: "/automations",
    Mini: MiniAutomations
  },
  {
    id: "orders",
    label: "Bestellingen",
    icon: ShoppingBag,
    title: "Elke bestelling, en wat er misgaat.",
    body:
      "Bestellingen uit al je winkels in één lijst, met de leverancier erbij. Loopt er een uit, dan staat het bericht aan de leverancier al klaar.",
    points: ["Vertraagde bestellingen bovenaan", "Leverancier aansporen in één keer"],
    cta: "Bestellingen bekijken",
    path: "/orders",
    Mini: MiniOrders
  },
  {
    id: "inbox",
    label: "Klantenservice",
    icon: Mail,
    title: "Je inbox, met het antwoord erbij.",
    body:
      "Insyte leest de klant, de bestelling en eerdere tickets, en zet een concept in jouw toon onder het bericht. Jij verstuurt, past aan of negeert.",
    points: ["Elk feit met zijn bron erbij", "Concepten in de stem van je merk"],
    cta: "Inbox bekijken",
    path: "/inbox",
    Mini: MiniInbox
  },
  {
    id: "chargebacks",
    label: "Chargebacks",
    icon: ShieldAlert,
    title: "Bewijs dat zichzelf verzamelt.",
    body:
      "Opent een klant een geschil bij Klarna, Stripe of PayPal, dan verzamelt Insyte de orderbon, de scan, de bezorgfoto en het gesprek, ruim voor de deadline.",
    points: ["Deadline in beeld vanaf de eerste minuut", "Indienen gebeurt pas na jouw controle"],
    cta: "Chargebacks bekijken",
    path: "/chargebacks",
    Mini: MiniChargeback
  }
]

/* The ground per tab: the same abyss family, shifted — abyss or abyss-2, and a faint arc wash at a
   different place each time (a wash at a few percent, never a glow). Cross-faded with the tab. */
const GROUNDS: ReadonlyArray<string> = [
  "bg-abyss [background-image:radial-gradient(60%_70%_at_20%_100%,color-mix(in_oklch,var(--arc)_16%,transparent),transparent)]",
  "bg-abyss-2 [background-image:radial-gradient(55%_60%_at_85%_10%,color-mix(in_oklch,var(--arc)_14%,transparent),transparent)]",
  "bg-abyss [background-image:radial-gradient(70%_60%_at_50%_0%,color-mix(in_oklch,var(--arc)_12%,transparent),transparent)]",
  "bg-abyss-2 [background-image:radial-gradient(60%_70%_at_10%_20%,color-mix(in_oklch,var(--arc)_14%,transparent),transparent)]",
  "bg-abyss [background-image:radial-gradient(65%_65%_at_90%_90%,color-mix(in_oklch,var(--arc)_16%,transparent),transparent)]"
]

function TabIcon({ icon, active }: { readonly icon: Tab["icon"]; readonly active: boolean }) {
  if (typeof icon === "string") return <Logo vendor={icon as Vendor} size={18} />
  const Icon = icon
  return <Icon size={16} className={active ? "text-mesh-ink" : "text-mesh-ink-2"} />
}

/** Whether the runway is live: from 768px and with motion allowed. Read after mount only. */
function usePinned() {
  const reduced = useReducedMotion() === true
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const q = window.matchMedia("(min-width: 768px)")
    const on = () => setWide(q.matches)
    on()
    q.addEventListener("change", on)
    return () => q.removeEventListener("change", on)
  }, [])
  return wide && !reduced
}

export function Stage() {
  const links = useMarketingLinks()
  const runway = useRef<HTMLDivElement | null>(null)
  const pinned = usePinned()
  const [index, setIndex] = useState(0)
  const base = useId()

  const { scrollYProgress: p } = useScroll({ target: runway, offset: ["start start", "end end"] })

  /* Enter, hold, exit: inset a side and from the top, and the corner. */
  const side = useTransform(p, [0, ENTER, EXIT, 1], [14, 0, 0, 2.5], { ease: [OPEN, (t) => t, OPEN] })
  const top = useTransform(p, [0, ENTER, EXIT, 1], [7, 0, 0, 2.5], { ease: [OPEN, (t) => t, OPEN] })
  const round = useTransform(p, [0, ENTER, EXIT, 1], [56, 16, 16, 28], { ease: [OPEN, (t) => t, OPEN] })
  const clipPath = useTransform(
    [side, top, round],
    ([s, t, r]) => `inset(${t as number}% ${s as number}% ${t as number}% ${s as number}% round ${r as number}px)`
  )

  /* Where the tabs are: the middle of the runway, split evenly. */
  const at = (v: number) => ((v - ENTER) / (EXIT - ENTER)) * TABS.length
  const one = useMotionValue(1)
  const scrub = useTransform(p, (v) => {
    const x = at(v)
    const i = Math.min(TABS.length - 1, Math.max(0, Math.floor(x)))
    return Math.min(1, Math.max(0, x - i))
  })
  const local = pinned ? scrub : one

  useMotionValueEvent(p, "change", (v) => {
    if (!pinned) return
    const i = Math.min(TABS.length - 1, Math.max(0, Math.floor(at(v))))
    setIndex((cur) => (cur === i ? cur : i))
  })

  const select = (i: number) => {
    const node = runway.current
    if (!pinned || node === null) {
      setIndex(i)
      return
    }
    const startY = node.getBoundingClientRect().top + window.scrollY
    const length = node.offsetHeight - window.innerHeight
    const target = ENTER + ((i + 0.5) / TABS.length) * (EXIT - ENTER)
    window.scrollTo({ top: startY + target * length, behavior: "smooth" })
  }

  const tab = TABS[index]!

  return (
    <section id="product" aria-labelledby="stage-kop" className="bg-paper">
      <div className="mx-auto max-w-[1180px] px-4 pt-20 pb-12 text-center sm:px-8 sm:pt-24 sm:pb-14">
        <h2 id="stage-kop" className="mx-auto max-w-[22ch] font-medium text-4xl text-ink sm:text-display-sm">
          Alles van je winkel op één plek.
          <span className="block text-ink-3">De agent doet het werk, jij houdt de regie.</span>
        </h2>
      </div>
      {/* The runway: about a screen per tab plus the way in and out, from 768px and with motion. */}
      <div ref={runway} className="relative md:h-[600svh] motion-reduce:md:h-auto">
        <div className="px-2 sm:px-3 md:sticky md:top-16 md:flex md:h-[calc(100svh-4rem)] md:items-center md:py-3 motion-reduce:md:static motion-reduce:md:h-auto">
          <motion.div
            data-ground="dark"
            style={{ clipPath: pinned ? clipPath : "none", willChange: pinned ? "clip-path" : "auto" }}
            className="chapter relative isolate w-full overflow-hidden rounded-xl md:h-full"
          >
            {GROUNDS.map((g, i) => (
              <div
                key={i}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 -z-20 transition-opacity duration-700 ease-[var(--ease-out-quart)]",
                  g,
                  i === index ? "opacity-100" : "opacity-0"
                )}
              />
            ))}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 drafting-chalk" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 hatch-chalk [mask-image:radial-gradient(60%_55%_at_50%_55%,transparent_40%,black_100%)]"
            />
            <div className="mx-auto flex h-full max-w-[1180px] flex-col items-center justify-center gap-7 px-3 py-10 sm:px-8">
              <div
                role="tablist"
                aria-label="Onderdelen van Insyte"
                className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl bg-mesh-ink/[0.07] p-1"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                  e.preventDefault()
                  const next = (index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length
                  select(next)
                  if (!pinned) setIndex(next)
                  document.getElementById(`${base}-tab-${next}`)?.focus()
                }}
              >
                {TABS.map((t, i) => {
                  const active = i === index
                  return (
                    <button
                      key={t.id}
                      id={`${base}-tab-${i}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`${base}-panel`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => select(i)}
                      className={cn(
                        "relative flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 font-medium text-sm transition-colors",
                        active ? "text-mesh-ink" : "text-mesh-ink-2 hover:text-mesh-ink"
                      )}
                    >
                      {active
                        ? (
                          <motion.span
                            layoutId={`${base}-pill`}
                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                            className="absolute inset-0 -z-10 overflow-hidden rounded-lg bg-mesh-ink/[0.16] chalk-line"
                          >
                            {pinned
                              ? (
                                <motion.span
                                  className="absolute inset-x-3 bottom-1 h-0.5 origin-left rounded-full bg-mesh-ink/70"
                                  style={{ scaleX: scrub }}
                                />
                              )
                              : null}
                          </motion.span>
                        )
                        : null}
                      <TabIcon icon={t.icon} active={active} />
                      {t.label}
                    </button>
                  )
                })}
              </div>

              <div
                id={`${base}-panel`}
                role="tabpanel"
                aria-labelledby={`${base}-tab-${index}`}
                className="grid w-full max-w-[1080px] overflow-hidden rounded-xl bg-mesh-ink/[0.06] text-mesh-ink chalk-line md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
              >
                <div className="relative min-h-[300px] p-7 text-left sm:p-10 md:min-h-[460px]">
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={tab.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 flex flex-col justify-center gap-5 p-7 sm:p-10"
                    >
                      <h3 className="font-medium text-2xl text-mesh-ink sm:text-3xl">{tab.title}</h3>
                      <p className="max-w-[44ch] text-md text-mesh-ink-2">{tab.body}</p>
                      <ul className="flex flex-col gap-2">
                        {tab.points.map((pt) => (
                          <li key={pt} className="flex items-start gap-2 text-base text-mesh-ink">
                            <Check size={15} className="mt-0.5 shrink-0 text-mesh-ink-2" />
                            {pt}
                          </li>
                        ))}
                      </ul>
                      <ArrowLink href={links.inApp(tab.path)} external onDark className="w-fit">{tab.cta}</ArrowLink>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div
                  aria-hidden
                  inert
                  className="relative m-2 flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg bg-glacier p-6 sm:m-3 sm:p-10"
                >
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, color-mix(in oklch, var(--ink) 5%, transparent) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, color-mix(in oklch, var(--ink) 5%, transparent) 0 1px, transparent 1px 32px)"
                    }}
                  />
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={tab.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="relative flex w-full justify-center"
                    >
                      <tab.Mini local={local} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-mesh-ink-2 text-sm">
                <ArrowRight size={13} />
                Getekend op Northwind Clothing Co., de demowinkel van de console.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
